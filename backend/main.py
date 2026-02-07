import logging
from contextlib import asynccontextmanager
import os
from pathlib import Path

# Configure logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# backend/main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
import uuid
import json
import hashlib
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any, Union

from websocket_manager import connection_manager, WebSocketDisconnect

DEBUG_DIR = Path("debug_logs")
DEBUG_DIR.mkdir(exist_ok=True)

def _compute_hash(data: Any) -> str:
    """计算数据的哈希值"""
    serialized = json.dumps(data, sort_keys=True, default=str)
    return hashlib.md5(serialized.encode('utf-8')).hexdigest()

def _parse_xml_response(xml_content: str) -> dict:
    """解析XML格式的响应，提取content和tool_calls"""
    result = {"content": "", "tool_calls": None}

    content_start = xml_content.find('<content>')
    content_end = xml_content.find('</content>')
    if content_start > -1 and content_end > -1:
        result["content"] = xml_content[content_start + len('<content>'):content_end].strip()
    else:
        result["content"] = xml_content.split('<response_done>')[0].strip()

    tool_calls_start = xml_content.find('<tool_calls>')
    tool_calls_end = xml_content.find('</tool_calls>')
    if tool_calls_start > -1 and tool_calls_end > -1:
        tool_calls_json = xml_content[tool_calls_start + len('<tool_calls>'):tool_calls_end].strip()
        try:
            result["tool_calls"] = json.loads(tool_calls_json)
        except json.JSONDecodeError as e:
            logger.warning(f"解析tool_calls JSON失败: {e}")

    return result

def save_debug_file(filename: str, data: Any):
    """Save data to a debug file"""
    try:
        filepath = DEBUG_DIR / filename
        with open(filepath, 'w', encoding='utf-8') as f:
            if isinstance(data, dict):
                json.dump(data, f, ensure_ascii=False, indent=2)
            else:
                f.write(str(data))
        logger.debug(f"Debug file saved: {filepath}")
    except Exception as e:
        logger.error(f"Failed to save debug file {filename}: {e}")

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
class FunctionDefinition(BaseModel):
    """函数定义模型"""
    name: str = Field(..., description="函数名称")
    description: Optional[str] = Field(None, description="函数描述")
    parameters: Optional[Dict[str, Any]] = Field(None, description="参数模式")


class Tool(BaseModel):
    """工具定义模型"""
    type: str = Field("function", description="工具类型")
    function: FunctionDefinition


class ChatCompletionMessage(BaseModel):
    """聊天消息模型"""
    role: str = Field(..., description="消息角色：system, user, assistant")
    content: Optional[str] = Field(None, description="消息内容（工具调用时可能为空）")
    tool_calls: Optional[List[Dict[str, Any]]] = Field(None, description="工具调用列表")
    tool_call_id: Optional[str] = Field(None, description="工具调用ID")


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
    tools: Optional[List[Tool]] = Field(None, description="可用工具列表")
    tool_choice: Optional[Union[str, Dict[str, Any]]] = Field(None, description="工具选择策略")

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

