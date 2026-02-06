// 主逻辑模块
import { CONFIG } from './config.js';
import { WebSocketManager } from './websocketManager.js';
import { DOMManager } from './domManager.js';
import { delay, setWsManager, log, debug, info, warn, error } from './utils.js';

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
        this.init().catch(e => {
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
            
            await this.start();
        } catch (error) {
            console.error('❌ 初始化失败:', error);
            this.scheduleRetry();
            throw error;
        }
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
        await this.domManager.waitForElement(CONFIG.selectors.pageReadyIndicator);
        console.log('✅ 页面已就绪:', CONFIG.selectors.pageReadyIndicator);

        // 设置MutationObserver监听消息变化
        console.log('🔧 设置MutationObserver监听消息变化');
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

            // 获取基准内容
            let baselineContent = this.domManager.getLatestMessage();
            console.log('📊 基准内容:', baselineContent?.substring(0, 30));

            // 处理对话（跳过系统消息，因为浏览器AI已有上下文）
            let allResponses = '';
            let userMessageSent = false;
            
            for (let i = 0; i < conversation.length; i++) {
                const msg = conversation[i];
                
                // 只处理用户消息
                if (msg.role !== 'user') {
                    continue;
                }
                
                userMessageSent = true;
                console.log('📝 发送用户消息', i + 1, '/', conversation.length);

                // 等待输入框可用
                console.log('⏳ 等待输入框加载...');
                const inputBox = await this.domManager.waitForElement(CONFIG.selectors.inputBox);
                console.log('✅ 输入框已加载');

                // 清空并填写消息
                console.log('✍️ 填写消息:', msg.content?.substring(0, 50));
                await this.domManager.fillInputBox(inputBox, msg.content);

                // 点击发送按钮前等待
                await delay(1000);

                // 点击发送按钮
                console.log('🖱️ 点击发送按钮');
                await this.domManager.clickSendButton();

                // 等待AI响应
                console.log('⏳ 等待AI响应...');
                const response = await this.domManager.waitForAIResponse(baselineContent);
                console.log('✅ AI响应已获取:', response?.substring(0, 30));

                if (response) {
                    allResponses += response + '\n\n';
                }

                // 更新基准内容
                baselineContent = response;
            }

            // 如果没有发送任何消息，返回错误
            if (!userMessageSent) {
                console.error('❌ 未找到用户消息');
                this.wsManager.sendErrorResponse(requestData.request_id, 'error', '未找到用户消息');
                this.isProcessing = false;
                return;
            }

            // 发送最终响应
            const finalResponse = allResponses.trim();
            console.log('📤 发送最终响应:', finalResponse?.substring(0, 50));
            this.wsManager.sendCompletionResponse(requestData.request_id, finalResponse);

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