// DOM 操作模块
import { CONFIG } from './config.js';
import { findElement, delay, extractMessageText, isAIMessage } from './utils.js';

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

    async waitForAIResponse() {
        const startTime = Date.now();
        let lastMessageCount = this.getMessageCount();

        while (Date.now() - startTime < CONFIG.timeouts.responseWait) {
            await delay(1000);

            const currentMessageCount = this.getMessageCount();
            const latestMessage = this.getLatestMessage();

            // 检测到新消息且是AI的回复
            if (currentMessageCount > lastMessageCount && latestMessage) {
                const messageText = extractMessageText(latestMessage);
                if (messageText && isAIMessage(latestMessage)) {
                    console.log('🤖 收到AI回复，长度:', messageText.length);
                    return messageText;
                }
            }

            lastMessageCount = currentMessageCount;
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
            
            if (count === 0) {
                console.warn('⚠️ 未找到任何AI消息，返回0');
                return 0;
            }

            console.log('🤖 元宝AI消息数量:', count);
            return count;
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
            // 查找最后一个 class 为 'hyc-component-reasoner__text' 的元素
            const lastReasonerTextElement = container.querySelector('.hyc-component-reasoner__text:last-of-type');
            if (!lastReasonerTextElement) {
                console.warn('⚠️ 未找到任何AI消息内容，返回null');
                return null;
            }

            console.log('🤖 元宝最新AI消息元素已找到:', lastReasonerTextElement);

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