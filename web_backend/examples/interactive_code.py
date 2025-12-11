
from cursor_agent_tools import run_agent_interactive
import asyncio
from dotenv import load_dotenv
import os

# 2. 加载 .env 文件（确保 .env 与脚本在同一目录，或指定路径：load_dotenv("C:/xxx/.env")）
load_dotenv()

async def main():
    # Parameters:
    # - model: The model to use (e.g., 'claude-3-5-sonnet-latest', 'gpt-4o')
    # - initial_query: The task description
    # - max_iterations: Maximum number of steps (default 10)
    # - auto_continue: Whether to continue automatically without user input (default True)
    
    await run_agent_interactive(
        model='qwen-mt-plus',
        initial_query='帮我在当前目录下创建一个二分查找代码文件',
        max_iterations=15
        # auto_continue=True is the default - agent continues automatically
        # To disable automatic continuation, set auto_continue=False
    )

if __name__ == "__main__":
    asyncio.run(main())