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

            if (latestMessage && latestMessage.length > 0 && latestMessage !== baseline) {
                await delay(2000);
                const stableMessage = this.getLatestMessage();

                if (stableMessage && stableMessage.includes('<response_done>')) {
                    const contentStart = stableMessage.indexOf('<content>') + '<content>'.length;
                    const contentEnd = stableMessage.indexOf('</content>');
                    const toolCallsStart = stableMessage.indexOf('<tool_calls>');
                    const toolCallsEnd = stableMessage.indexOf('</tool_calls>');

                    let finalContent = '';
                    let toolCalls = null;

                    if (contentStart > -1 && contentEnd > -1) {
                        finalContent = stableMessage.substring(contentStart, contentEnd).trim();
                    } else {
                        finalContent = stableMessage.split('<response_done>')[0].trim();
                    }

                    if (toolCallsStart > -1 && toolCallsEnd > -1) {
                        const toolCallsJson = stableMessage.substring(toolCallsStart + '<tool_calls>'.length, toolCallsEnd).trim();
                        try {
                            toolCalls = JSON.parse(toolCallsJson);
                        } catch (e) {
                            console.warn('⚠️ 解析tool_calls失败:', e);
                        }
                    }

                    console.log('🤖 收到AI回复（XML格式），内容长度:', finalContent.length, 'tool_calls:', toolCalls ? toolCalls.length : 0);
                    return { content: finalContent, tool_calls: toolCalls };
                }

                if (stableMessage && stableMessage.length > 0 && stableMessage !== baseline) {
                    console.log('🤖 收到AI回复，长度:', stableMessage.length, '内容:', stableMessage.substring(0, 50));
                    return { content: stableMessage, tool_calls: null };
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
            return latestAIMessage.textContent.trim();
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