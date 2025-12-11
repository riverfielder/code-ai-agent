"""
FastAPI Web API for Code Agent
提供 RESTful API 接口，支持前端页面调用
"""

import os
import asyncio
import uuid
import threading
import time
from typing import Optional, List, Dict, Any
from pathlib import Path
import tempfile
import shutil
import time

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.exceptions import RequestValidationError
import json
from pydantic import BaseModel, Field
import uvicorn

import sys
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from cursor_agent_tools import create_agent
from cursor_agent_tools.permissions import PermissionOptions, PermissionRequest, PermissionStatus
from cursor_agent_tools.logger import get_logger

from dotenv import load_dotenv
load_dotenv()

# Initialize logger
logger = get_logger(__name__)

# 初始化 FastAPI 应用
app = FastAPI(
    title="Code Agent API",
    description="AI驱动的编程助手API",
    version="1.0.0"
)

# 配置 CORS，允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制为具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 添加请求验证错误处理
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """处理请求验证错误，返回详细的错误信息"""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": exc.errors(),
            "body": str(exc.body) if hasattr(exc, 'body') else None
        }
    )

# 存储活跃的 agent 实例（实际生产环境应使用 Redis 或数据库）
active_agents: Dict[str, Any] = {}

# 存储待处理的权限请求（session_id -> pending_permissions）
pending_permissions: Dict[str, List[Dict[str, Any]]] = {}

# 存储SSE连接（session_id -> asyncio.Queue）
sse_queues: Dict[str, asyncio.Queue] = {}

# 存储同步权限等待事件（session_id -> request_id -> threading.Event）
permission_events: Dict[str, Dict[str, threading.Event]] = {}

# 存储事件循环引用（用于在后台线程中推送SSE消息）
event_loops: Dict[str, asyncio.AbstractEventLoop] = {}

# 存储上传的文件
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# 存储会话工作目录（每个会话有独立的工作目录）
WORKSPACE_BASE_DIR = Path("workspaces")
WORKSPACE_BASE_DIR.mkdir(exist_ok=True)


# ==================== 请求/响应模型 ====================

class AgentConfig(BaseModel):
    """Agent 配置模型"""
    model: str = Field(..., description="模型名称，如 'claude-3-5-sonnet-latest', 'gpt-4o', 'qwen-plus'")
    temperature: float = Field(0.0, ge=0.0, le=1.0, description="温度参数")
    timeout: int = Field(180, ge=1, description="超时时间（秒）")


class PermissionConfig(BaseModel):
    """权限配置模型"""
    yolo_mode: bool = Field(False, description="YOLO模式：自动批准操作")
    command_allowlist: List[str] = Field(default_factory=list, description="命令白名单")
    command_denylist: List[str] = Field(default_factory=list, description="命令黑名单")
    delete_file_protection: bool = Field(True, description="文件删除保护")


class SessionCreateRequest(BaseModel):
    """创建会话请求模型"""
    model: str = Field(..., description="模型名称")
    temperature: float = Field(0.0, ge=0.0, le=1.0, description="温度参数")
    timeout: int = Field(180, ge=1, description="超时时间（秒）")
    permission_config: PermissionConfig = Field(default_factory=PermissionConfig, description="权限配置")
    workspace_path: Optional[str] = Field(None, description="工作目录路径（可选，如果不提供则自动创建）")


class ChatRequest(BaseModel):
    """聊天请求模型（JSON 格式）"""
    message: str = Field(..., description="用户消息")
    user_info: Optional[Dict[str, Any]] = Field(None, description="用户上下文信息")
    session_id: str = Field(..., description="会话ID")


class ChatResponse(BaseModel):
    """聊天响应模型"""
    message: str = Field(..., description="AI回复")
    tool_calls: List[Dict[str, Any]] = Field(default_factory=list, description="工具调用记录")
    thinking: Optional[str] = Field(None, description="思考过程")
    session_id: str = Field(..., description="会话ID")
    pending_permissions: List[Dict[str, Any]] = Field(default_factory=list, description="待处理的权限请求")


class ImageQueryRequest(BaseModel):
    """图像查询请求模型"""
    query: str = Field(..., description="查询问题")
    image_paths: List[str] = Field(..., description="图像文件路径列表")
    session_id: str = Field(..., description="会话ID")


