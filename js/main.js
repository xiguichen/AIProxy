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
            inputBox: ['textarea[name="message"]'],
            sendButton: ['button[type="submit"]'],
            pageReadyIndicator: ['#chat-area', '#root-portal-target'],
            messageListContainer: ['main'],
            // Arena.ai uses flex-col-reverse. AI messages lack 'justify-end' class.
            // The latest AI message is identified by filtering for elements without 'justify-end'.
            latestMessage: ['ol.mt-8.flex']
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
    
    // Production mode - disable all console logs in production
    const PRODUCTION = (() => {
        const url = typeof window !== 'undefined' ? window.location?.href : '';
        return url.includes('arena.ai') || url.includes('claude.ai') || url.includes('chat.openai.com');
    })();
    
    let wsManager = null;
    
    function setWsManager(manager) {
        wsManager = manager;
    }
    
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 带随机性的延迟函数，模拟人类行为
     * @param {number} minMs 最小延迟时间（毫秒）
     * @param {number} maxMs 最大延迟时间（毫秒）
     * @returns {Promise<void>}
     */
    function randomDelay(minMs, maxMs) {
        const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        return new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    /**
     * 随机选择一个延迟值
     * @param {Array<number>} delays 延迟时间数组
     * @returns {number} 随机选择的延迟时间
     */
    function randomChoice(delays) {
        return delays[Math.floor(Math.random() * delays.length)];
    }
    
    // Console logging that can be disabled in production
    const noopLogger = { log: ()=>{}, debug: ()=>{}, info: ()=>{}, warn: ()=>{}, error: ()=>{} };
    const activeLogger = PRODUCTION ? noopLogger : console;
    
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
    
    function _log(level, category, message, data = null) {
        if (PRODUCTION) return;
        
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
    
    function debug(category, message, data) { _log(LOG_LEVELS.DEBUG, category, message, data); }
    function info(category, message, data) { _log(LOG_LEVELS.INFO, category, message, data); }
    function warn(category, message, data) { _log(LOG_LEVELS.WARN, category, message, data); }
    function error(category, message, data) { _log(LOG_LEVELS.ERROR, category, message, data); }
    

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
    
        sendCompletionResponse(requestId, content, toolCalls = null) {
            const responseMsg = {
                type: 'completion_response',
                request_id: requestId,
                content: content,
                timestamp: new Date().toISOString(),
                error: null
            };
    
            if (toolCalls) {
                responseMsg.tool_calls = toolCalls;
            }
    
            this.sendMessage(responseMsg);
            console.log('📨 补全响应已发送:', requestId, toolCalls ? '(含tool_calls)' : '');
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
            // 添加随机延迟，模拟人类输入
            await randomDelay(100, 500);
    
            // 检查是否是元宝的输入框
            if (inputBox.classList.contains('ql-editor') && inputBox.getAttribute('contenteditable') === 'true') {
                // 清空输入框
                inputBox.innerHTML = '';
    
                // 将文本按换行符切割
                const lines = text.split('\n');
    
                // 为每一行创建<p>标签并插入
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // 每行之间添加随机延迟
                    if (i > 0) await randomDelay(50, 200);
    
                    const p = document.createElement('p');
                    p.textContent = line;
                    inputBox.appendChild(p);
                }
    
                // 模拟输入事件
                inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    
                // 额外延迟
                await randomDelay(200, 600);
            } else {
                // 默认行为 - 标准 textarea 输入
                inputBox.focus();
    
                // 随机选择焦点动画方式
                const focusDelay = randomChoice([100, 150, 200, 250]);
                await delay(focusDelay);
    
                inputBox.select();
    
                // 随机光标动画
                const cursorAnimations = [100, 150, 200, 250];
                await delay(randomChoice(cursorAnimations));
    
                // 清空内容
                document.execCommand('delete', false, null);
    
                // 使用 setRangeText 插入文本（现代浏览器支持）
                if (typeof inputBox.setRangeText === 'function') {
                    inputBox.setRangeText(text, inputBox.selectionStart, inputBox.selectionEnd, 'end');
                } else {
                    // Fallback: 直接赋值
                    inputBox.value = text;
                }
    
                // 移动光标到末尾
                inputBox.selectionStart = inputBox.value.length;
                inputBox.selectionEnd = inputBox.value.length;
    
                // 触发事件序列（添加随机性）
                inputBox.dispatchEvent(new Event('focus', { bubbles: true }));
                await randomDelay(50, 150);
    
                inputBox.dispatchEvent(new Event('input', { bubbles: true }));
                await randomDelay(50, 150);
    
                inputBox.dispatchEvent(new Event('change', { bubbles: true }));
                await randomDelay(50, 150);
    
                inputBox.dispatchEvent(new Event('blur', { bubbles: true }));
    
                await randomDelay(200, 500);
            }
        }
    
        async clickSendButton() {
            // 等待发送按钮加载
            const sendButton = await this.waitForElement(CONFIG.selectors.sendButton);
            console.log('✅ 发送按钮已加载:', sendButton);
    
            // 添加随机等待，模拟人类检查按钮状态
            await randomDelay(500, 1500);
    
            const isDisabled = () => {
                // 检查多种禁用状态
                if (sendButton.id === 'yuanbao-send-btn') {
                    return sendButton.classList.contains('style__send-btn--disabled___mhfdQ');
                }
                // Arena.ai 使用 disabled 属性或 opacity/pointer-events 类
                if (window.location.hostname === 'arena.ai' || window.location.hostname.endsWith('.arena.ai')) {
                    return sendButton.hasAttribute('disabled') ||
                           sendButton.classList.contains('opacity-50') ||
                           sendButton.classList.contains('pointer-events-none');
                }
                return sendButton.disabled;
            };
    
            for (let attempt = 0; attempt < 10; attempt++) {
                if (!isDisabled()) {
                    break;
                }
                // 随机等待时间
                const waitTime = randomChoice([500, 800, 1200, 1500]);
                console.log(`⚠️ 发送按钮被禁用，等待 ${waitTime}ms 后重试... (${attempt + 1}/10)`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
    
            if (isDisabled()) {
                console.warn('⚠️ 发送按钮持续被禁用，尝试强制启用...');
                await randomDelay(200, 500);
    
                // 尝试强制移除禁用状态（Arena.ai）
                if (window.location.hostname === 'arena.ai' || window.location.hostname.endsWith('.arena.ai')) {
                    sendButton.removeAttribute('disabled');
                    sendButton.classList.remove('opacity-50', 'pointer-events-none');
                    sendButton.style.opacity = '1';
                    sendButton.style.pointerEvents = 'auto';
    
                    await randomDelay(200, 500);
    
                    if (!isDisabled()) {
                        console.log('✅ 已强制启用发送按钮');
                    }
                }
                
                if (isDisabled()) {
                    throw new Error('发送按钮持续被禁用，无法点击');
                }
            }
    
            // 随机延迟后点击
            await randomDelay(300, 800);
    
            if (sendButton.id === 'yuanbao-send-btn' && sendButton.tagName.toLowerCase() === 'a') {
                // 元宝特殊处理：添加鼠标事件
                const event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                sendButton.dispatchEvent(event);
                console.log('📤 元宝发送按钮已触发点击事件');
            } else {
                // 默认点击行为：添加鼠标移动模拟
                const event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: Math.random() * window.innerWidth,
                    clientY: Math.random() * window.innerHeight,
                    screenX: Math.random() * window.innerWidth,
                    screenY: Math.random() * window.innerHeight
                });
                sendButton.dispatchEvent(event);
                console.log('📤 发送按钮已点击');
            }
        }
    
        /**
         * Extract clean text from an AI message element for Arena.ai.
         *
         * Arena.ai renders the AI response as rich HTML: paragraphs, code blocks
         * with syntax highlighting, lists, etc.
         *
         * The problem with using plain textContent is that code block UI chrome
         * (language labels like "text", copy button text, SVG content) gets mixed
         * into the extracted text.
         *
         * This method walks the DOM tree, skipping UI chrome elements, and extracts
         * only the actual content text.
         *
         * @param {Element} element - The .prose message container element
         * @returns {string} Clean extracted text
         */
        _extractArenaMessage(element) {
            if (!element) return '';
            return this._walkArenaNodes(element).trim();
        }
    
        /**
         * Try to detect and extract JSON from a code block in Arena.ai.
         * Looks for <div data-code-block="true"> with JSON content.
         * @param {Element} messageElement - The .prose message container
         * @returns {Object|null} Parsed JSON object or null if not found
         */
        _extractJsonFromArenaMessage(messageElement) {
            if (!messageElement) return null;
    
            const codeBlocks = messageElement.querySelectorAll('[data-code-block="true"]');
            
            for (const block of codeBlocks) {
                const header = block.querySelector('.border-border.flex.items-center.justify-between');
                if (!header) continue;
                
                const label = header.querySelector('span.text-sm.font-medium');
                if (!label || label.textContent.trim().toUpperCase() !== 'JSON') continue;
                
                const codeContainer = block.querySelector('.code-block_container__lbMX4') ||
                                      block.querySelector('[class*="code-block_container"]');
                if (!codeContainer) continue;
                
                const codeEl = codeContainer.querySelector('code');
                if (!codeEl) continue;
                
                let jsonText = '';
                const lines = codeEl.querySelectorAll('.line');
                if (lines.length > 0) {
                    for (const line of lines) {
                        jsonText += line.textContent;
                    }
                } else {
                    jsonText = codeEl.textContent;
                }
                
                try {
                    const parsed = JSON.parse(jsonText);
                    console.log('🔍 [JSON] 解析到JSON代码块:', Object.keys(parsed));
                    return parsed;
                } catch (e) {
                    console.warn('⚠️ [JSON] 解析失败:', e.message);
                }
            }
            
            return null;
        }
    
        /**
         * Try to extract JSON from raw message text (for direct JSON responses).
         * @param {string} messageText - The raw message text
         * @returns {Object|null} Parsed JSON object or null if not valid JSON
         */
        _extractJsonFromText(messageText) {
            if (!messageText) return null;
            
            const trimmed = messageText.trim();
            
            // Try direct JSON first
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    console.log('🔍 [JSON] 从文本解析到JSON:', Object.keys(parsed));
                    return parsed;
                } catch (e) {
                    console.warn('⚠️ [JSON] 文本解析失败:', e.message);
                }
            }
            
            // Try to extract JSON from code blocks (use last one)
            const jsonCodeBlockMatches = trimmed.match(/```json\s*([\s\S]*?)\s*```/g);
            if (jsonCodeBlockMatches && jsonCodeBlockMatches.length > 0) {
                const lastMatch = jsonCodeBlockMatches[jsonCodeBlockMatches.length - 1];
                const jsonText = lastMatch.replace(/```json\s*/, '').replace(/\s*```$/, '').trim();
                try {
                    const parsed = JSON.parse(jsonText);
                    console.log('🔍 [JSON] 从最后一个代码块解析到JSON:', Object.keys(parsed));
                    return parsed;
                } catch (e) {
                    console.warn('⚠️ [JSON] 代码块解析失败:', e.message);
                }
            }
            
            return null;
        }
    
        /**
         * Recursively walk Arena.ai DOM nodes extracting only content text.
         * Skips code block chrome (language labels, copy buttons, SVGs).
         *
         * Arena.ai code block structure:
         *   <pre>
         *     <div data-code-block="true" class="not-prose ...">
         *       <div class="border-border ...">   ← header with language label + copy button (SKIP)
         *       <div class="code-block_container...">
         *         <pre class="shiki ...">
         *           <code>
         *             <span class="line"><span>code text</span></span>
         *             ...
         *
         * @param {Node} node
         * @returns {string}
         */
        _walkArenaNodes(node) {
            let result = '';
    
            for (const child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    result += child.textContent;
                    continue;
                }
    
                if (child.nodeType !== Node.ELEMENT_NODE) {
                    continue;
                }
    
                const el = child;
                const tagName = el.tagName.toLowerCase();
    
                // Skip SVGs entirely — they contain no useful text
                if (tagName === 'svg') {
                    continue;
                }
    
                // Skip button elements (copy buttons in code blocks)
                if (tagName === 'button') {
                    continue;
                }
    
                // Handle code block wrapper: <div data-code-block="true">
                if (el.hasAttribute('data-code-block')) {
                    // Find the actual code content, skip the header bar
                    const codeContainer = el.querySelector('.code-block_container__lbMX4') ||
                                          el.querySelector('[class*="code-block_container"]');
                    if (codeContainer) {
                        const codeEl = codeContainer.querySelector('code');
                        if (codeEl) {
                            // Extract code lines from <span class="line"> elements
                            const lines = codeEl.querySelectorAll('.line');
                            if (lines.length > 0) {
                                const codeLines = [];
                                for (const line of lines) {
                                    codeLines.push(line.textContent);
                                }
                                result += codeLines.join('\n');
                            } else {
                                result += codeEl.textContent;
                            }
                        } else {
                            result += codeContainer.textContent;
                        }
                    } else {
                        // Fallback: try to find code element directly
                        const codeEl = el.querySelector('code');
                        if (codeEl) {
                            result += codeEl.textContent;
                        }
                    }
                    result += '\n';
                    continue;
                }
    
                // Handle the code block header bar (language label + buttons) — skip it
                if (el.classList.contains('border-border') &&
                    el.classList.contains('flex') &&
                    el.classList.contains('items-center') &&
                    el.classList.contains('justify-between')) {
                    continue;
                }
    
                // Handle <pre> — may contain a code block div or just preformatted text
                if (tagName === 'pre') {
                    const codeBlockDiv = el.querySelector('[data-code-block]');
                    if (codeBlockDiv) {
                        result += this._walkArenaNodes(el);
                    } else {
                        result += el.textContent + '\n';
                    }
                    continue;
                }
    
                // Handle <br> as newline
                if (tagName === 'br') {
                    result += '\n';
                    continue;
                }
    
                // Handle block elements — add newline after
                if (tagName === 'p' || tagName === 'div') {
                    const inner = this._walkArenaNodes(el);
                    if (inner.length > 0) {
                        result += inner;
                        if (!inner.endsWith('\n')) {
                            result += '\n';
                        }
                    }
                    continue;
                }
    
                // Handle list items
                if (tagName === 'li') {
                    const inner = this._walkArenaNodes(el);
                    result += inner;
                    if (!inner.endsWith('\n')) {
                        result += '\n';
                    }
                    continue;
                }
    
                // Handle list containers
                if (tagName === 'ul' || tagName === 'ol') {
                    result += this._walkArenaNodes(el);
                    continue;
                }
    
                // Handle inline code
                if (tagName === 'code') {
                    result += el.textContent;
                    continue;
                }
    
                // All other inline elements (span, strong, em, a, etc.) — recurse
                result += this._walkArenaNodes(el);
            }
    
            return result;
        }
    
        /**
         * Parse AI response to extract content, tool_calls, and finish_reason.
         * Expects JSON format: {"content": "...", "finish_reason": "...", "tool_calls": [...]}
         * Also handles JSON wrapped in ```json code blocks
         * @param {string} message - The raw message text
         * @returns {{content: string, tool_calls: Array|null, finish_reason: string}} Parsed response
         */
        _parseResponse(message) {
            if (!message) {
                return { content: '', tool_calls: null, finish_reason: 'stop' };
            }
    
            const trimmed = message.trim();
    
            // Try direct JSON first
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    return {
                        content: parsed.content || '',
                        tool_calls: parsed.tool_calls || null,
                        finish_reason: parsed.finish_reason || 'stop'
                    };
                } catch (e) {
                    // Silent fail
                }
            }
    
            // Try to extract JSON from code blocks (use last one)
            const jsonCodeBlockMatches = trimmed.match(/```json\s*([\s\S]*?)\s*```/g);
            if (jsonCodeBlockMatches && jsonCodeBlockMatches.length > 0) {
                const lastMatch = jsonCodeBlockMatches[jsonCodeBlockMatches.length - 1];
                const jsonText = lastMatch.replace(/```json\s*/, '').replace(/\s*```$/, '').trim();
                try {
                    const parsed = JSON.parse(jsonText);
                    return {
                        content: parsed.content || '',
                        tool_calls: parsed.tool_calls || null,
                        finish_reason: parsed.finish_reason || 'stop'
                    };
                } catch (e) {
                    // Silent fail
                }
            }
    
            return { content: message.trim(), tool_calls: null, finish_reason: 'stop' };
        }
    
        async waitForAIResponse(baselineContent = null) {
            const startTime = Date.now();
            const baseline = baselineContent || this.getLatestMessage();
            console.log('🔍 waitForAIResponse: 基准内容:', baseline?.substring(0, 50));
    
            // Track consecutive stable checks to ensure response is truly complete
            let lastContent = null;
            let stableCount = 0;
            const REQUIRED_STABLE_CHECKS = 3;
            const POLL_INTERVAL = 1500;
    
            // Once we detect the AI has started responding (content changed from baseline),
            // we set a per-activity deadline. Every time content changes, the deadline
            // resets to now + 60 seconds. This ensures long AI responses aren't cut short.
            const ACTIVITY_TIMEOUT = 60000; // 1 minute after last content change
            let lastChangeTime = null;  // null = AI hasn't started responding yet
            let aiStartedResponding = false;
    
            while (true) {
                const now = Date.now();
    
                // Check overall timeout (CONFIG.timeouts.responseWait from start)
                if (now - startTime > CONFIG.timeouts.responseWait) {
                    // If AI has been responding, return what we have
                    if (aiStartedResponding && lastContent) {
                        console.warn('⚠️ 全局超时，返回已收到的内容，长度:', lastContent.length);
                        const parsed = this._parseResponse(lastContent);
                        if (parsed.content.length > 0) {
                            return parsed;
                        }
                        return { content: lastContent, tool_calls: null };
                    }
                    throw new Error('等待AI响应超时');
                }
    
                // Check per-activity timeout: if AI started but hasn't produced new
                // content for 1 minute, consider it done
                if (aiStartedResponding && lastChangeTime !== null) {
                    const timeSinceLastChange = now - lastChangeTime;
                    if (timeSinceLastChange > ACTIVITY_TIMEOUT && stableCount >= REQUIRED_STABLE_CHECKS) {
                        console.log('⏰ AI已停止输出超过60秒，返回已收到的内容，长度:', lastContent.length);
                        const parsed = this._parseResponse(lastContent);
                        if (parsed.content.length > 0) {
                            return parsed;
                        }
                        return { content: lastContent, tool_calls: null };
                    }
                }
    
                await delay(POLL_INTERVAL);
    
                const latestMessage = this.getLatestMessage();
                const latestElement = this._getLatestMessageElement();
    
                // Check if content has changed from baseline
                const hasChanged = latestMessage !== null &&
                                  latestMessage.length > 0 &&
                                  latestMessage !== baseline;
    
                console.log(`🔍 检查: 长度=${latestMessage?.length || 0}, 变化=${hasChanged}, 稳定=${stableCount}, ` +
                            `已开始=${aiStartedResponding}, 距上次变化=${lastChangeTime ? Math.round((Date.now() - lastChangeTime) / 1000) + 's' : 'N/A'}`);
    
                if (!hasChanged) {
                    // No change from baseline yet — AI hasn't started responding
                    stableCount = 0;
                    lastContent = null;
                    continue;
                }
    
                // AI has started responding (content differs from baseline)
                if (!aiStartedResponding) {
                    aiStartedResponding = true;
                    lastChangeTime = Date.now();
                    console.log('🟢 检测到AI开始响应');
                }
    
                // Check for JSON code block (Arena.ai streaming responses)
                if (latestElement) {
                    console.log('🔍 [JSON] 检查元素中的JSON代码块...');
                    const jsonData = this._extractJsonFromArenaMessage(latestElement);
                    if (jsonData) {
                        console.log('🔍 [JSON] 检测到JSON代码块响应:', Object.keys(jsonData));
                        await delay(1500);
                        const finalMessage = this.getLatestMessage();
                        const finalElement = this._getLatestMessageElement();
                        const finalJsonData = this._extractJsonFromArenaMessage(finalElement);
                        
                        if (finalJsonData) {
                            return this._parseJsonArenaResponse(finalJsonData);
                        }
                    } else {
                        console.log('🔍 [JSON] 元素中未找到JSON代码块');
                    }
                } else {
                    console.log('🔍 [JSON] latestElement为空');
                }
    
                // Check for JSON in raw text (direct JSON responses)
                if (latestMessage && latestMessage.trim().startsWith('{')) {
                    const jsonData = this._extractJsonFromText(latestMessage);
                    if (jsonData && jsonData.content !== undefined) {
                        console.log('🔍 [JSON] 检测到直接JSON响应');
                        return {
                            content: jsonData.content || '',
                            tool_calls: jsonData.tool_calls || null,
                            finish_reason: jsonData.finish_reason || 'stop'
                        };
                    }
                } else {
                    console.log('🔍 [JSON] 消息不是以{开头, 前50字符:', latestMessage?.substring(0, 50));
                }
    
                // Track stability for response completion
                if (latestMessage === lastContent) {
                    stableCount++;
                    console.log(`🔍 内容未变化，稳定计数: ${stableCount}/${REQUIRED_STABLE_CHECKS}`);
                    
                    // If stable for enough checks and AI has started, return the response
                    if (stableCount >= REQUIRED_STABLE_CHECKS && aiStartedResponding) {
                        console.log('🔍 内容稳定，尝试解析响应...');
                        
                        // Try to parse as JSON one more time before returning
                        if (latestMessage && latestMessage.trim().startsWith('{')) {
                            const jsonData = this._extractJsonFromText(latestMessage);
                            if (jsonData && jsonData.content !== undefined) {
                                console.log('🔍 [JSON] 稳定后解析到JSON响应');
                                return {
                                    content: jsonData.content || '',
                                    tool_calls: jsonData.tool_calls || null,
                                    finish_reason: jsonData.finish_reason || 'stop'
                                };
                            }
                        }
                        
                        // Also try from element
                        if (latestElement) {
                            const jsonData = this._extractJsonFromArenaMessage(latestElement);
                            if (jsonData) {
                                console.log('🔍 [JSON] 稳定后从元素解析到JSON');
                                return this._parseJsonArenaResponse(jsonData);
                            }
                        }
                        
                        // Return as plain text if no JSON found
                        console.log('🔍 返回纯文本响应，长度:', latestMessage?.length || 0);
                        return { content: latestMessage || '', tool_calls: null, finish_reason: 'stop' };
                    }
                }
                
                // Content changed — reset stability counter and update deadline
                if (latestMessage !== lastContent) {
                    stableCount = 0;
                    lastChangeTime = Date.now();
                    console.log('🔄 内容变化，重置活动计时器');
                }
                lastContent = latestMessage;
            }
        }
    
        /**
         * Get the latest AI message element (for Arena.ai).
         * @returns {Element|null}
         */
        _getLatestMessageElement() {
            const container = findElement(CONFIG.selectors.messageListContainer);
            if (!container) return null;
    
            if (window.location.hostname === 'arena.ai' || window.location.hostname.endsWith('.arena.ai')) {
                const messageElements = container.querySelectorAll('.mx-auto.max-w-\\[800px\\]');
                if (messageElements.length === 0) return null;
    
                for (let i = 0; i < messageElements.length; i++) {
                    const el = messageElements[i];
                    if (!el.classList.contains('justify-end')) {
                        const prose = el.querySelector('.prose');
                        if (prose) {
                            return prose;
                        }
                    }
                }
            }
            return null;
        }
    
        /**
         * Parse JSON response from Arena.ai code blocks.
         * @param {Object} jsonData - Parsed JSON object from code block
         * @returns {{content: string, tool_calls: Array|null, finish_reason: string}}
         */
        _parseJsonArenaResponse(jsonData) {
            console.log('🔍 [JSON] 解析Arena.ai JSON响应');
            
            let content = '';
            let toolCalls = null;
            let finishReason = 'stop';
            
            if (jsonData.choices && jsonData.choices.length > 0) {
                const choice = jsonData.choices[0];
                if (choice.message) {
                    content = choice.message.content || '';
                    if (choice.message.tool_calls) {
                        toolCalls = choice.message.tool_calls;
                    }
                }
                if (choice.delta && choice.delta.content) {
                    content = choice.delta.content;
                }
                if (choice.delta && choice.delta.tool_calls) {
                    toolCalls = choice.delta.tool_calls;
                }
                if (choice.finish_reason) {
                    finishReason = choice.finish_reason;
                }
            }
            
            if (jsonData.content !== undefined && jsonData.content !== null) {
                content = jsonData.content;
            }
            
            if (jsonData.tool_calls && !toolCalls) {
                toolCalls = jsonData.tool_calls;
            }
            
            if (jsonData.finish_reason) {
                finishReason = jsonData.finish_reason;
            }
            
            console.log('🔍 [JSON] 内容长度:', content?.length || 0, 'tool_calls:', toolCalls ? toolCalls.length : 0, 'finish_reason:', finishReason);
            
            return { content, tool_calls: toolCalls, finish_reason: finishReason };
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
    
            // 检查是否是 Arena.ai
            if (window.location.hostname === 'arena.ai' || window.location.hostname.endsWith('.arena.ai')) {
                // Arena.ai 使用 .mx-auto.max-w-[800px] 选择器
                // AI 消息没有 justify-end 类，用户消息有 justify-end 类
                const messageElements = container.querySelectorAll('.mx-auto.max-w-\\[800px\\]');
                let aiMessageCount = 0;
    
                messageElements.forEach(el => {
                    if (!el.classList.contains('justify-end')) {
                        // 检查是否有 .prose 内容（AI 消息）
                        if (el.querySelector('.prose')) {
                            aiMessageCount++;
                        }
                    }
                });
    
                if (aiMessageCount === 0) {
                    console.warn('⚠️ Arena.ai 未找到任何AI消息，返回0');
                    return 0;
                }
    
                console.log('🤖 Arena.ai AI消息数量: %d', aiMessageCount);
                return aiMessageCount;
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
    
            // 检查是否是 Arena.ai
            if (window.location.hostname === 'arena.ai' || window.location.hostname.endsWith('.arena.ai')) {
                // Arena.ai 使用 flex-col-reverse，视觉上反转了顺序
                // 在 DOM 中，最新消息是最后一个满足条件的子元素
                const messageElements = container.querySelectorAll('.mx-auto.max-w-\\[800px\\]');
                if (messageElements.length === 0) {
                    console.warn('⚠️ Arena.ai 未找到消息元素，返回null');
                    return null;
                }
    
                // 由于 flex-col-reverse，DOM 中第一个元素是视觉上最新的
                // 所以应该取第一个找到的 AI 消息（没有 justify-end 类的）
                let latestAIMessage = null;
                for (let i = 0; i < messageElements.length; i++) {
                    const el = messageElements[i];
                    // 检查是否是 AI 消息（没有 justify-end 类）
                    if (!el.classList.contains('justify-end')) {
                        const prose = el.querySelector('.prose');
                        if (prose) {
                            latestAIMessage = prose;
                            // 由于 flex-col-reverse，第一个找到的就是最新的，退出循环
                            break;
                        }
                    }
                }
    
                if (!latestAIMessage) {
                    console.warn('⚠️ Arena.ai 未找到AI消息内容，返回null');
                    return null;
                }
    
                console.log('🤖 Arena.ai 最新AI消息已找到');
                // Use specialized Arena extractor to skip code block UI chrome
                return this._extractArenaMessage(latestAIMessage);
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

})();
