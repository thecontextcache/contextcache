/**
 * Feature entitlements and plan management
 * Controls access to features based on subscription plan
 */

export type Plan = 'free' | 'pro' | 'team' | 'enterprise';

export interface PlanLimits {
  // Storage limits
  maxProjects: number;
  maxDocumentsPerProject: number;
  maxTotalDocuments: number;
  maxStorageMB: number;
  
  // Processing limits
  maxFileUploadMB: number;
  maxURLFetches: number;
  maxEmbeddingsPerDay: number;
  
  // Query limits
  maxQueriesPerDay: number;
  maxResultsPerQuery: number;
  
  // Features
  features: Set<string>;
  
  // Rate limits
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

/**
 * Plan configurations
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxProjects: 3,
    maxDocumentsPerProject: 50,
    maxTotalDocuments: 100,
    maxStorageMB: 100,
    maxFileUploadMB: 10,
    maxURLFetches: 20,
    maxEmbeddingsPerDay: 1000,
    maxQueriesPerDay: 100,
    maxResultsPerQuery: 10,
    features: new Set([
      'basic_search',
      'file_upload',
      'url_fetch',
      'export_json'
    ]),
    rateLimit: {
      requestsPerMinute: 20,
      requestsPerHour: 500
    }
  },
  
  pro: {
    maxProjects: 20,
    maxDocumentsPerProject: 500,
    maxTotalDocuments: 5000,
    maxStorageMB: 5000,
    maxFileUploadMB: 50,
    maxURLFetches: 500,
    maxEmbeddingsPerDay: 50000,
    maxQueriesPerDay: 5000,
    maxResultsPerQuery: 50,
    features: new Set([
      'basic_search',
      'advanced_search',
      'file_upload',
      'url_fetch',
      'export_json',
      'export_csv',
      'export_markdown',
      'memory_packs',
      'semantic_ranking',
      'time_decay',
      'query_explain',
      'api_access'
    ]),
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 2000
    }
  },
  
  team: {
    maxProjects: 100,
    maxDocumentsPerProject: 2000,
    maxTotalDocuments: 50000,
    maxStorageMB: 50000,
    maxFileUploadMB: 100,
    maxURLFetches: 5000,
    maxEmbeddingsPerDay: 500000,
    maxQueriesPerDay: 50000,
    maxResultsPerQuery: 100,
    features: new Set([
      'basic_search',
      'advanced_search',
      'file_upload',
      'url_fetch',
      'export_json',
      'export_csv',
      'export_markdown',
      'memory_packs',
      'semantic_ranking',
      'time_decay',
      'query_explain',
      'api_access',
      'team_collaboration',
      'shared_projects',
      'audit_logs',
      'sso',
      'priority_support'
    ]),
    rateLimit: {
      requestsPerMinute: 120,
      requestsPerHour: 10000
    }
  },
  
  enterprise: {
    maxProjects: Infinity,
    maxDocumentsPerProject: Infinity,
    maxTotalDocuments: Infinity,
    maxStorageMB: Infinity,
    maxFileUploadMB: 500,
    maxURLFetches: Infinity,
    maxEmbeddingsPerDay: Infinity,
    maxQueriesPerDay: Infinity,
    maxResultsPerQuery: 200,
    features: new Set([
      'basic_search',
      'advanced_search',
      'file_upload',
      'url_fetch',
      'export_json',
      'export_csv',
      'export_markdown',
      'memory_packs',
      'semantic_ranking',
      'time_decay',
      'query_explain',
      'api_access',
      'team_collaboration',
      'shared_projects',
      'audit_logs',
      'sso',
      'priority_support',
      'custom_models',
      'on_premise',
      'dedicated_support',
      'sla',
      'custom_integration'
    ]),
    rateLimit: {
      requestsPerMinute: Infinity,
      requestsPerHour: Infinity
    }
  }
};

/**
 * Check if a feature is available for a given plan
 * 
 * @param feature - Feature identifier
 * @param plan - User's subscription plan
 * @returns boolean - True if feature is available
 */
export function checkEntitlement(feature: string, plan: Plan = 'free'): boolean {
  const limits = PLAN_LIMITS[plan];
  return limits.features.has(feature);
}

/**
 * Get all available features for a plan
 */
export function getAvailableFeatures(plan: Plan): string[] {
  return Array.from(PLAN_LIMITS[plan].features);
}

/**
 * Get plan limits
 */
export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

/**
 * Check if user can perform an action based on usage
 */
export function canPerformAction(
  action: 'create_project' | 'upload_document' | 'query',
  plan: Plan,
  currentUsage: {
    projectCount?: number;
    documentCount?: number;
    queriestoday?: number;
    storageUsedMB?: number;
  }
): { allowed: boolean; reason?: string } {
  const limits = PLAN_LIMITS[plan];
  
  switch (action) {
    case 'create_project':
      if ((currentUsage.projectCount || 0) >= limits.maxProjects) {
        return {
          allowed: false,
          reason: `Project limit reached (${limits.maxProjects}). Upgrade to create more projects.`
        };
      }
      break;
      
    case 'upload_document':
      if ((currentUsage.documentCount || 0) >= limits.maxTotalDocuments) {
        return {
          allowed: false,
          reason: `Document limit reached (${limits.maxTotalDocuments}). Upgrade to add more documents.`
        };
      }
      if ((currentUsage.storageUsedMB || 0) >= limits.maxStorageMB) {
        return {
          allowed: false,
          reason: `Storage limit reached (${limits.maxStorageMB}MB). Upgrade for more storage.`
        };
      }
      break;
      
    case 'query':
      if ((currentUsage.queriestoday || 0) >= limits.maxQueriesPerDay) {
        return {
          allowed: false,
          reason: `Daily query limit reached (${limits.maxQueriesPerDay}). Upgrade for more queries.`
        };
      }
      break;
  }
  
  return { allowed: true };
}

/**
 * Get upgrade recommendations
 */
export function getUpgradeRecommendations(
  currentPlan: Plan,
  currentUsage: {
    projectCount: number;
    documentCount: number;
    queriesPerDay: number;
    storageUsedMB: number;
  }
): string[] {
  const limits = PLAN_LIMITS[currentPlan];
  const recommendations: string[] = [];
  
  // Check usage against limits
  if (currentUsage.projectCount >= limits.maxProjects * 0.8) {
    recommendations.push('You\'re approaching your project limit');
  }
  
  if (currentUsage.documentCount >= limits.maxTotalDocuments * 0.8) {
    recommendations.push('You\'re approaching your document limit');
  }
  
  if (currentUsage.queriesPerDay >= limits.maxQueriesPerDay * 0.8) {
    recommendations.push('You\'re approaching your daily query limit');
  }
  
  if (currentUsage.storageUsedMB >= limits.maxStorageMB * 0.8) {
    recommendations.push('You\'re approaching your storage limit');
  }
  
  if (recommendations.length > 0) {
    const nextPlan = getNextPlan(currentPlan);
    if (nextPlan) {
      recommendations.push(`Consider upgrading to ${nextPlan} for higher limits`);
    }
  }
  
  return recommendations;
}

/**
 * Get next plan in tier
 */
function getNextPlan(currentPlan: Plan): Plan | null {
  const planOrder: Plan[] = ['free', 'pro', 'team', 'enterprise'];
  const currentIndex = planOrder.indexOf(currentPlan);
  const nextPlan = currentIndex < planOrder.length - 1 ? planOrder[currentIndex + 1] : undefined;
  return nextPlan ?? null;
}

/**
 * Compare two plans
 */
export function comparePlans(plan1: Plan, plan2: Plan): {
  better: Plan;
  improvements: string[];
} {
  const limits1 = PLAN_LIMITS[plan1];
  const limits2 = PLAN_LIMITS[plan2];
  const improvements: string[] = [];
  
  if (limits2.maxProjects > limits1.maxProjects) {
    improvements.push(`${limits2.maxProjects - limits1.maxProjects} more projects`);
  }
  
  if (limits2.maxTotalDocuments > limits1.maxTotalDocuments) {
    improvements.push(`${limits2.maxTotalDocuments - limits1.maxTotalDocuments} more documents`);
  }
  
  if (limits2.maxQueriesPerDay > limits1.maxQueriesPerDay) {
    improvements.push(`${limits2.maxQueriesPerDay - limits1.maxQueriesPerDay} more daily queries`);
  }
  
  // Check feature differences
  const newFeatures = [...limits2.features].filter(f => !limits1.features.has(f));
  if (newFeatures.length > 0) {
    improvements.push(`${newFeatures.length} additional features`);
  }
  
  return {
    better: improvements.length > 0 ? plan2 : plan1,
    improvements
  };
}

/**
 * Format storage size for display
 */
export function formatStorage(mb: number): string {
  if (mb >= 1000) {
    return `${(mb / 1000).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

/**
 * Format limit for display
 */
export function formatLimit(value: number): string {
  if (value === Infinity) {
    return 'Unlimited';
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

/**
 * Calculate usage percentage
 */
export function calculateUsagePercentage(used: number, limit: number): number {
  if (limit === Infinity) return 0;
  return Math.min(100, (used / limit) * 100);
}
