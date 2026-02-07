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

    test('arena.ai should have correct selectors', () => {
        const arenaConfig = WEBSITE_SELECTORS['arena.ai'];
        expect(arenaConfig).toBeDefined();
        expect(arenaConfig.inputBox).toContain('textarea[name="message"]');
        expect(arenaConfig.sendButton).toContain('button[type="submit"]');
        expect(arenaConfig.pageReadyIndicator).toContain('#chat-area');
        expect(arenaConfig.pageReadyIndicator).toContain('#root-portal-target');
        expect(arenaConfig.messageListContainer).toContain('main');
    });

    test('arena.ai should have all required fields', () => {
        const arenaConfig = WEBSITE_SELECTORS['arena.ai'];
        expect(arenaConfig.inputBox).toBeDefined();
        expect(arenaConfig.sendButton).toBeDefined();
        expect(arenaConfig.pageReadyIndicator).toBeDefined();
        expect(arenaConfig.messageListContainer).toBeDefined();
        expect(arenaConfig.latestMessage).toBeDefined();
        expect(Array.isArray(arenaConfig.inputBox)).toBe(true);
        expect(Array.isArray(arenaConfig.sendButton)).toBe(true);
    });

    test('arena.ai latestMessage should use flex-col-reverse compatible selector', () => {
        const arenaConfig = WEBSITE_SELECTORS['arena.ai'];
        // Arena.ai uses flex-col-reverse. AI messages lack 'justify-end' class.
        // The latest AI message is identified by filtering for elements without 'justify-end'.
        expect(arenaConfig.latestMessage).toContain('ol.mt-8.flex');
    });
});