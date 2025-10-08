"""
Test MCP Docs Server
"""
import asyncio
from cc_core.mcp.docs_server import DocsServer


async def main():
    docs_server = DocsServer()
    
    # Test 1: Fetch Wikipedia page
    print("📡 Fetching Wikipedia page...")
    result = await docs_server.fetch_document(
        "https://en.wikipedia.org/wiki/Marie_Curie"
    )
    print(f"✅ Fetched: {result['title']}")
    print(f"📄 Text length: {len(result['text'])} chars")
    print(f"🔍 Preview: {result['text'][:200]}...\n")
    
    # Test 2: Domain allowlist
    print("🚫 Testing blocked domain...")
    try:
        await docs_server.fetch_document("https://example.com/doc")
    except ValueError as e:
        print(f"✅ Correctly blocked: {e}\n")
    
    # Test 3: MCP tool definitions
    print("🔧 MCP Tools:")
    tools = docs_server.get_mcp_tools()
    for tool in tools:
        print(f"  - {tool['name']}: {tool['description']}")


if __name__ == "__main__":
    asyncio.run(main())