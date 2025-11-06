"""
Test Recovery Kit generation and key recovery
"""
from cc_core.services.recovery_kit import RecoveryKitService
from cc_core.crypto import Encryptor


def main():
    recovery_service = RecoveryKitService()
    encryptor = Encryptor()
    
    print(" Testing Recovery Kit...\n")
    
    # Generate a sample encryption key and salt
    encryption_key = encryptor.generate_key()
    salt = encryptor.generate_salt()
    
    print(f" Generated encryption key: {encryption_key.hex()[:32]}...")
    print(f" Generated salt: {salt.hex()}\n")
    
    # Create recovery kit
    print(" Creating recovery kit...")
    kit = recovery_service.create_recovery_kit(
        project_id="test-project-123",
        project_name="Test Project",
        encryption_key=encryption_key,
        salt=salt
    )
    
    print(f" Recovery kit created")
    print(f"   Mnemonic: {kit['mnemonic'][:50]}...")
    print(f"   Word count: {len(kit['mnemonic'].split())}")
    print(f"   QR code: {kit['qr_code'][:50]}...\n")
    
    # Validate mnemonic
    print(" Validating mnemonic...")
    valid = recovery_service.validate_mnemonic(kit['mnemonic'])
    print(f" Mnemonic valid: {valid}\n")
    
    # Recover key from mnemonic
    print(" Recovering key from mnemonic...")
    recovered_key = recovery_service.recover_key_from_mnemonic(
        kit['mnemonic'],
        kit['encrypted_key'],
        kit['nonce']
    )
    
    print(f" Key recovered: {recovered_key.hex()[:32]}...")
    print(f" Keys match: {recovered_key == encryption_key}\n")
    
    # Export to file
    print(" Exporting recovery kit to file...")
    recovery_service.export_to_file(kit, "test_recovery_kit.json")
    print(f" Exported to: test_recovery_kit.json\n")
    
    # Import and verify
    print(" Importing recovery kit from file...")
    imported_kit = recovery_service.import_from_file("test_recovery_kit.json")
    
    recovered_key_2 = recovery_service.recover_key_from_mnemonic(
        imported_kit['mnemonic'],
        imported_kit['encrypted_key'],
        imported_kit['nonce']
    )
    
    print(f" Imported and recovered: {recovered_key_2 == encryption_key}\n")
    
    # Clean up
    import os
    os.remove("test_recovery_kit.json")
    print(" Cleaned up test file")
    
    print("\n All recovery kit tests passed!")
    print("\n Sample Mnemonic (24 words):")
    print(f"   {kit['mnemonic']}")
    print("\n  WARNING: In production, store this securely offline!")


if __name__ == "__main__":
    main()