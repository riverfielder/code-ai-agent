@echo off
REM Code Agent Web API 安装脚本 (Windows)

echo 🚀 安装 Code Agent Web API 依赖...

REM 检查 Python
python --version
if errorlevel 1 (
    echo ❌ 错误: 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

REM 升级 pip
echo 📦 升级 pip...
python -m pip install --upgrade pip

REM 安装基础依赖（不使用编译版本）
echo 📥 安装 FastAPI 和相关依赖...
python -m pip install fastapi
python -m pip install uvicorn
python -m pip install python-multipart
python -m pip install pydantic

REM 安装项目主要依赖
echo 📥 安装 Code Agent 项目依赖...
set CURRENT_DIR=%CD%
cd /d %~dp0..

REM 优先使用项目根目录的 requirements.txt
if exist requirements.txt (
    echo 使用项目根目录的 requirements.txt
    python -m pip install -r requirements.txt
) else if exist web_api\requirements_full.txt (
    echo 使用 web_api/requirements_full.txt
    python -m pip install -r web_api\requirements_full.txt
) else (
    echo ⚠️  警告: 未找到 requirements.txt，尝试安装核心依赖...
    python -m pip install anthropic openai httpx ollama beautifulsoup4
)

cd /d %CURRENT_DIR%

REM 验证安装
echo ✅ 验证安装...
python test_install.py

if errorlevel 1 (
    echo.
    echo ⚠️  部分依赖可能未正确安装
    echo 请查看上面的错误信息，或运行: python test_install.py
    pause
    exit /b 1
)

echo.
echo ✅ 安装完成！
echo.
echo 现在可以运行: python main.py
pause