class SessionResponse(BaseModel):
    """会话响应模型"""
    session_id: str
    model: str
    created_at: str


class PermissionRequestModel(BaseModel):
    """权限请求模型"""
    operation: str = Field(..., description="操作类型")
    details: Dict[str, Any] = Field(..., description="操作详情")


class PermissionResponseModel(BaseModel):
    """权限响应模型"""
    request_id: str = Field(..., description="请求ID")
    status: str = Field(..., description="权限状态: granted/denied")


# ==================== 工具函数 ====================

def create_permission_options(config: PermissionConfig) -> PermissionOptions:
    """创建权限选项"""
    return PermissionOptions(
        yolo_mode=config.yolo_mode,
        command_allowlist=config.command_allowlist,
        command_denylist=config.command_denylist,
        delete_file_protection=config.delete_file_protection
    )


def create_web_permission_callback(session_id: str):
    """创建 Web 权限回调函数（异步，支持SSE推送）"""
    def permission_callback(permission_request: PermissionRequest) -> PermissionStatus:
        """
        Web 权限回调：将权限请求存储到 pending_permissions，通过SSE推送到前端，同步等待前端响应
        
        Args:
            permission_request: 权限请求对象
            
        Returns:
            PermissionStatus: 权限状态
        """
        request_id = str(uuid.uuid4())
        
        # 存储权限请求
        if session_id not in pending_permissions:
            pending_permissions[session_id] = []
        
        # 创建同步等待事件
        if session_id not in permission_events:
            permission_events[session_id] = {}
        sync_event = threading.Event()
        permission_events[session_id][request_id] = sync_event
        
        permission_data = {
            "request_id": request_id,
            "operation": permission_request.operation,
            "details": permission_request.details,
            "status": None,  # 等待前端响应
            "created_at": time.time()  # 记录创建时间
        }
        
        pending_permissions[session_id].append(permission_data)
        logger.info(f"Permission request stored: {request_id} for operation: {permission_request.operation}")
        # 测试：推送
        def push_test():
            logger.info(f"Pushing test for request {request_id}")
            try:
                loop = event_loops.get(session_id)
                if loop and loop.is_running():
                    if session_id in sse_queues:
                        future = asyncio.run_coroutine_threadsafe(
                            sse_queues[session_id].put({
                                "type": "permission_timeout",
                                "data": {"request_id": request_id}
                            }),
                            loop
                        )
                        future.result(timeout=2.0)  # 减少超时时间，避免阻塞
                        logger.info(f"Permission test pushed via SSE successfully for request {request_id}")
            except Exception as e:
                logger.warning(f"Failed to push permission test via SSE (non-critical): {str(e)}")
        
        threading.Thread(target=push_test, daemon=True).start()
            
        # 通过SSE推送权限请求到前端（在后台线程中执行）
        def push_permission_request():
            """在后台线程中推送SSE消息（格式与push_timeout一致）"""
            logger.info(f"Pushing permission for request {request_id}")
            try:
                loop = event_loops.get(session_id)
                if loop and loop.is_running():
                    if session_id in sse_queues:
                        logger.info(f"Pushing ttt permission request {request_id} via SSE")
                        future = asyncio.run_coroutine_threadsafe(
                            sse_queues[session_id].put({
                                "type": "permission_request",
                                "data": {
                                    "request_id": request_id,
                                    "operation": permission_request.operation,
                                    "details": permission_request.details
                                }
                            }),
                            loop
                        )
                        future.result(timeout=5.0)  # 减少超时时间，避免阻塞
                        logger.info(f"Permission request {request_id} pushed via SSE successfully")
            except Exception as e:
                logger.warning(f"Failed to push permission request via SSE (non-critical): {str(e)}")
        
        # 在后台线程中推送SSE消息（立即执行，不阻塞）
        threading.Thread(target=push_permission_request, daemon=True).start()
        # 循环等待前端响应（最多等待 30 秒）
        logger.info(f"Waiting for permission response for request {request_id} (timeout: 30s)...")
        timeout_seconds = 10.0
        check_interval = 0.1  # 每100ms检查一次
        elapsed_time = 0.0
        
        # 循环检查权限状态，直到超时或获得响应
        while elapsed_time < timeout_seconds:
            if sync_event.wait(timeout=check_interval):
                # 事件被触发，用户已响应
                break
            elapsed_time += check_interval
            # 检查权限数据状态（双重检查，确保状态已更新）
            if permission_data.get("status") is not None:
                break
        
        # 检查是否超时
        if elapsed_time >= timeout_seconds:
            logger.warning(f"Permission request {request_id} timed out after {timeout_seconds} seconds")
            permission_data["status"] = PermissionStatus.DENIED
            permission_data["timeout"] = True  # 标记为超时
            
            # 推送超时消息
            def push_timeout():
                logger.info(f"Pushing permission timeout for request {request_id}")
                try:
                    loop = event_loops.get(session_id)
                    if loop and loop.is_running():
                        if session_id in sse_queues:
                            future = asyncio.run_coroutine_threadsafe(
                                sse_queues[session_id].put({
                                    "type": "permission_timeout",
                                    "data": {"request_id": request_id}
                                }),
                                loop
                            )
                            future.result(timeout=2.0)  # 减少超时时间，避免阻塞
                            logger.info(f"Permission timeout pushed via SSE successfully for request {request_id}")
                except Exception as e:
                    logger.warning(f"Failed to push permission timeout via SSE (non-critical): {str(e)}")
            
            threading.Thread(target=push_timeout, daemon=True).start()
            # 测试：推送
            def push_permission_test_request():
                logger.info(f"Pushing permission test2 for request {request_id}")
                try:
                    loop = event_loops.get(session_id)
                    if loop and loop.is_running():
                        if session_id in sse_queues:
                            future = asyncio.run_coroutine_threadsafe(
                                sse_queues[session_id].put({
                                    "type": "permission_request",
                                    "data": {
                                        "request_id": request_id,
                                        "operation": permission_request.operation,
                                        "details": permission_request.details
                                    }
                                }),
                                loop
                            )
                            future.result(timeout=5.0)  # 减少超时时间，避免阻塞
                            logger.info(f"Permission test2 request {request_id} pushed via SSE successfully")
                except Exception as e:
                    logger.warning(f"Failed to push permission test2 request via SSE (non-critical): {str(e)}")

                # 在后台线程中推送SSE消息（立即执行，不阻塞）
            threading.Thread(target=push_permission_test_request, daemon=True).start()
            
            # 清理事件
            if session_id in permission_events and request_id in permission_events[session_id]:
                del permission_events[session_id][request_id]
            
            return PermissionStatus.DENIED
        
        # 事件被触发，获取权限状态（正常响应路径）
        status = permission_data.get("status", PermissionStatus.DENIED)
        logger.info(f"Permission request {request_id} resolved: {status}")
        
        # 推送权限响应结果（在后台线程中）
        def push_permission_resolved():
            logger.info(f"Pushing permission resolved for request {request_id}")
            try:
                loop = event_loops.get(session_id)
                if loop and loop.is_running():
                    if session_id in sse_queues:
                        future = asyncio.run_coroutine_threadsafe(
                            sse_queues[session_id].put({
                                "type": "permission_resolved",
                                "data": {
                                    "request_id": request_id,
                                    "status": "granted" if status == PermissionStatus.GRANTED else "denied"
                                }
                            }),
                            loop
                        )
                        future.result(timeout=2.0)  # 减少超时时间，避免阻塞
                        logger.info(f"Permission resolution pushed via SSE for request {request_id}")
            except Exception as e:
                logger.warning(f"Failed to push permission resolution via SSE (non-critical): {str(e)}")
        
        threading.Thread(target=push_permission_resolved, daemon=True).start()
        
        # 清理事件
        if session_id in permission_events and request_id in permission_events[session_id]:
            del permission_events[session_id][request_id]
        
        return status
    
    return permission_callback


