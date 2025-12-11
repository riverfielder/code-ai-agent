# Code Agent Web API

FastAPI 实现的 RESTful API，为前端应用提供后端服务。

## 功能特性

- ✅ **会话管理** - 创建和管理 AI 会话
- ✅ **聊天接口** - 发送消息并获取 AI 回复
- ✅ **文件上传** - 支持文件上传功能
- ✅ **图像查询** - 支持多模态图像分析
- ✅ **权限控制** - 灵活的权限配置选项
- ✅ **多模型支持** - 支持 Claude、OpenAI、Qwen、Ollama 等模型

## 快速开始

### 配置 API Keys

在使用之前，需要配置相应的 API keys。创建 `.env` 文件（在项目根目录或 `web_api` 目录）：

```bash
# 复制示例文件
cp .env.example .env

# 编辑 .env 文件，填入你的 API keys
```

**必需的 API Keys（根据你使用的模型）：**
- **Claude 模型**: `ANTHROPIC_API_KEY` - [获取地址](https://console.anthropic.com/)
- **OpenAI 模型**: `OPENAI_API_KEY` - [获取地址](https://platform.openai.com/api-keys)
- **Qwen 模型**: `QWEN_API_KEY` 或 `DASHSCOPE_API_KEY` - [获取地址](https://dashscope.console.aliyun.com/)
- **Ollama 模型**: 无需 API key，但需要本地运行 Ollama 服务

**示例 `.env` 文件：**
```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
QWEN_API_KEY=sk-...
```

### 安装依赖

**最简单方式（推荐）:**

**Windows:**
```bash
cd web_api
install_simple.bat
```

**Linux/Mac:**
```bash
cd web_api
chmod +x install_simple.sh
./install_simple.sh
```

这会一次性安装所有依赖（包括项目依赖）。

**或使用完整安装脚本:**

**Windows:**
```bash
cd web_api
install.bat
```

**Linux/Mac:**
```bash
cd web_api
chmod +x install.sh
./install.sh
```

**手动安装（如果脚本不工作）:**
```bash
# 一次性安装所有依赖
pip install fastapi uvicorn python-multipart pydantic anthropic openai httpx ollama beautifulsoup4 colorama python-dotenv typing-extensions requests urllib3
```

**验证安装：**
```bash
python test_install.py
```

**检查 API 文档访问（如果无法访问 /docs）：**
```bash
# 需要先安装 requests: pip install requests
python check_docs.py
```

**如果遇到编译错误（Rust/Cargo 相关）：**
- 查看 [INSTALL_GUIDE.md](./INSTALL_GUIDE.md) 获取详细解决方案
- 或逐个安装：`pip install fastapi` 然后 `pip install uvicorn` 等

### 配置环境变量

确保设置了必要的 API 密钥（在 `.env` 文件或环境变量中）：

```env
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
QWEN_API_KEY=your_qwen_key
DASHSCOPE_API_KEY=your_dashscope_key
```

### 启动服务

```bash
python main.py
```

或者使用 uvicorn：

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

API 将在 `http://localhost:8000` 启动。

### API 文档

启动服务后，访问以下地址查看交互式 API 文档：

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

**如果无法访问文档页面，请检查：**

1. **确认服务已启动**：
   ```bash
   # 检查服务是否运行
   curl http://localhost:8000/
   # 或访问浏览器 http://localhost:8000/
   ```

2. **检查端口是否被占用**：
   ```bash
   # Windows
   netstat -ano | findstr :8000
   
   # Linux/Mac
   lsof -i :8000
   ```

3. **尝试使用 127.0.0.1 代替 localhost**：
   - `http://127.0.0.1:8000/docs`

4. **检查防火墙设置**：确保 8000 端口未被阻止

5. **查看启动日志**：检查是否有错误信息

6. **重启服务**：
   ```bash
   # 停止当前服务（Ctrl+C），然后重新启动
   python main.py
   ```

## API 端点

### 创建会话

```http
POST /api/sessions
Content-Type: application/json

{
  "model": "claude-3-5-sonnet-latest",
  "temperature": 0.0,
  "timeout": 180,
  "permission_config": {
    "yolo_mode": false,
    "command_allowlist": [],
    "command_denylist": [],
    "delete_file_protection": true
  }
}
```

### 发送消息

```http
POST /api/chat
Content-Type: application/json

{
  "session_id": "uuid",
  "message": "你好，请帮我创建一个 Python 函数",
  "user_info": {
    "workspace_path": "/path/to/workspace"
  }
}
```

### 上传文件

```http
POST /api/upload
Content-Type: multipart/form-data

file: <file>
```

### 图像查询

```http
POST /api/image-query
Content-Type: application/json

{
  "session_id": "uuid",
  "query": "这张图片显示了什么？",
  "image_paths": ["/path/to/image.jpg"]
}
```

### 获取支持的模型

```http
GET /api/models
```

## 项目结构

```
web_api/
├── main.py              # FastAPI 应用主文件
├── requirements.txt     # Python 依赖
├── uploads/             # 上传文件存储目录（自动创建）
└── README.md            # 本文档
```

## 注意事项

1. **CORS 配置**：当前允许所有来源访问，生产环境应限制为具体域名
2. **会话存储**：当前使用内存存储，生产环境应使用 Redis 或数据库
3. **文件存储**：上传的文件存储在 `uploads/` 目录，生产环境应考虑使用对象存储
4. **安全性**：生产环境应添加身份验证和授权机制

## 开发建议

- 使用虚拟环境：`python -m venv venv && source venv/bin/activate`
- 启用热重载：使用 `--reload` 参数
- 查看日志：FastAPI 会自动记录请求日志
