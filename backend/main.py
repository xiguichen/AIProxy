import logging
from contextlib import asynccontextmanager

# Configure logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# backend/main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uuid
import json
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any

from websocket_manager import connection_manager, WebSocketDisconnect

# Move the lifespan function above the FastAPI app initialization

# Lifespan event handler for application startup and shutdown.
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler for application startup and shutdown.
    """
    # Start the heartbeat task
    task = asyncio.create_task(connection_manager.start_heartbeat_task())
    logger.info("OpenAI API转发服务已启动")
    try:
        yield
    finally:
        # Cancel the heartbeat task on shutdown
        task.cancel()
        await task

# 创建FastAPI应用
app = FastAPI(
    title="OpenAI补全API转发服务",
    description="通过WebSocket将OpenAI API请求转发到网页AI服务",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic模型定义（遵循OpenAI API规范）
class ChatCompletionMessage(BaseModel):
    """聊天消息模型"""
    role: str = Field(..., description="消息角色：system, user, assistant")
    content: str = Field(..., description="消息内容")

class OpenAIRequest(BaseModel):
    """OpenAI API请求格式"""
    model: str = Field(..., description="模型名称")
    messages: List[ChatCompletionMessage] = Field(..., description="消息列表")
    temperature: Optional[float] = Field(0.7, ge=0, le=2, description="温度参数")
    max_tokens: Optional[int] = Field(None, ge=1, description="最大token数")
    stream: Optional[bool] = Field(False, description="是否流式输出")
    top_p: Optional[float] = Field(1.0, ge=0, le=1, description="核采样参数")
    frequency_penalty: Optional[float] = Field(0.0, ge=-2, le=2, description="频率惩罚")
    presence_penalty: Optional[float] = Field(0.0, ge=-2, le=2, description="存在惩罚")

class OpenAIResponse(BaseModel):
    """OpenAI API响应格式"""
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[Dict[str, Any]]
    usage: Dict[str, int]

# 基础端点
@app.get("/")
async def root():
    """根端点，返回服务状态"""
    stats = await connection_manager.get_connection_stats()  # 修复：添加await
    return {
        "status": "online",
        "service": "openai-api-forwarder",
        "timestamp": datetime.now().isoformat(),
        "connections": stats
    }

@app.get("/health")
async def health_check():
    """健康检查端点"""
    stats = await connection_manager.get_connection_stats()  # 修复：添加await
    return {
        "status": "healthy" if stats["total_connections"] > 0 else "degraded",
        "active_connections": stats["total_connections"],
        "idle_connections": stats["idle_connections"],
        "timestamp": datetime.now().isoformat()
    }

@app.get("/stats")
async def get_stats():
    """获取连接统计信息"""
    return await connection_manager.get_connection_stats()  # 修复：添加await

# WebSocket端点（处理客户端连接）
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket主端点，处理客户端连接"""
    client_id = None
    try:
        # 建立连接并获取客户端ID
        client_id = await connection_manager.connect(websocket)

        # 监听客户端消息
        async for message_data in websocket.iter_text():
            try:
                data = json.loads(message_data)
                message_type = data.get("type")

                # 处理心跳响应
                if message_type == "heartbeat_response":
                    async with connection_manager.connection_lock:
                        if client_id in connection_manager.active_connections:
                            connection_manager.active_connections[client_id].update_heartbeat()
                    continue

                # 处理补全响应
                if message_type == "completion_response":
                    success = await connection_manager.handle_completion_response(data)
                    if success:
                        logger.info(f"客户端响应处理成功: {client_id}, 请求ID: {data.get('request_id')}")
                    else:
                        logger.error(f"客户端响应处理失败: {client_id}")
                    continue

                # 处理客户端就绪通知
                elif message_type == "client_ready":
                    async with connection_manager.connection_lock:
                        if client_id in connection_manager.active_connections:
                            connection_manager.active_connections[client_id].mark_idle()
                            logger.info(f"客户端就绪: {client_id}")
                    continue

                # 处理注册消息
                elif message_type == "register":
                    async with connection_manager.connection_lock:
                        if client_id in connection_manager.active_connections:
                            logger.info(f"客户端注册完成: {client_id}")
                            # Add any additional logic for registration here
                    continue

                # 处理未知消息类型
                else:
                    logger.warning(f"未知消息类型: {message_type} from {client_id}")
                    error_msg = {
                        "type": "error",
                        "message": f"未知消息类型: {message_type}",
                        "timestamp": datetime.now().isoformat()
                    }
                    await connection_manager.send_message(client_id, error_msg)

            except json.JSONDecodeError as e:
                logger.error(f"JSON解析错误: {e}")
                error_msg = {
                    "type": "error",
                    "message": "无效的JSON格式",
                    "timestamp": datetime.now().isoformat()
                }
                await connection_manager.send_message(client_id, error_msg)

            except Exception as e:
                logger.error(f"消息处理错误: {e}")
                error_msg = {
                    "type": "error",
                    "message": f"处理消息时出错: {str(e)}",
                    "timestamp": datetime.now().isoformat()
                }
                await connection_manager.send_message(client_id, error_msg)

    except WebSocketDisconnect:
        logger.info(f"WebSocket连接断开: {client_id}")
    except Exception as e:
        logger.error(f"WebSocket端点错误: {e}")
    finally:
        if client_id:
            await connection_manager.disconnect(client_id)

