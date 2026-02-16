// 主逻辑模块
import { CONFIG } from './config.js';
import { WebSocketManager } from './websocketManager.js';
import { DOMManager } from './domManager.js';
import { delay, randomDelay, setWsManager, log, debug, info, warn, error } from './utils.js';

export class AIChatForwarder {
    constructor() {
        console.log('🔍 [DEBUG] AIChatForwarder constructor starting...');
        try {
            this.wsManager = new WebSocketManager(CONFIG.wsServer, this);
            console.log('🔍 [DEBUG] wsManager created');
            setWsManager(this.wsManager);
            this.domManager = new DOMManager(this);
            console.log('🔍 [DEBUG] domManager created:', !!this.domManager);
        } catch (e) {
            console.error('❌ [ERROR] Constructor failed:', e);
        }
        this.ws = null;
        this.clientId = null;
        this.isConnected = false;
        this.currentRequestId = null;
        this.pendingRequests = new Map();
        this.retryCount = 0;
        this.isProcessing = false;
        this.observer = null;

        // Start init but don't block constructor
        this.init().catch(async (e) => {
            console.error('❌ [ERROR] Init failed:', e);
        });
    }

    async init() {
        console.log('🤖 AI聊天转发器初始化...');

        try {
            // 等待页面加载完成
            if (document.readyState === 'loading') {
                await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
            }
            
            // 启动fetch拦截（仅在Arena.ai）
            this.initFetchInterceptor();
            
            await this.start();
        } catch (error) {
            console.error('❌ 初始化失败:', error);
            this.scheduleRetry();
            throw error;
        }
    }

    initFetchInterceptor() {
        const hostname = window.location.hostname;
        if (!hostname.includes('arena.ai')) {
            return;
        }

        // Skip if already intercepted
        if (window.__aiprox_intercepted) {
            return;
        }
        window.__aiprox_intercepted = true;
        
        const originalFetch = window.fetch;
        
        window.fetch = async (...args) => {
            const url = args[0] instanceof Request ? args[0].url : args[0];
            
            // Only intercept streaming API requests
            if (typeof url === 'string' && url.includes('/nextjs-api/stream/create-evaluation')) {
                // Silently pass through without logging in production
                try {
                    const response = await originalFetch(...args);
                    return response;
                } catch (error) {
                    throw error;
                }
            }
            
            // Pass through non-target requests
            return originalFetch(...args);
        };
        
        console.log('✅ [FETCH] Arena.ai fetch拦截器已启动');
    }

    async start() {
        try {
            // 初始化DOM元素监听
            await this.initDOMListeners();

            // 连接WebSocket服务器
            await this.wsManager.connect();

            // 启动心跳检测
            this.startHeartbeat();

            console.log('✅ AI聊天转发器启动完成');
        } catch (error) {
            console.error('❌ 初始化失败:', error);
            this.scheduleRetry();
            throw error;
        }
    }

    async initDOMListeners() {
        console.log('🔍 初始化DOM监听器...');
        // 添加随机等待，模拟页面加载过程
        await randomDelay(500, 2000);
        await this.domManager.waitForElement(CONFIG.selectors.pageReadyIndicator);
        console.log('✅ 页面已就绪:', CONFIG.selectors.pageReadyIndicator);

        // 设置MutationObserver监听消息变化
        console.log('🔧 设置MutationObserver监听消息变化');
        await randomDelay(300, 800);
        this.domManager.setupMessageObserver();

        console.log('🔍 DOM监听器初始化完成');
    }

