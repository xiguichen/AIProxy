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

describe('DOMManager - getMessageCount for Arena.ai', () => {
    let domManager;
    let originalHostname;

    beforeEach(() => {
        domManager = new DOMManager();
        originalHostname = window.location.hostname;
        Object.defineProperty(window, 'location', {
            value: { hostname: 'arena.ai' },
            writable: true
        });
        CONFIG.selectors.messageListContainer = ['main'];
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            value: { hostname: originalHostname },
            writable: true
        });
    });

    test('should return 0 when no messages exist', () => {
        document.body.innerHTML = '<main><ol class="mt-8 flex"></ol></main>';
        
        const count = domManager.getMessageCount();
        
        expect(count).toBe(0);
    });

    test('should return 1 for single AI message', () => {
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">Single AI message</div>
                        </div>
                    </ol>
                </div>
            </main>
        `;
        
        const count = domManager.getMessageCount();
        
        expect(count).toBe(1);
    });

    test('should return 3 for 3 AI messages', () => {
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">AI message 1</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 flex w-full justify-end">
                            <div class="prose">User message</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">AI message 2</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">AI message 3</div>
                        </div>
                    </ol>
                </div>
            </main>
        `;
        
        const count = domManager.getMessageCount();
        
        // Should count only AI messages (no justify-end class)
        expect(count).toBe(3);
    });

    test('should not count user messages (justify-end)', () => {
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">AI 1</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 flex w-full justify-end">
                            <div class="prose">User 1</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 flex w-full justify-end">
                            <div class="prose">User 2</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">AI 2</div>
                        </div>
                    </ol>
                </div>
            </main>
        `;
        
        const count = domManager.getMessageCount();
        
        // Should count only 2 AI messages
        expect(count).toBe(2);
    });

    test('should return 0 when no prose elements found', () => {
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="other-class">No prose here</div>
                        </div>
                    </ol>
                </div>
            </main>
        `;
        
        const count = domManager.getMessageCount();
        
        expect(count).toBe(0);
    });

    test('should handle subdomain arena.ai', () => {
        Object.defineProperty(window, 'location', {
            value: { hostname: 'www.arena.ai' },
            writable: true
        });
        
        document.body.innerHTML = `
            <main>
                <ol class="mt-8 flex flex-col-reverse">
                    <div class="mx-auto max-w-[800px] px-4 w-full">
                        <div class="prose">Message from subdomain</div>
                    </div>
                </ol>
            </main>
        `;
        
        const count = domManager.getMessageCount();
        
        expect(count).toBe(1);
    });

    test('should return 0 when messageElements is empty', () => {
        document.body.innerHTML = '<main><div></div></main>';
        
        const count = domManager.getMessageCount();
        
        expect(count).toBe(0);
    });
});