def get_or_create_agent(session_id: str, config: AgentConfig, permission_config: PermissionConfig, workspace_path: Optional[str] = None) -> Any:
    """获取或创建 Agent 实例"""
    if session_id not in active_agents:
        permission_options = create_permission_options(permission_config)
        
        # 创建 Web 权限回调
        permission_callback = create_web_permission_callback(session_id)
        
        # 确定工作目录
        if workspace_path:
            # 使用用户指定的工作目录
            session_workspace = Path(workspace_path)
            if not session_workspace.exists():
                # 如果目录不存在，尝试创建
                try:
                    session_workspace.mkdir(parents=True, exist_ok=True)
                    logger.info(f"Created user-specified workspace directory: {session_workspace}")
                except Exception as e:
                    logger.error(f"Failed to create workspace directory {session_workspace}: {str(e)}")
                    raise HTTPException(status_code=400, detail=f"无法创建工作目录: {str(e)}")
            elif not session_workspace.is_dir():
                raise HTTPException(status_code=400, detail=f"指定的路径不是目录: {workspace_path}")
            else:
                logger.info(f"Using user-specified workspace directory: {session_workspace}")
        else:
            # 为每个会话创建独立的工作目录
            session_workspace = WORKSPACE_BASE_DIR / session_id
            session_workspace.mkdir(parents=True, exist_ok=True)
            logger.info(f"Created auto-generated workspace directory for session {session_id}: {session_workspace}")
        
        agent = create_agent(
            model=config.model,
            temperature=config.temperature,
            timeout=config.timeout,
            permission_options=permission_options,
            permission_callback=permission_callback
        )
        
        # 注册默认工具
        agent.register_default_tools()
        
        active_agents[session_id] = {
            "agent": agent,
            "config": config,
            "permission_config": permission_config,
            "workspace_path": str(session_workspace.absolute())  # 保存工作目录路径
        }
        
        # 初始化权限请求列表
        pending_permissions[session_id] = []
        
        # 初始化权限事件字典
        if session_id not in permission_events:
            permission_events[session_id] = {}
    
    return active_agents[session_id]["agent"]


