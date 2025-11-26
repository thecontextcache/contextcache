#!/usr/bin/env python3
"""
KRL Import Verification Script

Verifies that all KRL components are properly imported and accessible.
Run this after installation to ensure everything is set up correctly.
"""

def verify_models():
    """Verify all model imports"""
    print("Verifying model imports...")
    
    try:
        from cc_core.models import (
            # Project models
            Project,
            ProjectDB,
            ProjectCreate,
            ProjectResponse,
            # Entity models (with KRL support)
            Entity,
            EntityCreate,
            EntityUpdate,
            EntityResponse,
            # Relation models (with KRL support)
            Relation,
            RelationCreate,
            RelationUpdate,
            RelationResponse,
            # Fact models (with KRL support)
            Fact,
            FactCreate,
            FactUpdate,
            FactResponse,
            # Provenance and audit
            Provenance,
            AuditEvent,
        )
        print("✅ All models imported successfully")
        
        # Verify KRL fields exist
        print("\nVerifying KRL fields...")
        
        # Check Entity has krl_embedding
        entity_fields = Entity.model_fields
        assert 'krl_embedding' in entity_fields, "Entity missing krl_embedding field"
        print("  ✅ Entity.krl_embedding present")
        
        # Check Relation has krl_embedding
        relation_fields = Relation.model_fields
        assert 'krl_embedding' in relation_fields, "Relation missing krl_embedding field"
        print("  ✅ Relation.krl_embedding present")
        
        # Check Fact has krl_score
        fact_fields = Fact.model_fields
        assert 'krl_score' in fact_fields, "Fact missing krl_score field"
        print("  ✅ Fact.krl_score present")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except AssertionError as e:
        print(f"❌ Field validation error: {e}")
        return False


def verify_services():
    """Verify all service imports"""
    print("\nVerifying service imports...")
    
    try:
        from cc_core.services import (
            EmbeddingService,
            RankingService,
            RAGCAGService,
            KRLService,
        )
        print("✅ All services imported successfully")
        
        # Verify KRL service has required methods
        print("\nVerifying KRLService methods...")
        assert hasattr(KRLService, 'train_and_update_embeddings'), \
            "KRLService missing train_and_update_embeddings method"
        print("  ✅ KRLService.train_and_update_embeddings present")
        
        assert hasattr(KRLService, 'find_similar_entities'), \
            "KRLService missing find_similar_entities method"
        print("  ✅ KRLService.find_similar_entities present")
        
        # Verify RankingService has graph methods
        print("\nVerifying RankingService graph methods...")
        assert hasattr(RankingService, 'retrieve_graph_context_for_query'), \
            "RankingService missing retrieve_graph_context_for_query method"
        print("  ✅ RankingService.retrieve_graph_context_for_query present")
        
        assert hasattr(RankingService, 'find_similar_entities_by_embedding'), \
            "RankingService missing find_similar_entities_by_embedding method"
        print("  ✅ RankingService.find_similar_entities_by_embedding present")
        
        assert hasattr(RankingService, 'expand_entity_neighborhood'), \
            "RankingService missing expand_entity_neighborhood method"
        print("  ✅ RankingService.expand_entity_neighborhood present")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except AssertionError as e:
        print(f"❌ Method validation error: {e}")
        return False


def verify_storage():
    """Verify storage adapter imports"""
    print("\nVerifying storage imports...")
    
    try:
        from cc_core.storage import (
            StorageAdapter,
            PostgresAdapter,
            serialize_embedding,
            deserialize_embedding,
        )
        print("✅ All storage components imported successfully")
        
        # Verify PostgresAdapter has KRL methods
        print("\nVerifying PostgresAdapter KRL methods...")
        assert hasattr(PostgresAdapter, 'batch_update_entity_embeddings'), \
            "PostgresAdapter missing batch_update_entity_embeddings method"
        print("  ✅ PostgresAdapter.batch_update_entity_embeddings present")
        
        assert hasattr(PostgresAdapter, 'batch_update_relation_embeddings'), \
            "PostgresAdapter missing batch_update_relation_embeddings method"
        print("  ✅ PostgresAdapter.batch_update_relation_embeddings present")
        
        assert hasattr(PostgresAdapter, 'batch_update_fact_krl_scores'), \
            "PostgresAdapter missing batch_update_fact_krl_scores method"
        print("  ✅ PostgresAdapter.batch_update_fact_krl_scores present")
        
        assert hasattr(PostgresAdapter, 'get_entities_with_krl_embeddings'), \
            "PostgresAdapter missing get_entities_with_krl_embeddings method"
        print("  ✅ PostgresAdapter.get_entities_with_krl_embeddings present")
        
        # Test serialization functions
        print("\nTesting embedding serialization...")
        test_embedding = [0.1, 0.2, 0.3, 0.4, 0.5]
        serialized = serialize_embedding(test_embedding)
        deserialized = deserialize_embedding(serialized)
        assert len(deserialized) == len(test_embedding), "Deserialized length mismatch"
        print("  ✅ Embedding serialization/deserialization works")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except AssertionError as e:
        print(f"❌ Method validation error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False


def verify_dependencies():
    """Verify required dependencies are installed"""
    print("\nVerifying dependencies...")
    
    dependencies = {
        'torch': 'PyTorch (for TransE training)',
        'numpy': 'NumPy (for numerical operations)',
        'asyncpg': 'AsyncPG (for PostgreSQL)',
        'pydantic': 'Pydantic (for data validation)',
        'structlog': 'Structlog (for logging)',
    }
    
    all_present = True
    for module_name, description in dependencies.items():
        try:
            __import__(module_name)
            print(f"  ✅ {module_name} - {description}")
        except ImportError:
            print(f"  ❌ {module_name} - {description} - NOT INSTALLED")
            all_present = False
    
    return all_present


def main():
    """Run all verifications"""
    print("=" * 60)
    print("KRL IMPORT VERIFICATION")
    print("=" * 60)
    print()
    
    results = {
        'Models': verify_models(),
        'Services': verify_services(),
        'Storage': verify_storage(),
        'Dependencies': verify_dependencies(),
    }
    
    print("\n" + "=" * 60)
    print("VERIFICATION SUMMARY")
    print("=" * 60)
    
    for component, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{component}: {status}")
    
    all_passed = all(results.values())
    
    print()
    if all_passed:
        print("🎉 All verifications passed!")
        print("\nYour KRL implementation is properly integrated.")
        print("Next steps:")
        print("  1. Run database migration: psql $DATABASE_URL -f api/migrations/004_add_krl_support.sql")
        print("  2. Train embeddings: python -c 'from api.examples.krl_usage_example import example_1_train_krl_embeddings; import asyncio; asyncio.run(example_1_train_krl_embeddings())'")
        print("  3. Test graph-aware queries")
        return 0
    else:
        print("⚠️  Some verifications failed.")
        print("Please check the errors above and fix them.")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())

