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

    /**
     * 不同网站的CSS选择器配置
     * 可根据具体网站结构调整这些选择器
     */
    const WEBSITE_SELECTORS = {
        // ChatGPT
        'chat.openai.com': {
            inputBox: ['#prompt-textarea'],
            sendButton: ['button[data-testid="send-button"]'],
            messageContainer: ['[data-testid="conversation"]'],
            latestMessage: ['[data-testid="conversation"] .group:last-child .text-gray-400']
        },

        // Claude.ai
        'claude.ai': {
            inputBox: ['.prose textarea'],
            sendButton: ['button:has(svg)'],
            messageContainer: ['.chat-messages'],
            latestMessage: ['.ai-message:last-child']
        },

        // Arena.ai
        'arena.ai': {
            inputBox: ['textarea.arena-input'],
            sendButton: ['button.arena-send'],
            messageContainer: ['.arena-messages'],
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
            messageContainer: [
                '#chat-content',
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
            messageContainer: [
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

    class AIChatForwarder {
        constructor() {
            this.ws = null;
            this.clientId = null;
            this.isConnected = false;
            this.currentRequestId = null;
            this.pendingRequests = new Map();
            this.retryCount = 0;
            this.isProcessing = false;
            this.observer = null;

            this.init();
        }

        async init() {
            console.log('🤖 AI聊天转发器初始化...');

            // 等待页面加载完成
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.start());
            } else {
                await this.start();
            }
        }

        async start() {
            try {
                // 初始化DOM元素监听
                await this.initDOMListeners();

                // 连接WebSocket服务器
                await this.connectWebSocket();

                // 启动心跳检测
                this.startHeartbeat();

                console.log('✅ AI聊天转发器启动完成');
            } catch (error) {
                console.error('❌ 初始化失败:', error);
                this.scheduleRetry();
            }
        }

        async initDOMListeners() {
            console.log('🔍 初始化DOM监听器...');
            await this.waitForElement(CONFIG.selectors.messageContainer);
            console.log('✅ 消息容器已加载:', CONFIG.selectors.messageContainer);

            // 设置MutationObserver监听消息变化
            console.log('🔧 设置MutationObserver监听消息变化');
            this.setupMessageObserver();

            console.log('🔍 DOM监听器初始化完成');
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
                await this.delay(100);
            }

            throw new Error(`等待元素超时: ${selectorsArray.join(', ')}`);
        }

        setupMessageObserver() {
            const messageContainer = this.findElement(CONFIG.selectors.messageContainer);
            if (!messageContainer) {
                console.warn('⚠️ 未找到消息容器，将使用轮询方式');
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

            this.observer.observe(messageContainer, {
                childList: true,
                subtree: true
            });
        }

        setupPolling() {
            setInterval(() => {
                this.checkForNewResponse();
            }, 2000);
        }

        async connectWebSocket() {
            return new Promise((resolve, reject) => {
                try {
                    this.ws = new WebSocket(CONFIG.wsServer);

                    this.ws.onopen = (event) => {
                        console.log('🔗 WebSocket连接已建立');
                        this.isConnected = true;
                        this.retryCount = 0;
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

            this.sendWebSocketMessage(registerMsg);
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
                    this.handleCompletionRequest(data);
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

        async handleCompletionRequest(requestData) {
            if (this.isProcessing) {
                console.warn('⚠️ 正在处理其他请求，拒绝新请求');
                this.sendErrorResponse(requestData.request_id, 'busy', '客户端正忙');
                return;
            }

            this.isProcessing = true;
            this.currentRequestId = requestData.request_id;

            console.log('📨 收到补全请求:', requestData.request_id);
            const userMessage = this.extractUserMessage(requestData.messages);

            // 等待输入框可用
            console.log('⏳ 等待输入框加载:', CONFIG.selectors.inputBox);
            const inputBox = await this.waitForElement(CONFIG.selectors.inputBox);
            console.log('✅ 输入框已加载:', inputBox);

            // 清空并填写消息
            console.log('✍️ 填写消息到输入框:', userMessage);
            await this.fillInputBox(inputBox, userMessage);

            // 点击发送按钮前等待1秒，防止被识别为机器人
            await this.delay(1000);

            // 点击发送按钮
            console.log('🖱️ 点击发送按钮:', CONFIG.selectors.sendButton);
            await this.clickSendButton();

            // 等待AI响应
            console.log('⏳ 等待AI响应...');
            const aiResponse = await this.waitForAIResponse();

            // 发送响应回服务器
            console.log('📤 发送AI响应:', aiResponse);
            this.sendCompletionResponse(requestData.request_id, aiResponse);

        }

        extractUserMessage(messages) {
            // 查找最后一条用户消息
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                    return messages[i].content;
                }
            }
            return null;
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
                        await this.delay(50 + Math.random() * 50);
                    }
                }

                await this.delay(500);
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

        async waitForAIResponse() {
            const startTime = Date.now();
            let lastMessageCount = this.getMessageCount();

            while (Date.now() - startTime < CONFIG.timeouts.responseWait) {
                await this.delay(1000);

                const currentMessageCount = this.getMessageCount();
                const latestMessage = this.getLatestMessage();

                // 检测到新消息且是AI的回复
                if (currentMessageCount > lastMessageCount && latestMessage) {
                    const messageText = this.extractMessageText(latestMessage);
                    if (messageText && this.isAIMessage(latestMessage)) {
                        console.log('🤖 收到AI回复，长度:', messageText.length);
                        return messageText;
                    }
                }

                lastMessageCount = currentMessageCount;
            }

            throw new Error('等待AI响应超时');
        }

        getMessageCount() {
            // 获取消息容器
            const container = this.findElement(CONFIG.selectors.messageContainer);
            if (!container) {
                console.warn('⚠️ 消息容器未找到，返回0');
                return 0;
            }

            // 检查是否是元宝的消息容器
            if (window.location.hostname === 'yuanbao.tencent.com') {
                // 查找最后一个 class 为 'hyc-component-reasoner__text' 的元素
                const lastReasonerTextElement = container.querySelector('.hyc-component-reasoner__text:last-of-type');
                if (!lastReasonerTextElement) {
                    console.warn('⚠️ 未找到任何AI消息内容，返回null');
                    return null;
                }

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

        getLatestMessage() {
            // 获取消息容器
            const container = this.findElement(CONFIG.selectors.messageContainer);
            if (!container) {
                console.warn('⚠️ 消息容器未找到，返回null');
                return null;
            }

            // 检查是否是元宝的消息容器
            if (window.location.hostname === 'yuanbao.tencent.com') {
                // 查找最后一个 class 为 'hyc-component-reasoner__text' 的元素
                const lastReasonerTextElement = container.querySelector('.hyc-component-reasoner__text:last-of-type');
                if (!lastReasonerTextElement) {
                    console.warn('⚠️ 未找到任何AI消息内容，返回null');
                    return null;
                }

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

        extractMessageText(messageElement) {
            // 尝试不同的文本提取方法
            const text = messageElement.textContent || messageElement.innerText || '';
            return text.trim().replace(/\s+/g, ' ');
        }

        isAIMessage(element) {
            // 根据类名或属性判断是否为AI消息
            const classList = element.className || '';
            return classList.includes('ai-') ||
                   classList.includes('bot-') ||
                   classList.includes('assistant-') ||
                   element.querySelector('[data-ai-message]') !== null;
        }

        findElement(selectorsArray) {
            for (const selector of selectorsArray) {
                const element = document.querySelector(selector);
                if (element) {
                    return element;
                }
            }
            return null;
        }

        sendCompletionResponse(requestId, content) {
            const responseMsg = {
                type: 'completion_response',
                request_id: requestId,
                content: content,
                timestamp: new Date().toISOString(),
                error: null
            };

            this.sendWebSocketMessage(responseMsg);
            console.log('📨 补全响应已发送:', requestId);
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

            this.sendWebSocketMessage(errorMsg);
        }

        sendClientReady() {
            const readyMsg = {
                type: 'client_ready',
                client_id: this.clientId,
                timestamp: new Date().toISOString()
            };

            this.sendWebSocketMessage(readyMsg);
        }

        handleHeartbeat() {
            const response = {
                type: 'heartbeat_response',
                client_id: this.clientId,
                timestamp: new Date().toISOString()
            };

            this.sendWebSocketMessage(response);
        }

        sendWebSocketMessage(message) {
            if (this.ws && this.isConnected) {
                this.ws.send(JSON.stringify(message));
            } else {
                console.warn('⚠️ WebSocket未连接，无法发送消息:', message.type);
            }
        }

        handleDisconnection() {
            console.log('🔌 连接断开，尝试重连...');
            this.scheduleRetry();
        }

        scheduleRetry() {
            if (this.retryCount >= CONFIG.retry.maxAttempts) {
                console.error('❌ 达到最大重试次数，停止重连');
                return;
            }

            this.retryCount++;
            const delay = CONFIG.timeouts.reconnect * this.retryCount;

            console.log(`🔄 ${this.retryCount}/${CONFIG.retry.maxAttempts} 将在 ${delay}ms 后重连`);

            setTimeout(() => {
                this.connectWebSocket().catch(error => {
                    console.error('❌ 重连失败:', error);
                    this.scheduleRetry();
                });
            }, delay);
        }

        startHeartbeat() {
            // 服务器会发送心跳，客户端只需响应
            console.log('💓 心跳检测已启动');
        }

        checkForNewResponse() {
            // 用于轮询检查新消息
            if (this.pendingRequests.size > 0) {
                // 如果有待处理的请求，检查是否有新回复
            }
        }

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        // 清理资源
        destroy() {
            if (this.observer) {
                this.observer.disconnect();
            }

            if (this.ws) {
                this.ws.close();
            }

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