# ==================== API 路由 ====================

@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "Code Agent API",
        "version": "1.0.0",
        "endpoints": {
            "POST /api/sessions": "创建新会话",
            "GET /api/sessions/{session_id}": "获取会话信息",
            "POST /api/chat": "发送聊天消息",
            "POST /api/upload": "上传文件",
            "POST /api/image-query": "图像查询",
            "GET /api/models": "获取支持的模型列表"
        }
    }


@app.post("/api/sessions", response_model=SessionResponse)
async def create_session(request: SessionCreateRequest):
    """创建新的会话"""
    session_id = str(uuid.uuid4())
    
    # 创建 AgentConfig
    config = AgentConfig(
        model=request.model,
        temperature=request.temperature,
        timeout=request.timeout
    )
    
    # 创建 agent 实例（传递工作目录路径）
    get_or_create_agent(session_id, config, request.permission_config, workspace_path=request.workspace_path)
    
    from datetime import datetime
    
    return SessionResponse(
        session_id=session_id,
        model=config.model,
        created_at=datetime.now().isoformat()
    )


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """获取会话信息"""
    if session_id not in active_agents:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    session = active_agents[session_id]
    return {
        "session_id": session_id,
        "model": session["config"].model,
        "temperature": session["config"].temperature,
        "permission_config": session["permission_config"].dict(),
        "workspace_path": session.get("workspace_path", "未设置")
    }


