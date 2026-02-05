// 主逻辑模块
import { CONFIG } from './config.js';
import { WebSocketManager } from './websocketManager.js';
import { DOMManager } from './domManager.js';
import { delay } from './utils.js';

export class AIChatForwarder {
    constructor() {
        this.wsManager = new WebSocketManager(CONFIG.wsServer, this);
        this.domManager = new DOMManager(this);
        this.ws = null;
        this.clientId = null;
        this.isConnected = false;
        this.currentRequestId = null;
        this.pendingRequests = new Map();
        this.retryCount = 0;
        this.isProcessing = false;
        this.observer = null;

        this.init();
    }

    async init() {
        console.log('🤖 AI聊天转发器初始化...');

        try {
            // 等待页面加载完成
            if (document.readyState === 'loading') {
                await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
            }
            
            await this.start();
        } catch (error) {
            console.error('❌ 初始化失败:', error);
            this.scheduleRetry();
            throw error;
        }
    }

    async start() {
        try {
            // 初始化DOM元素监听
            await this.initDOMListeners();

            // 连接WebSocket服务器
            await this.wsManager.connect();

            // 启动心跳检测
            this.startHeartbeat();

            console.log('✅ AI聊天转发器启动完成');
        } catch (error) {
            console.error('❌ 初始化失败:', error);
            this.scheduleRetry();
            throw error;
        }
    }

    async initDOMListeners() {
        console.log('🔍 初始化DOM监听器...');
        await this.domManager.waitForElement(CONFIG.selectors.pageReadyIndicator);
        console.log('✅ 页面已就绪:', CONFIG.selectors.pageReadyIndicator);

        // 设置MutationObserver监听消息变化
        console.log('🔧 设置MutationObserver监听消息变化');
        this.domManager.setupMessageObserver();

        console.log('🔍 DOM监听器初始化完成');
    }

    async handleCompletionRequest(requestData) {
        if (this.isProcessing) {
            console.warn('⚠️ 正在处理其他请求，拒绝新请求');
            this.wsManager.sendErrorResponse(requestData.request_id, 'busy', '客户端正忙');
            return;
        }

        this.isProcessing = true;
        this.currentRequestId = requestData.request_id;

        console.log('📨 收到补全请求:', requestData.request_id);
        const userMessage = this.extractUserMessage(requestData.messages);

        // 等待输入框可用
        console.log('⏳ 等待输入框加载:', CONFIG.selectors.inputBox);
        const inputBox = await this.domManager.waitForElement(CONFIG.selectors.inputBox);
        console.log('✅ 输入框已加载:', inputBox);

        // 清空并填写消息
        console.log('✍️ 填写消息到输入框:', userMessage);
        await this.domManager.fillInputBox(inputBox, userMessage);

        // 点击发送按钮前等待1秒，防止被识别为机器人
        await delay(1000);

        // 点击发送按钮
        console.log('🖱️ 点击发送按钮:', CONFIG.selectors.sendButton);
        await this.domManager.clickSendButton();

        // 记录基准内容（避免获取到之前的消息）
        const baselineContent = this.domManager.getLatestMessage();
        console.log('📊 基准内容:', baselineContent?.substring(0, 30));

        // 等待AI响应
        console.log('⏳ 等待AI响应...');
        let aiResponse;
        try {
            aiResponse = await this.domManager.waitForAIResponse(baselineContent);
        } catch (error) {
            console.error('❌ 等待AI响应失败:', error.message);
            // Debug: log current message count and latest message
            console.log('📊 当前消息数量:', this.domManager.getMessageCount());
            console.log('💬 最新消息:', this.domManager.getLatestMessage());
            this.wsManager.sendErrorResponse(requestData.request_id, 'timeout', error.message);
            this.isProcessing = false;
            return;
        }

        // 发送响应回服务器
        console.log('📤 发送AI响应:', aiResponse);
        this.wsManager.sendCompletionResponse(requestData.request_id, aiResponse);

        this.isProcessing = false;
    }

    extractUserMessage(messages) {
        // 查找最后一条用户消息
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                return messages[i].content;
            }
        }
        return null;
    }

    scheduleRetry() {
        if (this.retryCount >= CONFIG.retry.maxAttempts) {
            console.error('❌ 达到最大重试次数，停止重连');
            return;
        }

        this.retryCount++;
        const retryDelay = CONFIG.timeouts.reconnect * this.retryCount;

        console.log(`🔄 ${this.retryCount}/${CONFIG.retry.maxAttempts} 将在 ${retryDelay}ms 后重连`);

        setTimeout(() => {
            this.wsManager.connect().catch(error => {
                console.error('❌ 重连失败:', error);
                this.scheduleRetry();
            });
        }, retryDelay);
    }

    startHeartbeat() {
        // 服务器会发送心跳，客户端只需响应
        console.log('💓 心跳检测已启动');
    }

    // 清理资源
    destroy() {
        this.domManager.disconnectObserver();
        this.wsManager.close();
        console.log('🧹 AI聊天转发器已清理');
    }
}

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (window.aiForwarder) {
        window.aiForwarder.destroy();
    }
});

// 启动转发器
window.aiForwarder = new AIChatForwarder();