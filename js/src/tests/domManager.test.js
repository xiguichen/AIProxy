import { DOMManager } from '../modules/domManager.js';
import { CONFIG } from '../modules/config.js';

describe('DOMManager', () => {
    let domManager;

    beforeEach(() => {
        domManager = new DOMManager();
        document.body.innerHTML = '<div class="message-container"></div>';
    });

    test('should wait for element to appear', async () => {
        setTimeout(() => {
            document.body.innerHTML += '<div class="test-element"></div>';
        }, 100);

        const element = await domManager.waitForElement(['.test-element'], 500);
        expect(element).not.toBeNull();
    });

    test('should throw error if element does not appear', async () => {
        await expect(domManager.waitForElement(['.non-existent'], 200)).rejects.toThrow('等待元素超时');
    });
});