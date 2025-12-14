"""
诊断脚本：检查 FastAPI 文档是否可访问
"""
import requests
import sys

def check_docs():
    """检查 API 文档端点是否可访问"""
    base_url = "http://localhost:8000"
    endpoints = {
        "根路径": f"{base_url}/",
        "Swagger UI": f"{base_url}/docs",
        "ReDoc": f"{base_url}/redoc",
        "OpenAPI JSON": f"{base_url}/openapi.json"
    }
    
    print("=" * 60)
    print("FastAPI 文档访问诊断")
    print("=" * 60)
    print()
    
    all_ok = True
    
    for name, url in endpoints.items():
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                print(f"✅ {name}: {url} - 可访问 (状态码: {response.status_code})")
            else:
                print(f"⚠️  {name}: {url} - 返回状态码: {response.status_code}")
                all_ok = False
        except requests.exceptions.ConnectionError:
            print(f"❌ {name}: {url} - 连接失败（服务可能未启动）")
            all_ok = False
        except requests.exceptions.Timeout:
            print(f"❌ {name}: {url} - 请求超时")
            all_ok = False
        except Exception as e:
            print(f"❌ {name}: {url} - 错误: {str(e)}")
            all_ok = False
    
    print()
    print("=" * 60)
    if all_ok:
        print("✅ 所有端点都可访问！")
        print()
        print("请在浏览器中访问：")
        print(f"  - Swagger UI: {base_url}/docs")
        print(f"  - ReDoc: {base_url}/redoc")
    else:
        print("❌ 部分端点无法访问")
        print()
        print("请检查：")
        print("  1. 服务是否已启动？运行: python main.py")
        print("  2. 端口 8000 是否被占用？")
        print("  3. 防火墙是否阻止了连接？")
    print("=" * 60)

if __name__ == "__main__":
    try:
        check_docs()
    except KeyboardInterrupt:
        print("\n\n诊断已取消")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ 诊断过程中出错: {str(e)}")
        sys.exit(1)