async def process_chat_with_files(
    session_id: str,
    message: str,
    user_info: Optional[Dict[str, Any]] = None,
    files: List[UploadFile] = []
) -> ChatResponse:
    """处理聊天请求的通用逻辑"""
    if session_id not in active_agents:
        raise HTTPException(status_code=404, detail="会话不存在，请先创建会话")
    
    agent = active_agents[session_id]["agent"]
    
    # 获取会话的工作目录
    session_data = active_agents[session_id]
    workspace_path = session_data.get("workspace_path", str(WORKSPACE_BASE_DIR.absolute()))
    
    # 确保 user_info 包含工作目录信息
    if user_info is None:
        user_info = {}
    
    # 设置工作目录（如果未指定）
    if "workspace_path" not in user_info:
        user_info["workspace_path"] = workspace_path
    
    # 处理上传的文件
    file_contents = {}
    if files:
        for file in files:
            if file.filename:
                # 读取文件内容
                content = await file.read()
                try:
                    # 尝试解码为文本
                    text_content = content.decode('utf-8')
                    file_contents[file.filename] = {
                        "content": text_content,
                        "size": len(content),
                        "type": file.content_type or "text/plain"
                    }
                except UnicodeDecodeError:
                    # 二进制文件，保存为 base64
                    import base64
                    base64_content = base64.b64encode(content).decode('utf-8')
                    file_contents[file.filename] = {
                        "content": base64_content,
                        "size": len(content),
                        "type": file.content_type or "application/octet-stream",
                        "encoding": "base64"
                    }
    
    # 如果有文件，将文件内容添加到消息中
    if file_contents:
        file_info_parts = []
        for filename, file_data in file_contents.items():
            if file_data.get("encoding") == "base64":
                file_info_parts.append(f"\n文件: {filename} (二进制文件, {file_data['size']} 字节)")
            else:
                file_info_parts.append(f"\n文件: {filename}\n内容:\n{file_data['content']}")
        
        if message:
            message = message + "\n\n" + "\n".join(file_info_parts)
        else:
            message = "请分析以下文件内容:\n" + "\n".join(file_info_parts)
    
    # 切换到会话工作目录（临时）
    import os
    original_cwd = os.getcwd()
    try:
        os.chdir(workspace_path)
        logger.debug(f"Changed to workspace directory: {workspace_path}")
        
        # 调用 agent 的 chat 方法
        # 所有权限控制都交给权限回调函数处理
        # 权限回调会推送SSE到前端，然后循环等待用户响应（30秒超时）
        logger.info("Calling agent.chat - permission requests will be handled by callback")
        
        # 创建SSE队列（如果不存在），确保权限回调可以推送SSE消息
        if session_id not in sse_queues:
            sse_queues[session_id] = asyncio.Queue(maxsize=100)  # 设置队列大小，避免无限增长
            logger.debug(f"Created SSE queue for session {session_id} in process_chat_with_files")
        
        # 存储当前事件循环（如果存在），以便权限回调在后台线程中使用
        try:
            current_loop = asyncio.get_running_loop()
            event_loops[session_id] = current_loop
            logger.debug(f"Stored event loop for session {session_id} in process_chat_with_files")
        except RuntimeError:
            # 没有运行中的事件循环（不应该发生，因为这是async函数）
            logger.warning(f"No running event loop found in process_chat_with_files for session {session_id}")
        
        # 直接调用 agent.chat，权限控制完全由回调函数处理
        # 回调函数会推送SSE到前端，然后循环等待用户响应（30秒超时）
        try:
            response = await agent.chat(message=message, user_info=user_info)
            logger.info("Agent.chat completed")
            
            # 通过SSE推送最终结果（如果SSE队列存在）
            if session_id in sse_queues:
                try:
                    if isinstance(response, dict):
                        message_content = response.get("message", "")
                        # 推送最终消息
                        await sse_queues[session_id].put({
                            "type": "message",
                            "data": {
                                "message": message_content,
                                "tool_calls": response.get("tool_calls", [])
                            }
                        })
                    else:
                        await sse_queues[session_id].put({
                            "type": "message",
                            "data": {"message": str(response)}
                        })
                    # 推送完成消息
                    await sse_queues[session_id].put({
                        "type": "chat_complete",
                        "data": {}
                    })
                except Exception as e:
                    logger.error(f"Failed to push final result via SSE: {str(e)}")
        except Exception as e:
            logger.error(f"Error in agent.chat: {str(e)}")
            # 通过SSE推送错误
            if session_id in sse_queues:
                try:
                    await sse_queues[session_id].put({
                        "type": "error",
                        "data": {"message": str(e)}
                    })
                except Exception as e2:
                    logger.error(f"Failed to push error via SSE: {str(e2)}")
            return ChatResponse(
                message=f"执行出错: {str(e)}",
                tool_calls=[],
                thinking=None,
                session_id=session_id,
                pending_permissions=[]
            )
        
    finally:
        # 恢复原始工作目录
        os.chdir(original_cwd)
        logger.debug(f"Restored original working directory: {original_cwd}")
    
    # 没有权限请求，正常返回响应
    # 处理响应格式
    if isinstance(response, dict):
        return ChatResponse(
            message=response.get("message", ""),
            tool_calls=response.get("tool_calls", []),
            thinking=response.get("thinking"),
            session_id=session_id,
            pending_permissions=[]
        )
    else:
        # 向后兼容字符串响应
        return ChatResponse(
            message=str(response),
            session_id=session_id,
            pending_permissions=[]
        )