describe('DOMManager - getLatestMessage for Arena.ai', () => {
    let domManager;
    let originalHostname;

    beforeEach(() => {
        domManager = new DOMManager();
        originalHostname = window.location.hostname;
        // Mock hostname to arena.ai
        Object.defineProperty(window, 'location', {
            value: { hostname: 'arena.ai' },
            writable: true
        });
        CONFIG.selectors.messageListContainer = ['main'];
        CONFIG.selectors.latestMessage = ['ol.mt-8.flex > div.mx-auto.max-w-[800px]:first-child .prose'];
    });

    afterEach(() => {
        // Restore original hostname
        Object.defineProperty(window, 'location', {
            value: { hostname: originalHostname },
            writable: true
        });
    });

    test('should return null when no messages exist', () => {
        document.body.innerHTML = '<main><ol class="mt-8 flex"></ol></main>';
        
        const message = domManager.getLatestMessage();
        
        expect(message).toBeNull();
    });

    test('should return latest AI message from flex-col-reverse layout', () => {
        // Arena.ai uses flex-col-reverse
        // DOM order: oldest -> newest
        // Visual order: newest -> oldest (reversed by CSS)
        // First child in DOM = newest visually
        // We should return the FIRST AI message (no justify-end) in DOM
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="h-0"></div>
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">Oldest AI message (first child in DOM)</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 flex w-full justify-end">
                            <div class="prose">User message 1</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">Middle AI message</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 flex w-full justify-end">
                            <div class="prose">User message 2</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">Newest AI message (last child in DOM)</div>
                        </div>
                    </ol>
                </div>
            </main>
        `;
        
        const message = domManager.getLatestMessage();
        
        // Should return the FIRST AI message (no justify-end) in DOM due to flex-col-reverse
        expect(message).toBe('Oldest AI message (first child in DOM)');
    });

    test('should return message content correctly', () => {
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">Hello! Here is a Python sample:</div>
                        </div>
                    </ol>
                </div>
            </main>
        `;
        
        const message = domManager.getLatestMessage();
        
        expect(message).toBe('Hello! Here is a Python sample:');
    });

    test('should return null when prose element not found', () => {
        document.body.innerHTML = `
            <main>
                <ol class="mt-8 flex flex-col-reverse">
                    <div class="mx-auto max-w-[800px] px-4 w-full">
                        <div class="other-class">No prose here</div>
                    </div>
                </ol>
            </main>
        `;
        
        const message = domManager.getLatestMessage();
        
        expect(message).toBeNull();
    });

    test('should return correct message with multiple AI messages in flex-col-reverse', () => {
        // Arena.ai uses flex-col-reverse:
        // - DOM order: oldest to newest
        // - Visual order: newest to oldest
        // - First child in DOM = newest visually
        // - We should return the FIRST AI message (no justify-end) in DOM
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="h-0"></div>
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">First AI message (oldest in DOM, first child)</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 flex w-full justify-end">
                            <div class="prose">User message 1</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">Second AI message</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 flex w-full justify-end">
                            <div class="prose">User message 2</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">Third AI message (newest in DOM, last child)</div>
                        </div>
                    </ol>
                </div>
            </main>
        `;
        
        const message = domManager.getLatestMessage();
        
        // Should return FIRST AI message (no justify-end) in DOM due to flex-col-reverse
        expect(message).toBe('First AI message (oldest in DOM, first child)');
    });

    test('should return message when only AI messages present', () => {
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">Single AI message</div>
                        </div>
                    </ol>
                </div>
            </main>
        `;
        
        const message = domManager.getLatestMessage();
        
        expect(message).toBe('Single AI message');
    });

    test('should return latest AI message after user message', () => {
        // After a user message, the next AI message should be captured
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">Oldest AI</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 flex w-full justify-end">
                            <div class="prose">User question</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">AI Response to question</div>
                        </div>
                    </ol>
                </div>
            </main>
        `;
        
        const message = domManager.getLatestMessage();
        
        // Should return the first AI message (no justify-end) in DOM
        expect(message).toBe('Oldest AI');
    });

    test('should handle subdomain arena.ai', () => {
        Object.defineProperty(window, 'location', {
            value: { hostname: 'www.arena.ai' },
            writable: true
        });
        
        document.body.innerHTML = `
            <main>
                <ol class="mt-8 flex flex-col-reverse">
                    <div class="mx-auto max-w-[800px] px-4 w-full">
                        <div class="prose">Message from subdomain</div>
                    </div>
                </ol>
            </main>
        `;
        
        const message = domManager.getLatestMessage();
        
        expect(message).toBe('Message from subdomain');
    });

    test('should return null when container is empty', () => {
        document.body.innerHTML = '<main><ol class="mt-8 flex flex-col-reverse"></ol></main>';
        
        const message = domManager.getLatestMessage();
        
        expect(message).toBeNull();
    });

    test('should skip user messages with justify-end class', () => {
        // User messages have justify-end class, should be skipped
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 flex w-full justify-end">
                            <div class="prose">User message should be skipped</div>
                        </div>
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">AI message should be returned</div>
                        </div>
                    </ol>
                </div>
            </main>
        `;
        
        const message = domManager.getLatestMessage();
        
        expect(message).toBe('AI message should be returned');
    });
});

