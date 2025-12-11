#!/bin/bash
# Code Agent Web API 安装脚本

echo "🚀 安装 Code Agent Web API 依赖..."

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 Python，请先安装 Python 3.8+"
    exit 1
fi

# 升级 pip
echo "📦 升级 pip..."
python3 -m pip install --upgrade pip

# 安装基础依赖（不使用编译版本）
echo "📥 安装 FastAPI 和相关依赖..."
python3 -m pip install fastapi
python3 -m pip install uvicorn
python3 -m pip install python-multipart
python3 -m pip install pydantic

# 验证安装
echo "✅ 验证安装..."
python3 test_install.py

if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️  部分依赖可能未正确安装"
    echo "请查看上面的错误信息，或运行: python3 test_install.py"
    exit 1
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "现在可以运行: python3 main.py"
