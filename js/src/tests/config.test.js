import { CONFIG, WEBSITE_SELECTORS } from '../modules/config.js';

describe('CONFIG', () => {
    test('should have default WebSocket server', () => {
        expect(CONFIG.wsServer).toBe('ws://localhost:8000/ws');
    });

    test('should have default timeouts', () => {
        expect(CONFIG.timeouts.elementWait).toBe(10000);
        expect(CONFIG.timeouts.messageSend).toBe(30000);
        expect(CONFIG.timeouts.responseWait).toBe(120000);
        expect(CONFIG.timeouts.reconnect).toBe(5000);
    });
});

describe('WEBSITE_SELECTORS', () => {
    test('should have selectors for chat.openai.com', () => {
        expect(WEBSITE_SELECTORS['chat.openai.com']).toBeDefined();
    });

    test('should have default selectors', () => {
        expect(WEBSITE_SELECTORS['default']).toBeDefined();
    });
    
    test('should have pageReadyIndicator and messageListContainer for all platforms', () => {
        for (const [platform, config] of Object.entries(WEBSITE_SELECTORS)) {
            expect(config.pageReadyIndicator).toBeDefined();
            expect(config.messageListContainer).toBeDefined();
            expect(Array.isArray(config.pageReadyIndicator)).toBe(true);
            expect(Array.isArray(config.messageListContainer)).toBe(true);
        }
    });
    
    test('should not have messageContainer field (deprecated)', () => {
        for (const [platform, config] of Object.entries(WEBSITE_SELECTORS)) {
            expect(config.messageContainer).toBeUndefined();
        }
    });
    
    test('yuanbao should have correct selectors', () => {
        const yuanbaoConfig = WEBSITE_SELECTORS['yuanbao.tencent.com'];
        expect(yuanbaoConfig.pageReadyIndicator).toContain('.agent-chat__input-box');
        expect(yuanbaoConfig.messageListContainer).toContain('.agent-chat__list');
    });
});