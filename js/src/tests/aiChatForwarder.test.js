import { AIChatForwarder } from '../modules/aiChatForwarder.js';
import { CONFIG } from '../modules/config.js';

describe('AIChatForwarder', () => {
    let forwarder;

    beforeEach(() => {
        forwarder = new AIChatForwarder();
        CONFIG.selectors = {
            pageReadyIndicator: ['.message-container'],
            messageListContainer: ['.message-container']
        };
        document.body.innerHTML = '<div class="message-container"></div>';
    });

    test('should initialize without errors', async () => {
        jest.spyOn(forwarder.domManager, 'waitForElement').mockResolvedValue(document.querySelector('.message-container'));
        jest.spyOn(forwarder.wsManager, 'connect').mockResolvedValue();

        await expect(forwarder.init()).resolves.not.toThrow();
    });

    test('should handle initialization failure', async () => {
        jest.spyOn(forwarder.domManager, 'waitForElement').mockRejectedValue(new Error('Initialization failed'));

        await expect(forwarder.init()).rejects.toThrow('Initialization failed');
    });
});