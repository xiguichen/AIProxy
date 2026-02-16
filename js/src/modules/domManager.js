// DOM 操作模块
import { CONFIG } from './config.js';
import { findElement, delay, randomDelay, extractMessageText, isAIMessage } from './utils.js';

export class DOMManager {
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
