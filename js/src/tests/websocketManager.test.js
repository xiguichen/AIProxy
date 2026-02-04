import { WebSocketManager } from '../modules/websocketManager.js';

describe('WebSocketManager', () => {
    let wsManager;
    let mockAIChatForwarder;

    beforeEach(() => {
        mockAIChatForwarder = {
            retryCount: 0,
            scheduleRetry: jest.fn(),
            handleCompletionRequest: jest.fn()
        };
        wsManager = new WebSocketManager('ws://localhost:8000/ws', mockAIChatForwarder);
    });

    test('should initialize with correct server URL', () => {
        expect(wsManager.wsServer).toBe('ws://localhost:8000/ws');
    });

    test('should handle connection errors', (done) => {
        // Mock WebSocket to reject
        const mockWebSocket = jest.fn(() => {
            const ws = {
                onopen: null,
                onerror: null,
                onmessage: null,
                onclose: null,
                send: jest.fn()
            };
            // Simulate error
            setTimeout(() => {
                if (ws.onerror) {
                    ws.onerror(new Error('Connection failed'));
                }
            }, 0);
            return ws;
        });
        
        global.WebSocket = mockWebSocket;

        wsManager.connect().catch((error) => {
            expect(error.message).toBe('Connection failed');
            done();
        });
    });

    test('should have sendMessage method', () => {
        expect(typeof wsManager.sendMessage).toBe('function');
    });
});