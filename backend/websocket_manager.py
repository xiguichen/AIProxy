# backend/websocket_manager.py
import asyncio
import uuid
import json
import logging
from typing import Dict, Optional, Set, Any
from enum import Enum
from datetime import datetime, timedelta
from fastapi import WebSocket, WebSocketDisconnect

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConnectionStatus(Enum):
    """连接状态枚举"""
    IDLE = "idle"
    BUSY = "busy"
    DEAD = "dead"

class ClientConnection:
    """客户端连接信息类"""
    
    def __init__(self, websocket: WebSocket, client_id: str):
        self.websocket = websocket
        self.client_id = client_id
        self.status = ConnectionStatus.IDLE
        self.last_heartbeat = datetime.now()
        self.created_at = datetime.now()
        self.current_request_id: Optional[str] = None
        
    def update_heartbeat(self):
        """更新心跳时间"""
        self.last_heartbeat = datetime.now()
        
    def mark_busy(self, request_id: str):
        """标记为忙碌状态"""
        self.status = ConnectionStatus.BUSY
        self.current_request_id = request_id
        
    def mark_idle(self):
        """标记为空闲状态"""
        self.status = ConnectionStatus.IDLE
        self.current_request_id = None
        
    def is_healthy(self, timeout_seconds: int = 30) -> bool:
        """检查连接是否健康"""
        return (datetime.now() - self.last_heartbeat).total_seconds() < timeout_seconds

