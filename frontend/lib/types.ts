/**
 * Shared TypeScript types
 */

export interface Project {
    id: string;
    name: string;
    salt?: string;  // Hex-encoded salt for key derivation (from server)
    fact_count?: number;
    entity_count?: number;
    created_at: string;
    updated_at: string;
  }
  
  export interface Fact {
    id: string;
    subject: string;
    predicate: string;
    object: string;
    context: string;
    confidence: number;
    rank_score: number;
    decay_factor: number;
    created_at: string;
  }
  
  export interface AuditEvent {
    id: string;
    event_type: string;
    event_data: Record<string, any>;
    actor: string;
    timestamp: string;
    prev_hash: string;
    current_hash: string;
  }
  
  export interface MemoryPack {
    version: string;
    created_at: string;
    project_name: string;
    facts: Fact[];
    signature: string;
    public_key: string;
  }