@app.get("/logs")
async def get_logs():
    """获取客户端日志列表"""
    try:
        log_files = list(DEBUG_DIR.glob("*.log"))
        return {
            "status": "success",
            "count": len(log_files),
            "files": [f.name for f in log_files]
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/logs/{filename}")
async def get_log_file(filename: str):
    """获取指定日志文件内容"""
    try:
        filepath = DEBUG_DIR / filename
        if filepath.exists() and filepath.suffix == ".log":
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            return {
                "status": "success",
                "filename": filename,
                "content": content
            }
        else:
            return {"status": "error", "message": "File not found"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.delete("/logs")
async def clear_logs():
    """清除所有日志文件"""
    try:
        for log_file in DEBUG_DIR.glob("*.log"):
            log_file.unlink()
        return {"status": "success", "message": "Logs cleared"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

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

                # 处理客户端日志
                elif message_type == "client_log":
                    await connection_manager.handle_client_log(data)
                    # 保存日志到文件
                    log_data = {
                        "timestamp": datetime.now().isoformat(),
                        "client_id": client_id,
                        "level": data.get("level"),
                        "category": data.get("category"),
                        "message": data.get("message"),
                        "data": data.get("data")
                    }
                    log_filename = f"{client_id}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.log"
                    save_debug_file(log_filename, log_data)
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

    # Debug: 保存原始请求
    original_request = request.dict()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    save_debug_file(f"{request_id}_request.json", {
        "timestamp": timestamp,
        "request_id": request_id,
        "data": original_request
    })

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
        connection = connection_manager.active_connections.get(client_id)

        system_msgs = [msg for msg in request.messages if msg.role == "system"]
        system_content = [msg.content for msg in system_msgs if msg.content]
        system_hash = _compute_hash(system_content) if system_content else None

        tools_data = [tool.dict() for tool in request.tools] if request.tools else None
        tools_hash = _compute_hash(tools_data) if tools_data else None

        should_send_system = system_hash is None or system_hash != connection.system_prompt_hash if connection else True
        should_send_tools = tools_hash is None or tools_hash != connection.tools_hash if connection else True

        filtered_messages = []

        if should_send_system and system_msgs:
            for msg in system_msgs:
                original_content = msg.content or ""
                if "RESPONSE FORMAT" not in original_content:
                    format_requirements = """

====

RESPONSE FORMAT

Your response MUST use the following XML format. Do NOT use code blocks like ```xml.

<content>
[Your response text here. This field is REQUIRED and must contain your main response.]
Write freely - you can include any characters, quotes, brackets, or special symbols. They will be parsed correctly.
</content>
<tool_calls>
[Optional: if you need to call tools, include a JSON array here like [{"name": "tool_name", "arguments": {"key": "value"}}]
If no tools are needed, omit this entire <tool_calls> section entirely.
]
</tool_calls>

IMPORTANT:
1. The <content> tag MUST be present and contain your main response
2. The <tool_calls> section is OPTIONAL - only include it if you're calling tools
3. Do NOT use code block markers (no ```xml or ```)
4. Write your content naturally - special characters are handled automatically
5. When calling tools, use valid JSON inside <tool_calls>
6. ALWAYS end your response with <response_done> on its own line
"""
                    new_content = original_content + format_requirements
                    msg.content = new_content
            filtered_messages.extend(system_msgs)
            if connection:
                connection.system_prompt_hash = system_hash
            logger.info(f"发送系统消息 (hash: {system_hash})")
        else:
            logger.info(f"跳过系统消息 (hash未变化)")

        user_msgs = [msg for msg in request.messages if msg.role == "user"]
        if user_msgs:
            filtered_messages.append(user_msgs[-1])

        logger.info(f"原始消息数: {len(request.messages)}, 过滤后消息数: {len(filtered_messages)}")

        forward_request = {
            "type": "completion_request",
            "request_id": request_id,
            "model": request.model,
            "messages": [msg.dict() for msg in filtered_messages],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "stream": False,
            "original_stream": request.stream,
            "timestamp": datetime.now().isoformat()
        }

        if should_send_tools and tools_data:
            forward_request["tools"] = tools_data
            if connection:
                connection.tools_hash = tools_hash
            logger.info(f"转发工具数量: {len(tools_data)}")
        else:
            logger.info(f"跳过工具定义 (hash未变化)")

        # Debug: 保存转发请求
        save_debug_file(f"{request_id}_forward.json", forward_request)

        # 发送请求并等待响应
        response_data = await connection_manager.send_completion_request(
            client_id, forward_request, timeout=120  # 2分钟超时
        )

        # Debug: 保存客户端响应
        save_debug_file(f"{request_id}_response.json", response_data)

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
        raw_content = response_data.get("content", "")

        parsed = _parse_xml_response(raw_content)
        content = parsed["content"]
        tool_calls = parsed.get("tool_calls")

        if not tool_calls:
            tool_calls = response_data.get("tool_calls")
            if tool_calls:
                logger.info(f"从响应顶层获取到 tool_calls: {json.dumps(tool_calls, ensure_ascii=False, indent=2)}")

        if not content:
            raise HTTPException(
                status_code=500,
                detail={"error": {"message": "客户端返回空响应", "type": "empty_response"}}
            )

        # 估算token使用量（简化版）
        prompt_text = " ".join([msg.content or "" for msg in request.messages])
        prompt_tokens = _estimate_tokens(prompt_text)
        completion_tokens = _estimate_tokens(content)

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

        if tool_calls:
            logger.info(f"请求 {request_id} 包含工具调用: {json.dumps(tool_calls, ensure_ascii=False, indent=2)}")
            save_debug_file(f"{request_id}_tool_calls.json", tool_calls)
            openai_response["choices"][0]["message"]["tool_calls"] = tool_calls
            openai_response["choices"][0]["finish_reason"] = "tool_calls"

        save_debug_file(f"{request_id}_openai_response.json", openai_response)

        # 检查是否需要构建tool_calls响应（当用户提示使用工具但AI返回普通文本时）
        # 检测 messages 中是否有 system-reminder 提示使用工具
        has_tool_hint = any(
            hasattr(msg, 'role') and msg.role == "user" and hasattr(msg, 'content') and "system-reminder" in (msg.content or "")
            for msg in request.messages
        )

        if has_tool_hint and content:
            # 构建包含 tool_calls 的响应（模拟工具调用）
            openai_response_with_tools = {
                "id": f"chatcmpl-{request_id}",
                "object": "chat.completion",
                "created": int(datetime.now().timestamp()),
                "model": request.model,
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": content,
                            "tool_calls": [
                                {
                                    "id": f"call_{request_id[:8]}",
                                    "type": "function",
                                    "function": {
                                        "name": "attempt_completion",
                                        "arguments": f'{{"result": "{content[:100]}..."}}'
                                    }
                                }
                            ]
                        },
                        "finish_reason": "tool_calls"
                    }
                ],
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": prompt_tokens + completion_tokens
                }
            }
            logger.info(f"请求 {request_id} 转换为工具调用格式")
            save_debug_file(f"{request_id}_openai_response_with_tools.json", openai_response_with_tools)
            return openai_response_with_tools

        logger.info(f"请求 {request_id} 处理完成，响应长度: {len(content)} 字符")

        # 如果客户端请求流式响应，使用SSE格式返回
        if request.stream:
            async def generate_stream():
                chunk_id = f"chatcmpl-{request_id}"
                created = int(datetime.now().timestamp())

                # 发送角色定义
                role_chunk = {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": request.model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"role": "assistant"},
                            "finish_reason": None
                        }
                    ]
                }
                yield f"data: {json.dumps(role_chunk, ensure_ascii=False)}\n\n"

                # 分块发送内容（模拟流式）
                content_chunk_size = 10  # 每块10个字符
                for i in range(0, len(content), content_chunk_size):
                    chunk = content[i:i + content_chunk_size]
                    content_chunk = {
                        "id": chunk_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": request.model,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": chunk},
                                "finish_reason": None
                            }
                        ]
                    }
                    yield f"data: {json.dumps(content_chunk, ensure_ascii=False)}\n\n"

                # 发送完成标记
                finish_chunk = {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": request.model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {},
                            "finish_reason": "stop"
                        }
                    ]
                }
                yield f"data: {json.dumps(finish_chunk, ensure_ascii=False)}\n\n"

                # 如果有工具调用提示，发送工具调用块
                has_tool_hint = any(
                    msg.get("role") == "user" and "system-reminder" in msg.get("content", "")
                    for msg in request.messages
                )
                if has_tool_hint:
                    tool_call_chunk = {
                        "id": chunk_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": request.model,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {
                                    "tool_calls": [
                                        {
                                            "id": f"call_{request_id[:8]}",
                                            "type": "function",
                                            "function": {
                                                "name": "attempt_completion",
                                                "arguments": "{}"
                                            }
                                        }
                                    ]
                                },
                                "finish_reason": None
                            }
                        ]
                    }
                    yield f"data: {json.dumps(tool_call_chunk, ensure_ascii=False)}\n\n"
                    
                    # 发送工具调用完成
                    tool_finish_chunk = {
                        "id": chunk_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": request.model,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {},
                                "finish_reason": "tool_calls"
                            }
                        ]
                    }
                    yield f"data: {json.dumps(tool_finish_chunk, ensure_ascii=False)}\n\n"

                yield "data: [DONE]\n\n"

            return StreamingResponse(generate_stream(), media_type="text/event-stream")

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
