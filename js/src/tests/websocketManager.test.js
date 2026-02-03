import { WebSocketManager } from '../modules/websocketManager.js';

describe('WebSocketManager', () => {
    let wsManager;

    beforeEach(() => {
        wsManager = new WebSocketManager('ws://localhost:8000/ws');
    });

    test('should initialize with correct server URL', () => {
        expect(wsManager.wsServer).toBe('ws://localhost:8000/ws');
    });

    test('should handle connection errors', async () => {
        jest.spyOn(global, 'WebSocket').mockImplementation(() => {
            throw new Error('Connection failed');
        });

        await expect(wsManager.connect()).rejects.toThrow('Connection failed');
    });

    test('should retry connection on failure', () => {
        jest.useFakeTimers();
        wsManager.scheduleRetry();
        expect(setTimeout).toHaveBeenCalled();
    });
});