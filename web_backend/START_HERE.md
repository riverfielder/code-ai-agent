# 🚀 Code Agent Web API - 从这里开始

## 快速安装（3步）

### 步骤 1: 安装依赖

**Windows:**
```bash
install.bat
```

**Linux/Mac:**
```bash
chmod +x install.sh
./install.sh
```

### 步骤 2: 配置 API 密钥

复制 `.env.example` 到 `.env` 并填入您的 API 密钥：
```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

编辑 `.env` 文件，至少配置一个 API 密钥。

### 步骤 3: 启动服务

```bash
python main.py
```

服务将在 `http://localhost:8000` 启动。

## ✅ 验证安装

运行测试脚本检查依赖：
```bash
python test_install.py
```

## 📖 文档

- **快速修复**: [QUICK_FIX.md](./QUICK_FIX.md) - 如果遇到安装问题
- **安装指南**: [INSTALL_GUIDE.md](./INSTALL_GUIDE.md) - 详细安装说明
- **API 文档**: [README.md](./README.md) - 完整 API 文档

## 🆘 遇到问题？

1. **依赖安装失败** → 查看 [QUICK_FIX.md](./QUICK_FIX.md)
2. **Rust/Cargo 错误** → 查看 [INSTALL_GUIDE.md](./INSTALL_GUIDE.md)
3. **模块找不到** → 运行 `python test_install.py` 检查

## 🎯 下一步

安装成功后：
1. 启动后端：`python main.py`
2. 启动前端：`cd ../web_frontend && npm run dev`
3. 访问：`http://localhost:3000`
