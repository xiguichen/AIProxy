// 配置模块

/**
 * 不同网站的CSS选择器配置
 * 可根据具体网站结构调整这些选择器
 */
export const WEBSITE_SELECTORS = {
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
export const CONFIG = {
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