# OpenAI API端点
@app.post("/v1/chat/completions", response_model=OpenAIResponse)
async def create_chat_completion(request: OpenAIRequest):
    """
    OpenAI补全API端点，接收请求并转发到客户端
    完全兼容OpenAI官方API格式
    """

    # 验证请求参数
    if not request.messages:
        raise HTTPException(status_code=400, detail="消息列表不能为空")

    if len(request.messages) == 0:
        raise HTTPException(status_code=400, detail="至少需要一条消息")

    # 生成唯一请求ID
    request_id = f"req_{uuid.uuid4().hex[:8]}"

    # 获取可用客户端
    client_id = await connection_manager.get_available_client()
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "message": "当前没有可用的客户端连接，请稍后重试",
                    "type": "service_unavailable",
                    "code": 503
                }
            }
        )

    logger.info(f"处理请求 {request_id} via 客户端 {client_id}")

    try:
        # 构建转发请求（内部格式）
        forward_request = {
            "type": "completion_request",
            "request_id": request_id,
            "model": request.model,
            "messages": [msg.dict() for msg in request.messages],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "stream": request.stream,
            "timestamp": datetime.now().isoformat()
        }

        # 发送请求并等待响应
        response_data = await connection_manager.send_completion_request(
            client_id, forward_request, timeout=120  # 2分钟超时
        )

        # 检查响应错误
        if response_data.get("error"):
            error_info = response_data["error"]
            raise HTTPException(
                status_code=500,
                detail={
                    "error": {
                        "message": error_info.get("message", "客户端处理请求时发生错误"),
                        "type": error_info.get("type", "client_error"),
                        "code": error_info.get("code", 500)
                    }
                }
            )

        # 构建OpenAI兼容响应
        content = response_data.get("content", "")
        if not content:
            raise HTTPException(
                status_code=500,
                detail={"error": {"message": "客户端返回空响应", "type": "empty_response"}}
            )

        # 估算token使用量（简化版）
        prompt_text = " ".join([msg.content for msg in request.messages])
        prompt_tokens = self._estimate_tokens(prompt_text)
        completion_tokens = self._estimate_tokens(content)

        openai_response = {
            "id": f"chatcmpl-{request_id}",
            "object": "chat.completion",
            "created": int(datetime.now().timestamp()),
            "model": request.model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": content
                    },
                    "finish_reason": response_data.get("finish_reason", "stop")
                }
            ],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens
            }
        }

        logger.info(f"请求 {request_id} 处理完成，响应长度: {len(content)} 字符")
        return openai_response

    except TimeoutError as e:
        logger.error(f"请求超时: {request_id} - {str(e)}")
        raise HTTPException(
            status_code=504,
            detail={
                "error": {
                    "message": "客户端响应超时",
                    "type": "timeout",
                    "code": 504
                }
            }
        )

    except HTTPException:
        raise  # 重新抛出HTTP异常

    except Exception as e:
        logger.error(f"处理请求时发生错误: {request_id} - {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "message": f"内部服务器错误: {str(e)}",
                    "type": "internal_error",
                    "code": 500
                }
            }
        )

def _estimate_tokens(text: str) -> int:
    """估算文本的token数量（简化实现）"""
    if not text:
        return 0
    return max(len(text) // 4, 1)

# 其他辅助端点
@app.get("/v1/models")
async def list_models():
    """返回支持的模型列表（兼容OpenAI API）"""
    return {
        "object": "list",
        "data": [
            {
                "id": "gpt-3.5-turbo",
                "object": "model",
                "created": 1677615200,
                "owned_by": "openai"
            },
            {
                "id": "gpt-4",
                "object": "model",
                "created": 1667615200,
                "owned_by": "openai"
            }
        ]
    }

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
