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
});