class ConnectionManager:
    """WebSocket连接管理器（修复异步锁问题）"""
    
    def __init__(self):
        self.active_connections: Dict[str, ClientConnection] = {}
        self.connection_lock = asyncio.Lock()  # 异步锁
        self.heartbeat_interval = 25
        self.connection_timeout = 30
        
        # 请求-响应匹配相关属性
        self.pending_requests: Dict[str, asyncio.Event] = {}
        self.request_responses: Dict[str, Dict[str, Any]] = {}
        self.response_lock = asyncio.Lock()  # 异步响应锁
    
    async def connect(self, websocket: WebSocket) -> str:
        """接受WebSocket连接并分配唯一标识符"""
        await websocket.accept()
        
        client_id = f"client_{uuid.uuid4().hex[:8]}"
        
        # 使用异步锁保护共享资源
        async with self.connection_lock:
            connection = ClientConnection(websocket, client_id)
            self.active_connections[client_id] = connection
            
        logger.info(f"客户端连接建立: {client_id}")
        
        # 发送连接确认消息
        welcome_msg = {
            "type": "connection_established",
            "client_id": client_id,
            "timestamp": datetime.now().isoformat(),
            "message": "WebSocket连接已建立，准备接收请求"
        }
        await self.send_message(client_id, welcome_msg)
        
        return client_id
    
    async def disconnect(self, client_id: str):
        """断开连接并清理资源"""
        # 使用异步锁保护共享资源
        async with self.connection_lock:
            if client_id not in self.active_connections:
                return
                
            connection = self.active_connections[client_id]
            try:
                await connection.websocket.close()
            except Exception as e:
                logger.warning(f"关闭连接时出错 {client_id}: {e}")
            
            # 清理该客户端的待处理请求
            async with self.response_lock:
                requests_to_clean = []
                for req_id, event in self.pending_requests.items():
                    if (connection.current_request_id == req_id or 
                        req_id.startswith(f"req_{client_id}")):
                        requests_to_clean.append(req_id)
                
                for req_id in requests_to_clean:
                    if req_id in self.pending_requests:
                        self.pending_requests[req_id].set()
                        del self.pending_requests[req_id]
                    if req_id in self.request_responses:
                        del self.request_responses[req_id]
            
            del self.active_connections[client_id]
            logger.info(f"客户端连接断开: {client_id}")
    
    async def send_message(self, client_id: str, message: dict) -> bool:
        """向指定客户端发送消息"""
        async with self.connection_lock:
            if client_id not in self.active_connections:
                return False
                
            connection = self.active_connections[client_id]
        
        try:
            await connection.websocket.send_json(message)
            return True
        except Exception as e:
            logger.error(f"向客户端 {client_id} 发送消息失败: {e}")
            connection.status = ConnectionStatus.DEAD
            return False
    
    async def get_available_client(self) -> Optional[str]:
        """获取一个空闲的客户端连接"""
        async with self.connection_lock:
            available_clients = []
            clients_to_remove = []
            
            for client_id, connection in self.active_connections.items():
                if not connection.is_healthy(self.connection_timeout):
                    clients_to_remove.append(client_id)
                    continue
                    
                if connection.status == ConnectionStatus.IDLE:
                    available_clients.append((client_id, connection.last_heartbeat))
            
            # 清理不健康的连接
            for client_id in clients_to_remove:
                if client_id in self.active_connections:
                    del self.active_connections[client_id]
                    logger.info(f"清理不健康连接: {client_id}")
            
            if not available_clients:
                return None
                
            available_clients.sort(key=lambda x: x[1], reverse=True)
            return available_clients[0][0]
    
    async def send_completion_request(self, client_id: str, request_data: dict, timeout: int = 60) -> Dict[str, Any]:
        """发送补全请求并等待响应"""
        request_id = request_data.get("request_id")
        if not request_id:
            raise ValueError("请求必须包含request_id")
        
        # 创建等待事件
        response_event = asyncio.Event()
        
        async with self.response_lock:
            self.pending_requests[request_id] = response_event
            self.request_responses[request_id] = {}
        
        # 标记客户端为忙碌状态
        async with self.connection_lock:
            connection = self.active_connections.get(client_id)
            if connection:
                connection.mark_busy(request_id)
        
        try:
            # 发送请求到客户端
            success = await self.send_message(client_id, request_data)
            if not success:
                raise Exception("向客户端发送请求失败")
            
            # 等待响应（带超时）
            try:
                await asyncio.wait_for(response_event.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                raise TimeoutError(f"请求超时，客户端未在{timeout}秒内响应")
            
            # 获取响应数据
            async with self.response_lock:
                response = self.request_responses.get(request_id, {})
                if not response:
                    raise Exception("未收到有效响应")
                
                # 清理请求数据
                if request_id in self.pending_requests:
                    del self.pending_requests[request_id]
                if request_id in self.request_responses:
                    del self.request_responses[request_id]
            
            return response
            
        except Exception as e:
            # 清理资源
            async with self.response_lock:
                if request_id in self.pending_requests:
                    del self.pending_requests[request_id]
                if request_id in self.request_responses:
                    del self.request_responses[request_id]
            
            # 重置客户端状态
            async with self.connection_lock:
                if connection:
                    connection.mark_idle()
            
            raise e
    
    async def handle_completion_response(self, response_data: dict):
        """处理客户端返回的补全响应"""
        request_id = response_data.get("request_id")
        if not request_id:
            logger.error("响应缺少request_id")
            return False
        
        async with self.response_lock:
            if request_id in self.pending_requests:
                # 存储响应数据
                self.request_responses[request_id] = response_data
                
                # 通知等待的任务
                event = self.pending_requests[request_id]
                event.set()
                
                # 重置客户端状态
                async with self.connection_lock:
                    for client_id, connection in self.active_connections.items():
                        if connection.current_request_id == request_id:
                            connection.mark_idle()
                            break
                
                logger.info(f"请求 {request_id} 响应处理完成")
                return True
            else:
                logger.warning(f"收到未知请求ID的响应: {request_id}")
                return False
    
    async def start_heartbeat_task(self):
        """启动心跳检测任务"""
        asyncio.create_task(self._heartbeat_checker())
    
    async def _heartbeat_checker(self):
        """定期检查连接心跳"""
        while True:
            await asyncio.sleep(self.heartbeat_interval)
            
            async with self.connection_lock:
                current_time = datetime.now()
                clients_to_remove = []
                
                for client_id, connection in self.active_connections.items():
                    try:
                        heartbeat_msg = {
                            "type": "heartbeat",
                            "timestamp": current_time.isoformat()
                        }
                        await connection.websocket.send_json(heartbeat_msg)
                        
                        if (current_time - connection.last_heartbeat).total_seconds() > self.connection_timeout:
                            clients_to_remove.append(client_id)
                            
                    except Exception as e:
                        logger.warning(f"心跳检测失败 {client_id}: {e}")
                        clients_to_remove.append(client_id)
                
                for client_id in clients_to_remove:
                    if client_id in self.active_connections:
                        del self.active_connections[client_id]
                        logger.info(f"心跳超时，清理连接: {client_id}")
    
    async def get_connection_stats(self) -> dict:
        """获取连接统计信息"""
        async with self.connection_lock:
            total = len(self.active_connections)
            idle_count = sum(1 for conn in self.active_connections.values() 
                           if conn.status == ConnectionStatus.IDLE)
            busy_count = sum(1 for conn in self.active_connections.values() 
                           if conn.status == ConnectionStatus.BUSY)
            
            return {
                "total_connections": total,
                "idle_connections": idle_count,
                "busy_connections": busy_count,
                "pending_requests": len(self.pending_requests),
                "timestamp": datetime.now().isoformat()
            }

# 全局连接管理器实例
connection_manager = ConnectionManager()
