// WebSocket 管理模块

export class WebSocketManager {
    constructor(wsServer, aiChatForwarder) {
        this.wsServer = wsServer;
        this.aiChatForwarder = aiChatForwarder;
        this.ws = null;
        this.isConnected = false;
        this.clientId = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.wsServer);

                this.ws.onopen = (event) => {
                    console.log('🔗 WebSocket连接已建立');
                    this.isConnected = true;
                    this.aiChatForwarder.retryCount = 0;
                    this.registerClient();
                    resolve(event);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(JSON.parse(event.data));
                };

                this.ws.onclose = (event) => {
                    console.log('🔌 WebSocket连接已关闭:', event.code, event.reason);
                    this.isConnected = false;
                    this.handleDisconnection();
                };

                this.ws.onerror = (error) => {
                    console.error('❌ WebSocket错误:', error);
                    reject(error);
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    registerClient() {
        this.clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const registerMsg = {
            type: 'register',
            client_id: this.clientId,
            metadata: {
                user_agent: navigator.userAgent,
                webpage_url: window.location.href,
                timestamp: new Date().toISOString()
            }
        };

        this.sendMessage(registerMsg);
        console.log('📝 客户端注册完成:', this.clientId);
    }

    handleMessage(data) {
        const messageType = data.type;

        switch (messageType) {
            case 'connection_established':
                console.log('✅ 服务器连接确认收到');
                this.sendClientReady();
                break;

            case 'completion_request':
                this.aiChatForwarder.handleCompletionRequest(data);
                break;

            case 'heartbeat':
                this.handleHeartbeat();
                break;

            case 'error':
                console.error('❌ 服务器错误:', data.message);
                break;

            default:
                console.warn('⚠️ 未知消息类型:', messageType, data);
        }
    }

    sendMessage(message) {
        if (this.ws && this.isConnected) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('⚠️ WebSocket未连接，无法发送消息:', message.type);
        }
    }

    sendClientReady() {
        const readyMsg = {
            type: 'client_ready',
            client_id: this.clientId,
            timestamp: new Date().toISOString()
        };

        this.sendMessage(readyMsg);
    }

    handleHeartbeat() {
        const response = {
            type: 'heartbeat_response',
            client_id: this.clientId,
            timestamp: new Date().toISOString()
        };

        this.sendMessage(response);
    }

    sendCompletionResponse(requestId, content) {
        const responseMsg = {
            type: 'completion_response',
            request_id: requestId,
            content: content,
            timestamp: new Date().toISOString(),
            error: null
        };

        this.sendMessage(responseMsg);
        console.log('📨 补全响应已发送:', requestId);
    }

    sendLog(level, category, message, data = null) {
        const logMsg = {
            type: 'client_log',
            client_id: this.clientId,
            timestamp: new Date().toISOString(),
            level: level,
            category: category,
            message: message,
            data: data
        };

        this.sendMessage(logMsg);
        console.log(`[${level.toUpperCase()}] [${category}] ${message}`, data || '');
    }

    sendErrorResponse(requestId, errorCode, errorMessage) {
        const errorMsg = {
            type: 'completion_response',
            request_id: requestId,
            content: '',
            timestamp: new Date().toISOString(),
            error: {
                code: errorCode,
                message: errorMessage
            }
        };

        this.sendMessage(errorMsg);
    }

    handleDisconnection() {
        console.log('🔌 连接断开，尝试重连...');
        this.aiChatForwarder.scheduleRetry();
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}