    async handleCompletionRequest(requestData) {
        console.log('🔍 [DEBUG] handleCompletionRequest called, isProcessing:', this.isProcessing, 'domManager:', !!this.domManager);
        
        if (!this.domManager) {
            console.error('❌ [ERROR] domManager is undefined!');
            this.wsManager.sendErrorResponse(requestData.request_id, 'internal_error', '客户端未初始化完成');
            return;
        }
        
        if (this.isProcessing) {
            const timeSinceLastRequest = Date.now() - (this.lastRequestTime || 0);
            if (timeSinceLastRequest > 180000) {
                console.log('⚠️ 检测到超时的请求，重置状态');
                this.isProcessing = false;
                this.currentRequestId = null;
            } else {
                console.warn('⚠️ 正在处理其他请求，拒绝新请求');
                this.wsManager.sendErrorResponse(requestData.request_id, 'busy', '客户端正忙');
                return;
            }
        }

        this.isProcessing = true;
        this.lastRequestTime = Date.now();
        this.currentRequestId = requestData.request_id;

        console.log('📨 收到补全请求:', requestData.request_id);

        try {
            // 提取对话历史
            const conversation = this.extractConversation(requestData.messages);
            console.log('📋 对话历史数量:', conversation.length);

            // 提取系统消息和最后一个用户消息
            const systemMsg = conversation.find(m => m.role === 'system');
            const userMsgs = conversation.filter(m => m.role === 'user');
            const userMsg = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1] : null;

            // 构建组合内容（markdown格式）
            let combinedContent = '';

            if (systemMsg) {
                combinedContent += '# Your Role\n\n';
                combinedContent += systemMsg.content || '';
                combinedContent += '\n\n';
            } else {
                // 如果没有系统消息，添加默认角色说明
                combinedContent += 'IMPORTANT: When you finish your response, you MUST return a valid JSON object.\n';
                combinedContent += 'Use format: {"content": "your response", "finish_reason": "stop"}\n';
                combinedContent += 'Or for tool calls: {"content": "", "finish_reason": "tool_calls", "tool_calls": [...]}\n';
                combinedContent += 'You can wrap the JSON in ```json code blocks if desired.\n\n';
            }

            // 添加支持的工具列表（如果有）
            if (requestData.tools && requestData.tools.length > 0) {
                combinedContent += '# Supported Tools\n\n';
                combinedContent += '```json\n';
                combinedContent += JSON.stringify(requestData.tools, null, 2);
                combinedContent += '\n```\n\n';
            }

            if (userMsg) {
                combinedContent += '# Your Task\n\n';
                combinedContent += userMsg.content || '';
            }

            console.log('📝 系统消息:', systemMsg ? '有' : '无');
            console.log('📝 用户消息:', userMsg ? '有' : '无');
            console.log('📝 工具数量:', requestData.tools?.length || 0);
            console.log('📝 组合内容长度:', combinedContent.length);

            // 如果没有用户消息，返回错误
            if (!userMsg) {
                console.error('❌ 未找到用户消息');
                this.wsManager.sendErrorResponse(requestData.request_id, 'error', '未找到用户消息');
                this.isProcessing = false;
                return;
            }

            // 获取基准内容
            const baselineContent = this.domManager.getLatestMessage();
            console.log('📊 基准内容:', baselineContent?.substring(0, 30));

            // 等待输入框可用
            console.log('⏳ 等待输入框加载...');
            const inputBox = await this.domManager.waitForElement(CONFIG.selectors.inputBox);
            console.log('✅ 输入框已加载');

            // 清空并填写组合消息
            console.log('✍️ 填写组合消息:', combinedContent?.substring(0, 50));
            await this.domManager.fillInputBox(inputBox, combinedContent);

            // 点击发送按钮前等待
            await randomDelay(500, 2000);

            // 点击发送按钮
            console.log('🖱️ 点击发送按钮');
            await this.domManager.clickSendButton();

            // 等待AI响应（添加随机性）
            console.log('⏳ 等待AI响应...');
            await randomDelay(500, 1500);
            const response = await this.domManager.waitForAIResponse(baselineContent);

            if (response) {
                console.log('🔍 [DEBUG] response:', JSON.stringify(response).substring(0, 200));
                
                let finalContent = '';
                if (response && typeof response === 'object') {
                    if (response.content !== undefined) {
                        finalContent = String(response.content == null ? '' : response.content);
                    } else {
                        finalContent = String(response);
                    }
                } else if (response) {
                    finalContent = String(response);
                }
                
                const toolCalls = response?.tool_calls || null;

                // Normalize tool_calls to OpenAI format (wrap name/arguments in function object)
                let normalizedToolCalls = null;
                if (toolCalls && toolCalls.length > 0) {
                    normalizedToolCalls = toolCalls.map((tc, index) => {
                        if (tc.function) {
                            // Already in OpenAI format
                            return tc;
                        }
                        // Convert from {name, arguments} to {function: {name, arguments}}
                        return {
                            id: tc.id || `call_${Date.now()}_${index}`,
                            type: tc.type || 'function',
                            function: {
                                name: tc.name || '',
                                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {})
                            }
                        };
                    });
                }

                console.log('✅ AI响应已获取, content长度:', finalContent.length, 'tool_calls:', normalizedToolCalls ? normalizedToolCalls.length : 0);

                if (normalizedToolCalls && normalizedToolCalls.length > 0) {
                    console.log('📤 发送AI响应（含tool_calls）');
                    this.wsManager.sendCompletionResponse(requestData.request_id, finalContent, normalizedToolCalls);
                } else {
                    console.log('📤 发送AI响应');
                    this.wsManager.sendCompletionResponse(requestData.request_id, finalContent);
                }
            } else {
                console.error('❌ AI响应为空');
                this.wsManager.sendErrorResponse(requestData.request_id, 'error', 'AI响应为空');
            }

        } catch (error) {
            console.error('❌ 处理请求失败:', error.message);
            this.wsManager.sendErrorResponse(requestData.request_id, 'error', error.message);
        }

        this.isProcessing = false;
    }

    extractConversation(messages) {
        return messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }

    scheduleRetry() {
        if (this.retryCount >= CONFIG.retry.maxAttempts) {
            console.error('❌ 达到最大重试次数，停止重连');
            return;
        }

        this.retryCount++;
        const retryDelay = CONFIG.timeouts.reconnect * this.retryCount;

        console.log(`🔄 ${this.retryCount}/${CONFIG.retry.maxAttempts} 将在 ${retryDelay}ms 后重连`);

        setTimeout(() => {
            this.wsManager.connect().catch(error => {
                console.error('❌ 重连失败:', error);
                this.scheduleRetry();
            });
        }, retryDelay);
    }

    startHeartbeat() {
        // 服务器会发送心跳，客户端只需响应
        console.log('💓 心跳检测已启动');
    }

    // 清理资源
    destroy() {
        this.domManager.disconnectObserver();
        this.wsManager.close();
        console.log('🧹 AI聊天转发器已清理');
    }
}

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (window.aiForwarder) {
        window.aiForwarder.destroy();
    }
});

// 启动转发器
window.aiForwarder = new AIChatForwarder();