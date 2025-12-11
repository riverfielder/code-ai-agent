import asyncio

## 

## 工具包导入
from cursor_agent_tools import create_agent


from dotenv import load_dotenv
import os
import sys
import traceback
import platform
from pathlib import Path

from utils import (
    Colors, print_error, print_system_message, 
    print_user_query, print_assistant_response, 
    print_info, print_separator
)
# 2. 加载 .env 文件（确保 .env 与脚本在同一目录，或指定路径：load_dotenv("C:/xxx/.env")）
load_dotenv()

async def main():
    # Create a Claude agent instance
    agent = create_agent(model='qwen-plus')
    agent.register_default_tools()
    
    # Create a basic user info context
    user_info = {
        "os": platform.system(),
        "workspace_path": os.getcwd(),
    }
    # Demo query for code search
    query = "帮我在当前目录下创建一个二分查找代码文件"
    
    print_system_message("Sending query to finish the task...")
    
    # Get the response from the agent
    response = await agent.chat(query, user_info)
    
    # Process the structured response
  
    print_assistant_response(response)

if __name__ == "__main__":
    asyncio.run(main())