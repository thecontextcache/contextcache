"""
Test Memory Pack creation and verification
"""
from cc_core.services.memory_pack import MemoryPackService
from cc_core.crypto import Signer


def main():
    pack_service = MemoryPackService()
    signer = Signer()
    
    # Generate keypair
    private_key, public_key = signer.generate_keypair()
    print(f"🔑 Generated keypair")
    print(f"   Public: {public_key.decode()[:40]}...\n")
    
    # Create Memory Pack
    facts = [
        {
            "subject": "Marie Curie",
            "predicate": "discovered",
            "object": "radium",
            "confidence": 0.98
        },
        {
            "subject": "Marie Curie",
            "predicate": "won",
            "object": "Nobel Prize",
            "confidence": 0.95
        }
    ]
    
    documents = [
        {
            "title": "Curie Biography",
            "source": "wikipedia.org",
            "date": "2024-01-15"
        }
    ]
    
    print("📦 Creating Memory Pack...")
    pack = pack_service.create_pack(
        project_name="Test Project",
        facts=facts,
        documents=documents,
        private_key=private_key,
        metadata={"author": "ContextCache User"}
    )
    
    print(f"✅ Pack created")
    print(f"   Facts: {len(pack['facts'])}")
    print(f"   Documents: {len(pack['documents'])}")
    print(f"   Signature: {pack['signature'][:40]}...\n")
    
    # Verify pack
    print("🔍 Verifying signature...")
    result = pack_service.verify_pack(pack)
    
    if result["valid"]:
        print(f"✅ {result['message']}")
        print(f"   Facts verified: {result['fact_count']}")
        print(f"   Documents verified: {result['document_count']}\n")
    else:
        print(f"❌ {result['message']}\n")
    
    # Test tampering
    print("🔧 Testing tamper detection...")
    pack["facts"][0]["object"] = "gold"  # Tamper with data
    
    result = pack_service.verify_pack(pack)
    if not result["valid"]:
        print(f"✅ Tampering detected: {result['message']}\n")
    else:
        print(f"❌ Failed to detect tampering\n")
    
    print("🎉 Memory Pack tests complete!")


if __name__ == "__main__":
    main()