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

describe('DOMManager - getMessageCount for Yuanbao', () => {
    let domManager;
    let originalHostname;

    beforeEach(() => {
        domManager = new DOMManager();
        originalHostname = window.location.hostname;
        // Mock hostname to yuanbao.tencent.com
        Object.defineProperty(window, 'location', {
            value: { hostname: 'yuanbao.tencent.com' },
            writable: true
        });
        CONFIG.selectors.messageListContainer = ['.agent-chat__list'];
    });

    afterEach(() => {
        // Restore original hostname
        Object.defineProperty(window, 'location', {
            value: { hostname: originalHostname },
            writable: true
        });
    });

    test('should return 0 when no messages exist', () => {
        document.body.innerHTML = '<div class="agent-chat__list"></div>';
        
        const count = domManager.getMessageCount();
        
        expect(count).toBe(0);
    });

    test('should return 2 for HTML with 2 AI messages', () => {
        // 使用真实的 Yuanbao HTML 结构
        document.body.innerHTML = `
            <div class="agent-chat__list">
                <div class="agent-chat__list__item agent-chat__list__item--ai">
                    <div class="hyc-component-reasoner">
                        <div class="hyc-component-reasoner__text">
                            <div class="ybc-p">Hello! Thank you for your greeting.</div>
                            <div class="ybc-p">As an AI assistant, I don't have feelings.</div>
                        </div>
                    </div>
                </div>
                <div class="agent-chat__list__item agent-chat__list__item--ai">
                    <div class="hyc-component-reasoner">
                        <div class="hyc-component-reasoner__text">
                            <div class="ybc-p">Today is Thursday, February 5, 2026.</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const count = domManager.getMessageCount();
        
        expect(count).toBe(2);
    });

    test('should return 1 when only one AI message exists', () => {
        document.body.innerHTML = `
            <div class="agent-chat__list">
                <div class="agent-chat__list__item agent-chat__list__item--ai">
                    <div class="hyc-component-reasoner">
                        <div class="hyc-component-reasoner__text">
                            <div class="ybc-p">Single message content</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const count = domManager.getMessageCount();
        
        expect(count).toBe(1);
    });

    test('should return 0 when container not found', () => {
        document.body.innerHTML = '<div></div>';
        
        const count = domManager.getMessageCount();
        
        expect(count).toBe(0);
    });
});