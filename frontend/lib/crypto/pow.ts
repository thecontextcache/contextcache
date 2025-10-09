/**
 * Proof-of-Work (PoW) implementation for client-side spam prevention
 * Uses SHA-256 hashing to find a nonce that produces a hash with leading zeros
 */

export interface PoWChallenge {
  challenge: string;
  difficulty: number;
  timestamp: number;
}

export interface PoWSolution {
  nonce: number;
  solution: string;
  timestamp: number;
  attempts: number;
  duration: number;
}

/**
 * Solve a proof-of-work challenge
 * 
 * @param challenge - The challenge string from server
 * @param difficulty - Number of leading zeros required (typically 4-6)
 * @param maxAttempts - Maximum attempts before giving up (default: 10 million)
 * @returns PoWSolution with nonce and solution hash
 */
export async function solvePoW(
  challenge: string,
  difficulty: number = 4,
  maxAttempts: number = 10_000_000
): Promise<PoWSolution> {
  const startTime = Date.now();
  const target = '0'.repeat(difficulty);
  
  let nonce = 0;
  let solution = '';
  let attempts = 0;
  
  // Use Web Crypto API for hashing
  while (attempts < maxAttempts) {
    const data = `${challenge}:${nonce}`;
    const hash = await sha256(data);
    attempts++;
    
    if (hash.startsWith(target)) {
      solution = hash;
      break;
    }
    
    nonce++;
    
    // Yield to UI every 1000 attempts to prevent blocking
    if (attempts % 1000 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  if (!solution) {
    throw new Error(`Failed to solve PoW after ${maxAttempts} attempts`);
  }
  
  const duration = Date.now() - startTime;
  
  return {
    nonce,
    solution,
    timestamp: Date.now(),
    attempts,
    duration
  };
}

/**
 * Solve PoW with Web Worker for better performance
 * Falls back to inline solving if Workers not available
 */
export async function solvePoWAsync(
  challenge: string,
  difficulty: number = 4,
  maxAttempts: number = 10_000_000
): Promise<PoWSolution> {
  // Check if Web Workers are available
  if (typeof Worker === 'undefined') {
    return solvePoW(challenge, difficulty, maxAttempts);
  }
  
  return new Promise((resolve, reject) => {
    // Create inline worker
    const workerCode = `
      self.onmessage = async function(e) {
        const { challenge, difficulty, maxAttempts } = e.data;
        const startTime = Date.now();
        const target = '0'.repeat(difficulty);
        
        let nonce = 0;
        let solution = '';
        let attempts = 0;
        
        async function sha256(text) {
          const encoder = new TextEncoder();
          const data = encoder.encode(text);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
        
        while (attempts < maxAttempts) {
          const data = challenge + ':' + nonce;
          const hash = await sha256(data);
          attempts++;
          
          if (hash.startsWith(target)) {
            solution = hash;
            break;
          }
          
          nonce++;
        }
        
        if (!solution) {
          self.postMessage({ error: 'Failed to solve PoW' });
          return;
        }
        
        const duration = Date.now() - startTime;
        
        self.postMessage({
          nonce,
          solution,
          timestamp: Date.now(),
          attempts,
          duration
        });
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    
    worker.onmessage = (e) => {
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        resolve(e.data);
      }
      worker.terminate();
    };
    
    worker.onerror = (error) => {
      reject(error);
      worker.terminate();
    };
    
    worker.postMessage({ challenge, difficulty, maxAttempts });
  });
}

/**
 * Verify a PoW solution
 * 
 * @param challenge - Original challenge
 * @param nonce - Solution nonce
 * @param difficulty - Required difficulty
 * @returns boolean - True if solution is valid
 */
export async function verifyPoW(
  challenge: string,
  nonce: number,
  difficulty: number
): Promise<boolean> {
  const data = `${challenge}:${nonce}`;
  const hash = await sha256(data);
  const target = '0'.repeat(difficulty);
  return hash.startsWith(target);
}

/**
 * Generate a PoW challenge (typically done by server)
 * 
 * @param difficulty - Number of leading zeros required
 * @returns PoWChallenge
 */
export function generateChallenge(difficulty: number = 4): PoWChallenge {
  const challenge = Array.from(
    crypto.getRandomValues(new Uint8Array(16))
  ).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return {
    challenge,
    difficulty,
    timestamp: Date.now()
  };
}

/**
 * Estimate time to solve based on difficulty
 * 
 * @param difficulty - Number of leading zeros
 * @returns Estimated seconds to solve
 */
export function estimateSolveTime(difficulty: number): number {
  // Rough estimate: each additional zero multiplies time by 16
  // Base case: difficulty 4 takes ~0.5 seconds on average hardware
  const baseTime = 0.5; // seconds
  const factor = Math.pow(16, difficulty - 4);
  return baseTime * factor;
}

/**
 * Calculate hash rate (hashes per second)
 * 
 * @param attempts - Number of attempts
 * @param duration - Duration in milliseconds
 * @returns Hashes per second
 */
export function calculateHashRate(attempts: number, duration: number): number {
  return (attempts / duration) * 1000;
}

/**
 * SHA-256 hash using Web Crypto API
 */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Benchmark PoW solver performance
 * 
 * @returns Benchmark results
 */
export async function benchmarkPoW(): Promise<{
  hashRate: number;
  difficulty4Time: number;
  difficulty5Time: number;
}> {
  // Test difficulty 4
  const challenge1 = generateChallenge(4);
  const solution1 = await solvePoW(challenge1.challenge, 4, 100_000);
  const hashRate = calculateHashRate(solution1.attempts, solution1.duration);
  
  // Test difficulty 5
  const challenge2 = generateChallenge(5);
  const solution2 = await solvePoW(challenge2.challenge, 5, 1_000_000);
  
  return {
    hashRate: Math.round(hashRate),
    difficulty4Time: solution1.duration,
    difficulty5Time: solution2.duration
  };
}
