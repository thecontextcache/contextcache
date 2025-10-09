/**
 * Cryptographic utilities for frontend
 */

export {
  verifySignature,
  verifyMemoryPack,
  verifyDocument,
  batchVerify,
  isEd25519Supported,
  getVerificationStatus
} from './verify';

export {
  solvePoW,
  solvePoWAsync,
  verifyPoW,
  generateChallenge,
  estimateSolveTime,
  calculateHashRate,
  benchmarkPoW,
  type PoWChallenge,
  type PoWSolution
} from './pow';

export {
  deriveKey,
  encrypt,
  decrypt,
  verifyPassphrase,
  exportKey,
  importKey,
  generateRecoveryPhrase
} from './encryption';

export {
  checkEntitlement,
  getAvailableFeatures,
  getPlanLimits,
  canPerformAction,
  getUpgradeRecommendations,
  comparePlans,
  formatStorage,
  formatLimit,
  calculateUsagePercentage,
  PLAN_LIMITS,
  type Plan,
  type PlanLimits
} from '../entitlements';
