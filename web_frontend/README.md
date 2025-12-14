# Code Agent 前端应用

现代化的 React + TypeScript + Tailwind CSS 前端界面，用于与 Code Agent 后端 API 交互。

## 功能特性

- ✅ **实时对话界面** - 与 AI 助手进行流畅的对话
- ✅ **文件上传** - 支持上传文件到服务器
- ✅ **权限控制** - 配置 YOLO 模式、命令白名单/黑名单等
- ✅ **模型选择** - 支持多种 AI 模型（Claude、OpenAI、Qwen、Ollama）
- ✅ **工具调用显示** - 可视化显示 AI 使用的工具和参数
- ✅ **响应式设计** - 适配不同屏幕尺寸

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **Axios** - HTTP 客户端
- **Lucide React** - 图标库

## 快速开始

### 前置要求

- Node.js 18+ (推荐使用 LTS 版本)
- npm 或 yarn

检查版本：
```bash
node --version  # 应该是 v18.0.0 或更高
npm --version
```

### 安装依赖

```bash
cd web_frontend
npm install
```

### 开发模式

```bash
npm run dev
```

应用将在 `http://localhost:3000` 启动。

### 故障排除

如果遇到 `crypto$2.getRandomValues is not a function` 错误：

**Windows:**
```bash
fix.bat
```

**Linux/Mac:**
```bash
chmod +x fix.sh
./fix.sh
```

或手动执行：
```bash
# 清理并重新安装
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

详细说明请查看 [fix_vite_error.md](./fix_vite_error.md)

### 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist` 目录。

### 预览生产构建

```bash
npm run preview
```

## 环境变量

创建 `.env` 文件（可选）：

```env
VITE_API_URL=http://localhost:8000
```

如果不设置，默认使用 `http://localhost:8000`。

## 项目结构

```
web_frontend/
├── src/
│   ├── components/      # React 组件
│   │   ├── ChatInterface.tsx    # 聊天界面
│   │   ├── SettingsPanel.tsx   # 设置面板
│   │   └── FileUpload.tsx      # 文件上传组件
│   ├── services/        # API 服务
│   │   └── api.ts       # API 调用封装
│   ├── types.ts         # TypeScript 类型定义
│   ├── App.tsx          # 主应用组件
│   ├── main.tsx         # 应用入口
│   └── index.css        # 全局样式
├── index.html           # HTML 模板
├── package.json         # 项目配置
├── tsconfig.json        # TypeScript 配置
├── vite.config.ts       # Vite 配置
└── tailwind.config.js   # Tailwind 配置
```

## 使用说明

1. **启动后端 API**（参考 `web_api/README.md`）
2. **启动前端应用**：`npm run dev`
3. **打开浏览器**访问 `http://localhost:3000`
4. **初始化会话**：点击"初始化会话"按钮
5. **开始对话**：在输入框中输入消息并发送
6. **上传文件**：点击上传图标上传文件
7. **配置设置**：点击设置图标配置模型和权限选项

## 浏览器支持

- Chrome (最新版)
- Firefox (最新版)
- Safari (最新版)
- Edge (最新版)
