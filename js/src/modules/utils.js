// 工具函数模块

/**
 * 延迟函数
 * @param {number} ms - 延迟的毫秒数
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 查找元素
 * @param {string[]} selectorsArray - CSS选择器数组
 * @returns {Element|null}
 */
export function findElement(selectorsArray) {
    for (const selector of selectorsArray) {
        const element = document.querySelector(selector);
        if (element) {
            return element;
        }
    }
    return null;
}

/**
 * 提取消息文本
 * @param {Element} messageElement - 消息元素
 * @returns {string}
 */
export function extractMessageText(messageElement) {
    // 尝试不同的文本提取方法
    const text = messageElement.textContent || messageElement.innerText || '';
    return text.trim().replace(/\s+/g, ' ');
}

/**
 * 判断是否为AI消息
 * @param {Element} element - DOM元素
 * @returns {boolean}
 */
export function isAIMessage(element) {
    // 根据类名或属性判断是否为AI消息
    const classList = element.className || '';
    return classList.includes('ai-') ||
           classList.includes('bot-') ||
           classList.includes('assistant-') ||
           element.querySelector('[data-ai-message]') !== null;
}