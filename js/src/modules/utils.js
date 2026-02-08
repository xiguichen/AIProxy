// 工具函数模块

let wsManager = null;

export function setWsManager(manager) {
    wsManager = manager;
}

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带随机性的延迟函数，模拟人类行为
 * @param {number} minMs 最小延迟时间（毫秒）
 * @param {number} maxMs 最大延迟时间（毫秒）
 * @returns {Promise<void>}
 */
export function randomDelay(minMs, maxMs) {
    const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * 随机选择一个延迟值
 * @param {Array<number>} delays 延迟时间数组
 * @returns {number} 随机选择的延迟时间
 */
export function randomChoice(delays) {
    return delays[Math.floor(Math.random() * delays.length)];
}

export function findElement(selectorsArray) {
    for (const selector of selectorsArray) {
        const element = document.querySelector(selector);
        if (element) {
            return element;
        }
    }
    return null;
}

export function extractMessageText(messageElement) {
    const text = messageElement.textContent || messageElement.innerText || '';
    return text.trim().replace(/\s+/g, ' ');
}

export function isAIMessage(element) {
    const classList = element.className || '';
    return classList.includes('ai-') ||
           classList.includes('bot-') ||
           classList.includes('assistant-') ||
           element.querySelector('[data-ai-message]') !== null;
}

export const LOG_LEVELS = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error'
};

const localLogs = [];
const MAX_LOCAL_LOGS = 100;

export function log(level, category, message, data = null) {
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

export function debug(category, message, data) { return log(LOG_LEVELS.DEBUG, category, message, data); }
export function info(category, message, data) { return log(LOG_LEVELS.INFO, category, message, data); }
export function warn(category, message, data) { return log(LOG_LEVELS.WARN, category, message, data); }
export function error(category, message, data) { return log(LOG_LEVELS.ERROR, category, message, data); }
