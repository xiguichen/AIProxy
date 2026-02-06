// ==UserScript==
// @name         OpenAI API WebSocket Forwarder
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  将OpenAI API请求转发到网页AI服务的油猴脚本
// @author       Assistant
// @match        https://chat.openai.com/*
// @match        https://*.openai.com/*
// @match        https://claude.ai/*
// @match        https://yuanbao.tencent.com/*
// @match        https://arena.ai/*
// @grant        none
// @connect      localhost
// @connect      127.0.0.1
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // File: config.js
    // 配置模块
    
    /**
     * 不同网站的CSS选择器配置
     * 可根据具体网站结构调整这些选择器
     */
    const WEBSITE_SELECTORS = {
        // ChatGPT
        'chat.openai.com': {
            inputBox: ['#prompt-textarea'],
            sendButton: ['button[data-testid="send-button"]'],
            pageReadyIndicator: ['[data-testid="conversation"]', 'main'],
            messageListContainer: ['[data-testid="conversation"]'],
            latestMessage: ['[data-testid="conversation"] .group:last-child .text-gray-400']
        },
    
        // Claude.ai
        'claude.ai': {
            inputBox: ['.prose textarea'],
            sendButton: ['button:has(svg)'],
            pageReadyIndicator: ['.chat-messages', 'main'],
            messageListContainer: ['.chat-messages'],
            latestMessage: ['.ai-message:last-child']
        },
    
        // Arena.ai
        'arena.ai': {
            inputBox: ['textarea.arena-input'],
            sendButton: ['button.arena-send'],
            pageReadyIndicator: ['.arena-messages'],
            messageListContainer: ['.arena-messages'],
            latestMessage: ['.arena-message:last-child']
        },
    
        // Yuanbao (腾讯元宝)
        'yuanbao.tencent.com': {
            inputBox: [
                '.agent-chat__input-box .ql-editor',
                '#search-bar .ql-editor',
                '.chat-input-editor .ql-editor[contenteditable="true"]'
            ],
            sendButton: [
                '#yuanbao-send-btn',
            ],
            pageReadyIndicator: [
                '.agent-chat__input-box',
                '#chat-content'
            ],
            messageListContainer: [
                '.agent-chat__list',
                '#chat-content'
            ],
            latestMessage: [
                '.agent-chat__list__item--ai:last-child .agent-chat__bubble__content',
                '.agent-chat__list__item--ai:last-child'
            ]
        },
    
        // 通用配置
        'default': {
            inputBox: [
                'textarea[role="textbox"]',
                '.chat-input textarea',
                'input[type="text"]'
            ],
            sendButton: [
                'button:contains("发送")',
                'button:contains("Send")',
                '.send-button'
            ],
            pageReadyIndicator: [
                '.message-container',
                '.chat-container',
                '#chat-messages',
                'main'
            ],
            messageListContainer: [
                '.message-container',
                '.chat-container',
                '#chat-messages'
            ],
            latestMessage: [
                '.message:last-child',
                '.chat-message:last-child'
            ]
        }
    };
    
    // 自动检测当前网站并返回对应配置
    function getCurrentSiteConfig() {
        const hostname = window.location.hostname;
    
        // 精确匹配
        if (WEBSITE_SELECTORS[hostname]) {
            return WEBSITE_SELECTORS[hostname];
        }
    
        // 模糊匹配
        for (const domain in WEBSITE_SELECTORS) {
            if (hostname.includes(domain)) {
                return WEBSITE_SELECTORS[domain];
            }
        }
    
        // 返回默认配置
        return WEBSITE_SELECTORS.default;
    }
    
    // 配置对象 - 可根据不同网站调整选择器
    const CONFIG = {
        // WebSocket服务器地址
        wsServer: 'ws://localhost:8000/ws',
    
        // 动态选择器从外部配置获取
        selectors: getCurrentSiteConfig(),
    
        // 超时设置（毫秒）
        timeouts: {
            elementWait: 10000, // 等待元素出现超时
            messageSend: 30000,  // 发送消息超时
            responseWait: 120000, // 等待响应超时
            reconnect: 5000      // 重连间隔
        },
    
        // 重试配置
        retry: {
            maxAttempts: 3,     // 最大重试次数
            delay: 1000         // 重试延迟
        }
    };

    // File: utils.js
    // 工具函数模块
    
    let wsManager = null;
    
    function setWsManager(manager) {
        wsManager = manager;
    }
    
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    function findElement(selectorsArray) {
        for (const selector of selectorsArray) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
        }
        return null;
    }
    
    function extractMessageText(messageElement) {
        const text = messageElement.textContent || messageElement.innerText || '';
        return text.trim().replace(/\s+/g, ' ');
    }
    
    function isAIMessage(element) {
        const classList = element.className || '';
        return classList.includes('ai-') ||
               classList.includes('bot-') ||
               classList.includes('assistant-') ||
               element.querySelector('[data-ai-message]') !== null;
    }
    
    const LOG_LEVELS = {
        DEBUG: 'debug',
        INFO: 'info',
        WARN: 'warn',
        ERROR: 'error'
    };
    
    const localLogs = [];
    const MAX_LOCAL_LOGS = 100;
    
    function log(level, category, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, level, category, message, data };
        
        switch (level) {
            case LOG_LEVELS.DEBUG:
                console.debug(`[${timestamp}] [${category}] ${message}`, data || '');
                break;
            case LOG_LEVELS.INFO:
                console.log(`[${timestamp}] [${category}] ${message}`, data || '');
                break;
            case LOG_LEVELS.WARN:
                console.warn(`[${timestamp}] [${category}] ${message}`, data || '');
                break;
            case LOG_LEVELS.ERROR:
                console.error(`[${timestamp}] [${category}] ${message}`, data || '');
                break;
        }
    
        if (wsManager && wsManager.isConnected) {
            try {
                wsManager.sendLog(level, category, message, data);
                while (localLogs.length > 0) {
                    const cached = localLogs.shift();
                    wsManager.sendLog(cached.level, cached.category, cached.message, cached.data);
                }
            } catch (e) {
                localLogs.push(logEntry);
                if (localLogs.length > MAX_LOCAL_LOGS) {
                    localLogs.shift();
                }
            }
        } else {
            localLogs.push(logEntry);
            if (localLogs.length > MAX_LOCAL_LOGS) {
                localLogs.shift();
            }
        }
    }
    
    function debug(category, message, data) { return log(LOG_LEVELS.DEBUG, category, message, data); }
    function info(category, message, data) { return log(LOG_LEVELS.INFO, category, message, data); }
    function warn(category, message, data) { return log(LOG_LEVELS.WARN, category, message, data); }
    function error(category, message, data) { return log(LOG_LEVELS.ERROR, category, message, data); }
    

    // File: websocketManager.js
    // WebSocket 管理模块
    
    class WebSocketManager {
        constructor(wsServer, aiChatForwarder) {
            this.wsServer = wsServer;
            this.aiChatForwarder = aiChatForwarder;
            this.ws = null;
            this.isConnected = false;
            this.clientId = null;
        }
    
        async connect() {
            return new Promise((resolve, reject) => {
                try {
                    this.ws = new WebSocket(this.wsServer);
    
                    this.ws.onopen = (event) => {
                        console.log('🔗 WebSocket连接已建立');
                        this.isConnected = true;
                        this.aiChatForwarder.retryCount = 0;
                        this.registerClient();
                        resolve(event);
                    };
    
                    this.ws.onmessage = (event) => {
                        this.handleMessage(JSON.parse(event.data));
                    };
    
                    this.ws.onclose = (event) => {
                        console.log('🔌 WebSocket连接已关闭:', event.code, event.reason);
                        this.isConnected = false;
                        this.handleDisconnection();
                    };
    
                    this.ws.onerror = (error) => {
                        console.error('❌ WebSocket错误:', error);
                        reject(error);
                    };
    
                } catch (error) {
                    reject(error);
                }
            });
        }
    
        registerClient() {
            this.clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
            const registerMsg = {
                type: 'register',
                client_id: this.clientId,
                metadata: {
                    user_agent: navigator.userAgent,
                    webpage_url: window.location.href,
                    timestamp: new Date().toISOString()
                }
            };
    
            this.sendMessage(registerMsg);
            console.log('📝 客户端注册完成:', this.clientId);
        }
    
        handleMessage(data) {
            const messageType = data.type;
    
            switch (messageType) {
                case 'connection_established':
                    console.log('✅ 服务器连接确认收到');
                    this.sendClientReady();
                    break;
    
                case 'completion_request':
                    this.aiChatForwarder.handleCompletionRequest(data);
                    break;
    
                case 'heartbeat':
                    this.handleHeartbeat();
                    break;
    
                case 'error':
                    console.error('❌ 服务器错误:', data.message);
                    break;
    
                default:
                    console.warn('⚠️ 未知消息类型:', messageType, data);
            }
        }
    
        sendMessage(message) {
            if (this.ws && this.isConnected) {
                this.ws.send(JSON.stringify(message));
            } else {
                console.warn('⚠️ WebSocket未连接，无法发送消息:', message.type);
            }
        }
    
        sendClientReady() {
            const readyMsg = {
                type: 'client_ready',
                client_id: this.clientId,
                timestamp: new Date().toISOString()
            };
    
            this.sendMessage(readyMsg);
        }
    
        handleHeartbeat() {
            const response = {
                type: 'heartbeat_response',
                client_id: this.clientId,
                timestamp: new Date().toISOString()
            };
    
            this.sendMessage(response);
        }
    
        sendCompletionResponse(requestId, content) {
            const responseMsg = {
                type: 'completion_response',
                request_id: requestId,
                content: content,
                timestamp: new Date().toISOString(),
                error: null
            };
    
            this.sendMessage(responseMsg);
            console.log('📨 补全响应已发送:', requestId);
        }
    
        sendLog(level, category, message, data = null) {
            const logMsg = {
                type: 'client_log',
                client_id: this.clientId,
                timestamp: new Date().toISOString(),
                level: level,
                category: category,
                message: message,
                data: data
            };
    
            this.sendMessage(logMsg);
            console.log(`[${level.toUpperCase()}] [${category}] ${message}`, data || '');
        }
    
        sendErrorResponse(requestId, errorCode, errorMessage) {
            const errorMsg = {
                type: 'completion_response',
                request_id: requestId,
                content: '',
                timestamp: new Date().toISOString(),
                error: {
                    code: errorCode,
                    message: errorMessage
                }
            };
    
            this.sendMessage(errorMsg);
        }
    
        handleDisconnection() {
            console.log('🔌 连接断开，尝试重连...');
            this.aiChatForwarder.scheduleRetry();
        }
    
        close() {
            if (this.ws) {
                this.ws.close();
            }
        }
    }

    // File: domManager.js
    // DOM 操作模块
    class DOMManager {
        constructor(aiChatForwarder) {
            this.aiChatForwarder = aiChatForwarder;
            this.observer = null;
        }
    
        async waitForElement(selectorsArray, timeout = CONFIG.timeouts.elementWait) {
            const startTime = Date.now();
    
            while (Date.now() - startTime < timeout) {
                for (const selector of selectorsArray) {
                    const element = document.querySelector(selector);
                    if (element) {
                        return element;
                    }
                }
                await delay(100);
            }
    
            throw new Error(`等待元素超时: ${selectorsArray.join(', ')}`);
        }
    
        setupMessageObserver() {
            const messageListContainer = findElement(CONFIG.selectors.messageListContainer);
            if (!messageListContainer) {
                console.warn('⚠️ 未找到消息列表容器，将使用轮询方式');
                this.setupPolling();
                return;
            }
    
            this.observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        this.checkForNewResponse();
                    }
                });
            });
    
            this.observer.observe(messageListContainer, {
                childList: true,
                subtree: true
            });
            
            console.log('📡 消息观察器已设置:', CONFIG.selectors.messageListContainer);
        }
    
        setupPolling() {
            setInterval(() => {
                this.checkForNewResponse();
            }, 2000);
        }
    
        checkForNewResponse() {
            // 用于轮询检查新消息
            if (this.aiChatForwarder.pendingRequests.size > 0) {
                // 如果有待处理的请求，检查是否有新回复
            }
        }
    
        async fillInputBox(inputBox, text) {
            // 检查是否是元宝的输入框
            if (inputBox.classList.contains('ql-editor') && inputBox.getAttribute('contenteditable') === 'true') {
                // 清空输入框
                inputBox.innerHTML = '';
    
                // 将文本按换行符切割
                const lines = text.split('\n');
    
                // 为每一行创建<p>标签并插入
                lines.forEach(line => {
                    const p = document.createElement('p');
                    p.textContent = line;
                    inputBox.appendChild(p);
                });
    
                // 模拟输入事件
                inputBox.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                // 默认行为
                inputBox.value = '';
                inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    
                for (let i = 0; i < text.length; i++) {
                    inputBox.value += text[i];
                    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
                    if (i % 10 === 0) {
                        await delay(50 + Math.random() * 50);
                    }
                }
    
                await delay(500);
            }
        }
    
        async clickSendButton() {
            const sendButton = await this.waitForElement(CONFIG.selectors.sendButton);
            console.log('✅ 发送按钮已加载:', sendButton);
            // 检查是否是元宝的发送按钮
            if (sendButton.id === 'yuanbao-send-btn' && sendButton.tagName.toLowerCase() === 'a') {
                // 确保按钮未被禁用
                if (sendButton.classList.contains('style__send-btn--disabled___mhfdQ')) {
                    throw new Error('元宝发送按钮当前被禁用');
                }
    
                // 模拟点击事件
                const event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                sendButton.dispatchEvent(event);
                console.log('📤 元宝发送按钮已触发点击事件');
            } else {
                // 默认行为
                sendButton.click();
                console.log('📤 默认发送按钮已点击');
            }
        }
    
        async waitForAIResponse(baselineContent = null) {
            const startTime = Date.now();
            const baseline = baselineContent || this.getLatestMessage();
            console.log('🔍 waitForAIResponse: 基准内容:', baseline?.substring(0, 30));
    
            while (Date.now() - startTime < CONFIG.timeouts.responseWait) {
                await delay(1000);
    
                const latestMessage = this.getLatestMessage();
                const hasChanged = latestMessage !== baseline && 
                                  (baseline === null || !latestMessage?.includes(baseline) || !baseline?.includes(latestMessage));
                console.log(`🔍 检查: 最新内容=${latestMessage?.substring(0, 30)}, 变化=${hasChanged}`);
    
                // 等待内容变化且有效（使用更可靠的内容比较）
                if (latestMessage && latestMessage.length > 0 && latestMessage !== baseline) {
                    // 等待内容稳定（避免获取不完整内容）
                    await delay(2000);
                    const stableMessage = this.getLatestMessage();
                    
                    // 检查是否包含 <response_done> 标记
                    if (stableMessage && stableMessage.includes('<response_done>')) {
                        // 提取标记前的内容
                        const finalContent = stableMessage.split('<response_done>')[0].trim();
                        console.log('🤖 收到AI回复（带完成标记），长度:', finalContent.length);
                        return finalContent;
                    }
                    
                    // 如果不包含完成标记且内容稳定，也返回（兼容旧响应）
                    if (stableMessage && stableMessage.length > 0 && stableMessage !== baseline) {
                        console.log('🤖 收到AI回复，长度:', stableMessage.length, '内容:', stableMessage.substring(0, 50));
                        return stableMessage;
                    }
                }
            }
    
            throw new Error('等待AI响应超时');
        }
    
        getMessageCount() {
            // 获取消息列表容器
            const container = findElement(CONFIG.selectors.messageListContainer);
            if (!container) {
                console.warn('⚠️ 消息列表容器未找到，返回0');
                return 0;
            }
    
            // 检查是否是元宝的消息容器
            if (window.location.hostname === 'yuanbao.tencent.com') {
                // 查找所有 class 为 'hyc-component-reasoner__text' 的元素（每个代表一条AI消息）
                const reasonerTextElements = Array.from(container.querySelectorAll('.hyc-component-reasoner__text'));
                const count = reasonerTextElements.length;
    
                // Also check parent containers for more reliable count
                const parentContainer = document.querySelector('.agent-chat__list');
                const aiListItems = parentContainer ? parentContainer.querySelectorAll('.agent-chat__list__item--ai') : [];
                const altCount = aiListItems.length;
    
                const finalCount = Math.max(count, altCount);
    
                if (finalCount === 0) {
                    console.warn('⚠️ 未找到任何AI消息，reasonerTextElements:', count, 'aiListItems:', altCount);
                    return 0;
                }
    
                console.log('🤖 元宝AI消息数量: reasonerTextElements=%d, aiListItems=%d, final=%d', count, altCount, finalCount);
                return finalCount;
            }
    
            // 默认行为: 统计AI消息数量
            const aiMessages = container.querySelectorAll('.agent-chat__list__item--ai');
            const count = aiMessages.length;
            
            if (count === 0) {
                console.warn('⚠️ 未找到任何AI消息，返回0');
                return 0;
            }
    
            return count;
        }
    
        getLatestMessage() {
            // 获取消息列表容器
            const container = findElement(CONFIG.selectors.messageListContainer);
            if (!container) {
                console.warn('⚠️ 消息列表容器未找到，返回null');
                return null;
            }
    
            // 检查是否是元宝的消息容器
            if (window.location.hostname === 'yuanbao.tencent.com') {
                // 获取所有 class 为 'hyc-component-reasoner__text' 的元素，取最后一个
                const allReasonerTextElements = container.querySelectorAll('.hyc-component-reasoner__text');
                const lastReasonerTextElement = allReasonerTextElements[allReasonerTextElements.length - 1];
    
                if (!lastReasonerTextElement) {
                    console.warn('⚠️ 未找到任何AI消息内容，返回null');
                    return null;
                }
    
                console.log('🤖 元宝最新AI消息元素已找到 (第%d个，共%d个)', allReasonerTextElements.length, allReasonerTextElements.length);
    
                // 查找该元素下所有 class 为 'ybc-p' 的 div
                const ybcPElements = lastReasonerTextElement.querySelectorAll('.ybc-p');
                if (ybcPElements.length === 0) {
                    console.warn('⚠️ 未找到任何AI消息内容，返回null');
                    return null;
                }
    
                // 提取内容并合并为单个字符串
                const combinedContent = Array.from(ybcPElements)
                    .map(element => element.textContent.trim())
                    .join('\n');
    
                console.log('🤖 元宝最新AI消息内容:', combinedContent);
                return combinedContent;
            }
    
            // 默认行为: 获取最后一个消息元素
            const latestMessage = container.querySelector('.agent-chat__list__item--ai:last-child .agent-chat__bubble__content');
            if (!latestMessage) {
                console.warn('⚠️ 未找到最新的AI消息，返回null');
                return null;
            }
    
            return latestMessage.textContent.trim();
        }
    
        disconnectObserver() {
            if (this.observer) {
                this.observer.disconnect();
            }
        }
    }

    // File: aiChatForwarder.js
    // 主逻辑模块
    class AIChatForwarder {
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
                    combinedContent += 'IMPORTANT: When you finish your response, you MUST end it with exactly: <response_done>\n';
                    combinedContent += 'Do not include any text after <response_done>.\n\n';
                }
    
                if (userMsg) {
                    combinedContent += '# Your Task\n\n';
                    combinedContent += userMsg.content || '';
                }
    
                console.log('📝 系统消息:', systemMsg ? '有' : '无');
                console.log('📝 用户消息:', userMsg ? '有' : '无');
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
                await delay(1000);
    
                // 点击发送按钮
                console.log('🖱️ 点击发送按钮');
                await this.domManager.clickSendButton();
    
                // 等待AI响应
                console.log('⏳ 等待AI响应...');
                const response = await this.domManager.waitForAIResponse(baselineContent);
                console.log('✅ AI响应已获取:', response?.substring(0, 30));
    
                // 发送最终响应
                if (response) {
                    console.log('📤 发送AI响应:', response?.substring(0, 50));
                    this.wsManager.sendCompletionResponse(requestData.request_id, response);
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

})();