describe('DOMManager - Arena.ai JSON Code Block Parsing', () => {
    let domManager;
    let originalHostname;

    beforeEach(() => {
        domManager = new DOMManager();
        originalHostname = window.location.hostname;
        Object.defineProperty(window, 'location', {
            value: { hostname: 'arena.ai' },
            writable: true
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            value: { hostname: originalHostname },
            writable: true
        });
    });

    test('_extractJsonFromArenaMessage should parse JSON code block correctly', () => {
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">
                                <div class="not-prose my-0 flex w-full flex-col overflow-clip border border-border text-text-primary rounded-lg not-prose relative" data-code-block="true">
                                    <div class="border-border flex items-center justify-between border-b px-4 py-2">
                                        <div class="flex items-center gap-2">
                                            <span class="text-text-secondary text-sm font-medium">JSON</span>
                                        </div>
                                    </div>
                                    <div class="code-block_container__lbMX4">
                                        <pre class="shiki github-light shiki-code-block">
                                            <code class="whitespace-pre-wrap break-words">
                                                <span class="line"><span style="color:#24292E">{</span></span>
                                                <span class="line"><span style="color:#005CC5">  "id"</span><span style="color:#24292E">: </span><span style="color:#032F62">"chatcmpl-abc123"</span><span style="color:#24292E">,</span></span>
                                                <span class="line"><span style="color:#005CC5">  "object"</span><span style="color:#24292E">: </span><span style="color:#032F62">"chat.completion"</span><span style="color:#24292E">,</span></span>
                                                <span class="line"><span style="color:#005CC5">  "model"</span><span style="color:#24292E">: </span><span style="color:#032F62">"gpt-4"</span><span style="color:#24292E">,</span></span>
                                                <span class="line"><span style="color:#005CC5">  "choices"</span><span style="color:#24292E">: [</span></span>
                                                <span class="line"><span style="color:#24292E">    {</span></span>
                                                <span class="line"><span style="color:#005CC5">      "finish_reason"</span><span style="color:#24292E">: </span><span style="color:#032F62">"tool_calls"</span></span>
                                                <span class="line"><span style="color:#24292E">    }</span></span>
                                                <span class="line"><span style="color:#24292E">  ]</span></span>
                                                <span class="line"><span style="color:#24292E">}</span></span>
                                            </code>
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ol>
                </div>
            </main>
        `;

        const proseElement = document.querySelector('.prose');
        const result = domManager._extractJsonFromArenaMessage(proseElement);

        expect(result).not.toBeNull();
        expect(result.id).toBe('chatcmpl-abc123');
        expect(result.object).toBe('chat.completion');
        expect(result.model).toBe('gpt-4');
        expect(result.choices).toHaveLength(1);
        expect(result.choices[0].finish_reason).toBe('tool_calls');
    });

    test('_extractJsonFromArenaMessage should extract tool_calls with nested JSON arguments', () => {
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">
                                <div class="not-prose my-0 flex w-full flex-col overflow-clip border border-border text-text-primary rounded-lg not-prose relative" data-code-block="true">
                                    <div class="border-border flex items-center justify-between border-b px-4 py-2">
                                        <div class="flex items-center gap-2">
                                            <span class="text-text-secondary text-sm font-medium">JSON</span>
                                        </div>
                                    </div>
                                    <div class="code-block_container__lbMX4">
                                        <pre class="shiki github-light shiki-code-block">
                                            <code class="whitespace-pre-wrap break-words">
                                                <span class="line"><span style="color:#24292E">{</span></span>
                                                <span class="line"><span style="color:#005CC5">  "content"</span><span style="color:#24292E">: </span><span style="color:#005CC5">null</span><span style="color:#24292E">,</span></span>
                                                <span class="line"><span style="color:#005CC5">  "finish_reason"</span><span style="color:#24292E">: </span><span style="color:#032F62">"tool_calls"</span><span style="color:#24292E">,</span></span>
                                                <span class="line"><span style="color:#005CC5">  "tool_calls"</span><span style="color:#24292E">: [</span></span>
                                                <span class="line"><span style="color:#24292E">    {</span></span>
                                                <span class="line"><span style="color:#005CC5">      "id"</span><span style="color:#24292E">: </span><span style="color:#032F62">"call_001"</span><span style="color:#24292E">,</span></span>
                                                <span class="line"><span style="color:#005CC5">      "type"</span><span style="color:#24292E">: </span><span style="color:#032F62">"function"</span><span style="color:#24292E">,</span></span>
                                                <span class="line"><span style="color:#005CC5">      "function"</span><span style="color:#24292E">: {</span></span>
                                                <span class="line"><span style="color:#005CC5">        "name"</span><span style="color:#24292E">: </span><span style="color:#032F62">"write_todos"</span><span style="color:#24292E">,</span></span>
                                                <span class="line"><span style="color:#005CC5">        "arguments"</span><span style="color:#24292E">: </span><span style="color:#032F62">"{\\"todos\\":[{\\"id\\":\\"1\\",\\"content\\":\\"test\\"}]}"</span></span>
                                                <span class="line"><span style="color:#24292E">      }</span></span>
                                                <span class="line"><span style="color:#24292E">    }</span></span>
                                                <span class="line"><span style="color:#24292E">  ]</span></span>
                                                <span class="line"><span style="color:#24292E">}</span></span>
                                            </code>
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ol>
                </div>
            </main>
        `;

        const proseElement = document.querySelector('.prose');
        const result = domManager._extractJsonFromArenaMessage(proseElement);

        expect(result).not.toBeNull();
        expect(result.content).toBeNull();
        expect(result.finish_reason).toBe('tool_calls');
        expect(result.tool_calls).toHaveLength(1);
        expect(result.tool_calls[0].id).toBe('call_001');
        expect(result.tool_calls[0].function.name).toBe('write_todos');
        expect(result.tool_calls[0].function.arguments).toBe('{"todos":[{"id":"1","content":"test"}]}');
    });

    test('_extractJsonFromArenaMessage should return null when no JSON code block found', () => {
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">
                                <p>Just regular text, no code block</p>
                            </div>
                        </div>
                    </ol>
                </div>
            </main>
        `;

        const proseElement = document.querySelector('.prose');
        const result = domManager._extractJsonFromArenaMessage(proseElement);

        expect(result).toBeNull();
    });

    test('_extractJsonFromArenaMessage should return null when code block is not JSON', () => {
        document.body.innerHTML = `
            <main>
                <div id="chat-area">
                    <ol class="mt-8 flex flex-col-reverse">
                        <div class="mx-auto max-w-[800px] px-4 w-full">
                            <div class="prose">
                                <div class="not-prose my-0 flex w-full flex-col overflow-clip border border-border text-text-primary rounded-lg not-prose relative" data-code-block="true">
                                    <div class="border-border flex items-center justify-between border-b px-4 py-2">
                                        <div class="flex items-center gap-2">
                                            <span class="text-text-secondary text-sm font-medium">Python</span>
                                        </div>
                                    </div>
                                    <div class="code-block_container__lbMX4">
                                        <pre class="shiki">
                                            <code>
                                                <span class="line">print("hello world")</span>
                                            </code>
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ol>
                </div>
            </main>
        `;

        const proseElement = document.querySelector('.prose');
        const result = domManager._extractJsonFromArenaMessage(proseElement);

        expect(result).toBeNull();
    });

    test('_parseJsonArenaResponse should correctly parse JSON with tool_calls', () => {
        const jsonData = {
            id: 'chatcmpl-abc123',
            object: 'chat.completion',
            created: 1699000000,
            model: 'gpt-4',
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [
                            {
                                id: 'call_001',
                                type: 'function',
                                function: {
                                    name: 'write_todos',
                                    arguments: '{"todos":[{"id":"1","content":"test","status":"doing","priority":"high"}]}'
                                }
                            }
                        ]
                    },
                    finish_reason: 'tool_calls'
                }
            ],
            usage: {
                prompt_tokens: 350,
                completion_tokens: 200,
                total_tokens: 550
            }
        };

        const result = domManager._parseJsonArenaResponse(jsonData);

        expect(result.content).toBe('');
        expect(result.tool_calls).toHaveLength(1);
        expect(result.tool_calls[0].function.name).toBe('write_todos');
        expect(result.finish_reason).toBe('tool_calls');
    });

    test('_parseJsonArenaResponse should correctly parse JSON with content', () => {
        const jsonData = {
            content: 'Hello, this is my response',
            finish_reason: 'stop'
        };

        const result = domManager._parseJsonArenaResponse(jsonData);

        expect(result.content).toBe('Hello, this is my response');
        expect(result.tool_calls).toBeNull();
        expect(result.finish_reason).toBe('stop');
    });

    test('_extractJsonFromText should parse valid JSON string', () => {
        const jsonString = '{"content": "test response", "finish_reason": "stop"}';
        
        const result = domManager._extractJsonFromText(jsonString);
        
        expect(result).not.toBeNull();
        expect(result.content).toBe('test response');
        expect(result.finish_reason).toBe('stop');
    });

    test('_extractJsonFromText should return null for non-JSON string', () => {
        const text = 'This is just plain text response';
        
        const result = domManager._extractJsonFromText(text);
        
        expect(result).toBeNull();
    });

    test('_extractJsonFromText should return null for invalid JSON', () => {
        const invalidJson = '{not valid json';
        
        const result = domManager._extractJsonFromText(invalidJson);
        
        expect(result).toBeNull();
    });

    test('_extractJsonFromText should parse JSON from code block', () => {
        const text = 'Here is the response:\n```json\n{"content": "test response", "finish_reason": "stop"}\n```';
        
        const result = domManager._extractJsonFromText(text);
        
        expect(result).not.toBeNull();
        expect(result.content).toBe('test response');
        expect(result.finish_reason).toBe('stop');
    });

    test('_extractJsonFromText should parse JSON from code block with extra whitespace', () => {
        const text = '```json\n  {"content": "hello", "finish_reason": "stop"}\n  ```';
        
        const result = domManager._extractJsonFromText(text);
        
        expect(result).not.toBeNull();
        expect(result.content).toBe('hello');
        expect(result.finish_reason).toBe('stop');
    });

    test('_parseResponse should parse JSON from code block', () => {
        const message = 'Here is my response:\n```json\n{"content": "test", "finish_reason": "stop"}\n```';
        
        const result = domManager._parseResponse(message);
        
        expect(result.content).toBe('test');
        expect(result.finish_reason).toBe('stop');
    });

    test('_parseResponse should parse JSON from code block with tool_calls', () => {
        const message = '```json\n{"content": "", "finish_reason": "tool_calls", "tool_calls": [{"id": "1", "type": "function", "function": {"name": "test", "arguments": "{}"}}]}\n```';
        
        const result = domManager._parseResponse(message);
        
        expect(result.content).toBe('');
        expect(result.finish_reason).toBe('tool_calls');
        expect(result.tool_calls).toHaveLength(1);
        expect(result.tool_calls[0].function.name).toBe('test');
    });

    test('_parseResponse should use last JSON code block when multiple present', () => {
        const message = 'Some text before\n```json\n{"content": "first", "finish_reason": "stop"}\n```\n\n```json\n{"content": "last response", "finish_reason": "stop"}\n```';
        
        const result = domManager._parseResponse(message);
        
        expect(result.content).toBe('last response');
    });

    test('_extractJsonFromText should use last JSON code block when multiple present', () => {
        const text = '```json\n{"content": "first"}\n```\n\n```json\n{"content": "last", "finish_reason": "stop"}\n```';
        
        const result = domManager._extractJsonFromText(text);
        
        expect(result.content).toBe('last');
    });
});