"""
Test MCP Extractor Server
"""
from cc_core.mcp.extractor_server import ExtractorServer


def main():
    extractor = ExtractorServer()
    
    # Test text
    text = """
    Marie Curie discovered radium and polonium. 
    She won the Nobel Prize in Physics in 1903.
    Marie Curie was a pioneering physicist and chemist.
    ISSO Email - ISSO@uml.edu
    ISSO Ph No - +1 978-934-2383
    """
    
    print("📝 Extracting facts from text...\n")
    facts = extractor.extract_facts(
        text, 
        source_url="test.txt",
        document_id="test-123"
    )
    
    print(f"✅ Extracted {len(facts)} facts:\n")
    
    for fact in facts:
        print(f"📌 {fact['subject']} --[{fact['predicate']}]--> {fact['object']}")
        print(f"   Confidence: {fact['confidence']:.2f}")
        print(f"   Context: {fact['context'][:80]}...")
        print()
    
    # Test MCP tools
    print("\n🔧 MCP Tools:")
    tools = extractor.get_mcp_tools()
    for tool in tools:
        print(f"  - {tool['name']}: {tool['description']}")


if __name__ == "__main__":
    main()