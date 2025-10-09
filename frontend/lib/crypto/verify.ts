/**
 * Cryptographic signature verification for browser
 * Ed25519 verification for memory pack signatures
 */

/**
 * Verify Ed25519 signature
 * 
 * @param data - The data that was signed (object or string)
 * @param signature - Base64-encoded signature
 * @param publicKey - Base64-encoded public key
 * @returns Promise<boolean> - True if signature is valid
 */
export async function verifySignature(
  data: any,
  signature: string,
  publicKey: string
): Promise<boolean> {
  try {
    // Convert data to canonical JSON (same as backend)
    const message = typeof data === 'string' 
      ? data 
      : JSON.stringify(data, Object.keys(data).sort());
    
    // Decode base64 inputs
    const sigBytes = base64ToBytes(signature);
    const pubKeyBytes = base64ToBytes(publicKey);
    const messageBytes = new TextEncoder().encode(message);
    
    // Import public key for verification (use .buffer to get ArrayBuffer)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      pubKeyBytes as unknown as ArrayBuffer,
      {
        name: 'Ed25519',
        namedCurve: 'Ed25519'
      } as any, // Type assertion for Ed25519 support
      false,
      ['verify']
    );
    
    // Verify signature
    const isValid = await crypto.subtle.verify(
      'Ed25519',
      cryptoKey,
      sigBytes as unknown as ArrayBuffer,
      messageBytes
    );
    
    return isValid;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Verify memory pack signature
 * 
 * @param memoryPack - The memory pack object
 * @returns Promise<boolean> - True if signature is valid
 */
export async function verifyMemoryPack(
  memoryPack: {
    data: any;
    signature: string;
    public_key: string;
  }
): Promise<boolean> {
  return verifySignature(
    memoryPack.data,
    memoryPack.signature,
    memoryPack.public_key
  );
}

/**
 * Verify document signature
 * 
 * @param document - Document with signature metadata
 * @returns Promise<boolean> - True if signature is valid
 */
export async function verifyDocument(
  document: {
    content: string;
    signature?: string;
    public_key?: string;
  }
): Promise<boolean> {
  if (!document.signature || !document.public_key) {
    return false; // No signature to verify
  }
  
  return verifySignature(
    document.content,
    document.signature,
    document.public_key
  );
}

/**
 * Batch verify multiple signatures
 * 
 * @param items - Array of items to verify
 * @returns Promise<boolean[]> - Array of verification results
 */
export async function batchVerify(
  items: Array<{
    data: any;
    signature: string;
    publicKey: string;
  }>
): Promise<boolean[]> {
  return Promise.all(
    items.map(item =>
      verifySignature(item.data, item.signature, item.publicKey)
    )
  );
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64 string (utility function)
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const binaryString = String.fromCharCode(...bytes);
  return btoa(binaryString);
}

/**
 * Check if Ed25519 is supported in current browser
 */
export function isEd25519Supported(): boolean {
  try {
    // Check if SubtleCrypto supports Ed25519
    return 'subtle' in crypto && 'sign' in crypto.subtle;
  } catch {
    return false;
  }
}

/**
 * Get signature verification status with details
 */
export async function getVerificationStatus(
  data: any,
  signature: string,
  publicKey: string
): Promise<{
  valid: boolean;
  error?: string;
  timestamp: number;
}> {
  const timestamp = Date.now();
  
  try {
    const valid = await verifySignature(data, signature, publicKey);
    return { valid, timestamp };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp
    };
  }
}