@app.get("/api/chat/stream")
async def chat_stream(
    session_id: str,
    message: str,
    user_info: Optional[str] = None
):
    """SSE流式聊天端点"""
    # logger.info(f"Chat stream request received for session: {session_id}, message: {message}")
    if session_id not in active_agents:
        raise HTTPException(status_code=404, detail="会话不存在，请先创建会话")
    
    # 创建SSE队列（如果不存在）
    if session_id not in sse_queues:
        sse_queues[session_id] = asyncio.Queue(maxsize=100)  # 设置队列大小，避免无限增长
        logger.info(f"Created SSE queue for session {session_id} in chat_stream")
    
    # 关键修复：在 event_generator 执行之前就存储事件循环
    # 这样权限回调在 agent.chat 内部触发时，事件循环已经可用
    try:
        current_loop = asyncio.get_running_loop()
        event_loops[session_id] = current_loop
        logger.debug(f"Stored event loop for session {session_id} in chat_stream (before event_generator)")
    except RuntimeError:
        current_loop = asyncio.get_event_loop()
        event_loops[session_id] = current_loop
        logger.debug(f"Stored event loop for session {session_id} in chat_stream (fallback)")
    
    async def event_generator():
        """SSE事件生成器"""
        # 事件循环已在外部存储，这里只需要确保一致性
        if session_id not in event_loops:
            try:
                current_loop = asyncio.get_running_loop()
                event_loops[session_id] = current_loop
            except RuntimeError:
                current_loop = asyncio.get_event_loop()
                event_loops[session_id] = current_loop
        try:
            # 解析user_info
            parsed_user_info = None
            if user_info:
                try:
                    parsed_user_info = json.loads(user_info)
                except json.JSONDecodeError:
                    parsed_user_info = {}
            
            # 在后台执行agent.chat
            agent = active_agents[session_id]["agent"]
            session_data = active_agents[session_id]
            workspace_path = session_data.get("workspace_path", str(WORKSPACE_BASE_DIR.absolute()))
            
            if parsed_user_info is None:
                parsed_user_info = {}
            if "workspace_path" not in parsed_user_info:
                parsed_user_info["workspace_path"] = workspace_path
            
            # 切换到工作目录
            import os
            original_cwd = os.getcwd()
            try:
                os.chdir(workspace_path)
                
                # 关键修复：先发送开始消息，确保 event_generator 已经开始执行
                yield f"data: {json.dumps({'type': 'message_start', 'data': {'message': '开始处理请求...'}})}\n\n"
                logger.info(f"Pushing message start for request {session_id}")
                
                # 启动后台任务执行agent.chat
                chat_task = asyncio.create_task(agent.chat(message=message, user_info=parsed_user_info))
                
                # 关键修复：直接在主循环中消费队列，不使用中间队列
                # 这样可以避免中间队列阻塞导致的问题
                # 使用 asyncio.wait 同时等待 chat_task 和队列消息，确保队列消费立即开始
                while True:
                    try:
                        logger.info(f"正在消费")
                        # 使用 asyncio.wait 同时等待 chat_task 和队列消息
                        # 注意：不能直接等待 chat_task，因为它已经在运行，我们需要等待队列消息
                        item = await asyncio.wait_for(sse_queues[session_id].get(), timeout=0.5)
                        logger.info(f"正常消费：Pushing item {item} via SSE")
                        yield f"data: {json.dumps(item)}\n\n"
                            
                    except asyncio.TimeoutError:
                        # 超时，继续等待 chat_task
                        continue
                    except Exception as e:
                        logger.error(f"Error in queue consumption loop: {str(e)}")
                        await asyncio.sleep(0.05)
                        continue
                # 🔥 关键修复：用 asyncio.wait 同时监听 chat_task 和队列消息，避免阻塞
                # logger.info(f"开始消费")
                # while True:
                #     logger.info(f"正在消费")
                #     # 创建「获取队列消息」的临时任务（每次循环重建，避免重复使用）
                #     queue_task = asyncio.create_task(sse_queues[session_id].get())
                    
                #     # 同时等待两个事件：① chat_task完成 ② 队列有消息（超时0.5秒）
                #     done, pending = await asyncio.wait(
                #         [chat_task, queue_task],
                #         return_when=asyncio.FIRST_COMPLETED,  # 任一事件完成就返回
                #         timeout=0.5  # 延长超时，兼顾消息捕获率和退出速度
                #     )
                    
                #     # 处理1：如果chat_task已完成 → 立即退出循环，不阻塞
                #     if chat_task in done:
                #         # 取消未完成的队列任务，避免内存泄漏
                #         for task in pending:
                #             task.cancel()
                #         break
                    
                #     # 处理2：如果拿到队列消息 → 立即消费推送
                #     if queue_task in done:
                #         try:
                #             item = await queue_task  # 获取队列消息
                #             logger.info(f"正常消费：Pushing item {item} via SSE")
                #             yield f"data: {json.dumps(item, default=str)}\n\n"  # 序列化容错
                #         except Exception as e:
                #             logger.error(f"消费队列消息失败：{str(e)}")
                #     else:
                #         # 队列任务未完成（超时）→ 取消任务，继续循环
                #         queue_task.cancel()
                #         continue
                            
                # 消费剩余队列消息（chat_task 完成后）
                while not sse_queues[session_id].empty():
                    try:
                        item = await asyncio.wait_for(sse_queues[session_id].get(), timeout=0.1)
                        logger.info(f"剩余消费：Pushing item {item} via SSE")
                        yield f"data: {json.dumps(item)}\n\n"
                    except asyncio.TimeoutError:
                        break
                
                # 获取chat结果
                response = await chat_task
                
                # 发送最终消息
                if isinstance(response, dict):
                    yield f"data: {json.dumps({'type': 'message', 'data': {'message': response.get('message', ''), 'tool_calls': response.get('tool_calls', [])}})}\n\n"
                    logger.info(f"最终消息：Pushing message {response.get('message', '')} via SSE")
                else:
                    yield f"data: {json.dumps({'type': 'message', 'data': {'message': str(response)}})}\n\n"
                    logger.info(f"最终消息：Pushing message {str(response)} via SSE")
                
                # 发送完成消息
                yield f"data: {json.dumps({'type': 'chat_complete', 'data': {}})}\n\n"
                logger.info(f"完成消息：Pushing chat complete via SSE")
                
            finally:
                os.chdir(original_cwd)
                
        except Exception as e:
            logger.error(f"Error in chat_stream: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'data': {'message': str(e)}})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # 禁用nginx缓冲
        }
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(
    request: Request
):
    """发送聊天消息（支持文件附件，兼容 JSON 和 FormData）"""
    try:
        content_type = request.headers.get("content-type", "")
        
        # 判断是 FormData 还是 JSON
        if "multipart/form-data" in content_type:
            # FormData 格式（带文件）
            form = await request.form()
            session_id = form.get("session_id")
            message = form.get("message", "")
            user_info_str = form.get("user_info")
            files = form.getlist("files")
            
            if not session_id:
                raise HTTPException(status_code=400, detail="session_id 是必需的")
            
            # 处理用户信息
            user_info_dict = None
            if user_info_str:
                try:
                    import json
                    user_info_dict = json.loads(user_info_str)
                except:
                    pass
            
            # 处理文件
            file_list = []
            if files:
                for file_item in files:
                    if hasattr(file_item, 'filename') and file_item.filename:
                        file_list.append(file_item)
            
            return await process_chat_with_files(
                str(session_id),
                str(message) if message else "",
                user_info_dict,
                file_list
            )
        else:
            # JSON 格式（向后兼容）
            body = await request.json()
            chat_request = ChatRequest(**body)
            return await process_chat_with_files(
                chat_request.session_id,
                chat_request.message,
                chat_request.user_info,
                []
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"处理请求时出错: {str(e)}")


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """上传文件"""
    try:
        # 生成唯一文件名
        file_id = str(uuid.uuid4())
        file_extension = Path(file.filename).suffix if file.filename else ""
        saved_filename = f"{file_id}{file_extension}"
        file_path = UPLOAD_DIR / saved_filename
        
        # 保存文件
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        return {
            "file_id": file_id,
            "filename": file.filename,
            "saved_path": str(file_path),
            "size": file_path.stat().st_size,
            "message": "文件上传成功"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件上传失败: {str(e)}")


@app.post("/api/image-query")
async def image_query(request: ImageQueryRequest):
    """图像查询"""
    if request.session_id not in active_agents:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    agent = active_agents[request.session_id]["agent"]
    
    # 验证图像文件是否存在
    for image_path in request.image_paths:
        if not Path(image_path).exists():
            raise HTTPException(status_code=404, detail=f"图像文件不存在: {image_path}")
    
    try:
        response = await agent.query_image(
            image_paths=request.image_paths,
            query=request.query
        )
        return {
            "response": response,
            "session_id": request.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图像查询失败: {str(e)}")


@app.get("/api/models")
async def get_models():
    """获取支持的模型列表"""
    from cursor_agent_tools.factory import MODEL_MAPPING
    
    # 确保返回格式正确
    models_dict = dict(MODEL_MAPPING) if MODEL_MAPPING else {}
    
    return {
        "models": models_dict,
        "message": "支持的模型列表",
        "count": sum(len(models) for models in models_dict.values())
    }


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """删除会话"""
    if session_id not in active_agents:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    # 删除会话的工作目录（可选，保留文件）
    session_data = active_agents[session_id]
    workspace_path = session_data.get("workspace_path")
    
    del active_agents[session_id]
    if session_id in pending_permissions:
        del pending_permissions[session_id]
    if session_id in permission_events:
        del permission_events[session_id]
    if session_id in sse_queues:
        del sse_queues[session_id]
    if session_id in event_loops:
        del event_loops[session_id]
    
    # 注意：这里不删除工作目录，保留生成的文件
    # 如果需要删除，可以取消下面的注释：
    # if workspace_path and Path(workspace_path).exists():
    #     import shutil
    #     shutil.rmtree(workspace_path)
    #     logger.info(f"Deleted workspace directory: {workspace_path}")
    
    return {
        "message": "会话已删除",
        "session_id": session_id,
        "workspace_path": workspace_path,
        "note": "工作目录已保留，文件位置: " + (workspace_path if workspace_path else "未知")
    }


@app.get("/api/sessions/{session_id}/permissions")
async def get_pending_permissions(session_id: str):
    """获取待处理的权限请求"""
    if session_id not in active_agents:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    pending_perms = []
    if session_id in pending_permissions:
        for perm in pending_permissions[session_id]:
            if perm.get("status") is None:  # 还未处理
                pending_perms.append({
                    "request_id": perm["request_id"],
                    "operation": perm["operation"],
                    "details": perm["details"]
                })
    
    return {"pending_permissions": pending_perms}


@app.post("/api/sessions/{session_id}/permissions/{request_id}")
async def respond_to_permission(
    session_id: str,
    request_id: str,
    status: str = Form(...)
):
    """响应权限请求"""
    if session_id not in active_agents:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    if session_id not in pending_permissions:
        raise HTTPException(status_code=404, detail="没有待处理的权限请求")
    
    # 查找对应的权限请求
    permission_data = None
    for perm in pending_permissions[session_id]:
        if perm["request_id"] == request_id:
            permission_data = perm
            break
    
    if not permission_data:
        raise HTTPException(status_code=404, detail="权限请求不存在")
    
    # 检查权限请求状态
    current_status = permission_data.get("status")
    if current_status is not None:
        # 如果已超时，返回更友好的错误信息
        if permission_data.get("timeout"):
            raise HTTPException(
                status_code=400, 
                detail=f"权限请求已超时（30秒），无法再处理。请求ID: {request_id}"
            )
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"权限请求已处理。当前状态: {current_status}"
            )
    
    # 设置权限状态
    if status.lower() == "granted":
        permission_data["status"] = PermissionStatus.GRANTED
        logger.info(f"Permission GRANTED for request {request_id}: {permission_data.get('operation')}")
    else:
        permission_data["status"] = PermissionStatus.DENIED
        logger.info(f"Permission DENIED for request {request_id}: {permission_data.get('operation')}")
    
    # 通过SSE推送权限响应
    if session_id in sse_queues:
        try:
            await sse_queues[session_id].put({
                "type": "permission_response",
                "data": {
                    "request_id": request_id,
                    "status": status.lower()
                }
            })
        except Exception as e:
            logger.error(f"Failed to push permission response via SSE: {str(e)}")
    
    # 通知等待的同步事件（这是关键：让同步权限回调继续执行）
    if session_id in permission_events and request_id in permission_events[session_id]:
        permission_events[session_id][request_id].set()
        logger.debug(f"Sync event set for permission request {request_id}, permission callback should continue")
        # 清理事件（可选，也可以保留以便后续使用）
    else:
        logger.warning(f"No sync event found for permission request {request_id}")
    
    return {
        "message": "权限请求已处理",
        "request_id": request_id,
        "status": status,
        "note": "Agent 将继续执行，请等待完整响应"
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )