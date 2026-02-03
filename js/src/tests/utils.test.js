import { delay, findElement } from '../modules/utils.js';

describe('delay', () => {
    test('should delay execution for specified time', async () => {
        const start = Date.now();
        await delay(100);
        const end = Date.now();
        expect(end - start).toBeGreaterThanOrEqual(100);
    });
});

describe('findElement', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div class="test"></div>';
    });

    test('should find element by selector', () => {
        const element = findElement(['.test']);
        expect(element).not.toBeNull();
    });

    test('should return null if no element matches', () => {
        const element = findElement(['.non-existent']);
        expect(element).toBeNull();
    });
});