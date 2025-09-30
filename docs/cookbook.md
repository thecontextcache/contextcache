---
title: Cookbook
description: "Step-by-step guides for common workflows"
---

# Cookbook

Practical guides for common ContextCache workflows.

## Table of Contents

1. [Import a PDF Research Paper](#import-a-pdf-research-paper)
2. [Query with Explainability](#query-with-explainability)
3. [Export and Share a Memory Pack](#export-and-share-a-memory-pack)
4. [Verify an Imported Pack](#verify-an-imported-pack)
5. [Visualize the Knowledge Graph](#visualize-the-knowledge-graph)
6. [Set Up Custom Domain Allowlist](#set-up-custom-domain-allowlist)
7. [Backup and Restore](#backup-and-restore)
8. [Rotate Project Keys](#rotate-project-keys)
9. [Monitor Rate Limits](#monitor-rate-limits)
10. [Deploy to Production](#deploy-to-production)

---

## Import a PDF Research Paper

**Goal:** Ingest a research paper, extract facts, and make it queryable.

### Step 1: Start ContextCache
```bash
docker-compose -f infra/docker-compose.dev.yml up -d
Step 2: Create a Project
Frontend:

Navigate to http://localhost:3000
Click "New Project"
Enter name: "AI Research"
Enter passphrase (20+ characters)
Click "Create"

API:
bashcurl -X POST http://localhost:8000/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Research",
    "passphrase": "correct horse battery staple mountain river"
  }'
Response:
json{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "AI Research",
  "salt": "base64-encoded-salt"
}
Step 3: Upload PDF
Frontend:

Navigate to "Inbox"
Drag and drop attention-is-all-you-need.pdf
Review chunks preview
Click "Ingest"

API:
bashcurl -X POST http://localhost:8000/documents/ingest \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "X-Project-ID: 550e8400-..." \
  -F "file=@attention-is-all-you-need.pdf"
Response:
json{
  "job_id": "job-123",
  "document_id": "doc-456",
  "status": "queued",
  "estimated_duration_seconds": 45
}
Step 4: Monitor Progress
Frontend:

Progress bar shows extraction status
Notification when complete

API:
bashcurl http://localhost:8000/jobs/job-123 \
  -H "Authorization: Bearer YOUR_API_KEY"
Response:
json{
  "job_id": "job-123",
  "status": "completed",
  "facts_extracted": 89,
  "processing_time_seconds": 42
}
Step 5: Query the Paper
Frontend:

Navigate to "Ask"
Enter: "What is the Transformer architecture?"
View results with citations

API:
bashcurl -X POST http://localhost:8000/query \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "550e8400-...",
    "query": "What is the Transformer architecture?",
    "limit": 10
  }'

Query with Explainability
Goal: Understand why specific facts were returned and how they were ranked.
Step 1: Execute Query with Explain Flag
bashcurl -X POST http://localhost:8000/query \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "550e8400-...",
    "query": "How does attention mechanism work?",
    "limit": 5,
    "explain": true
  }'
Step 2: Examine Explanation
Response:
json{
  "query": "How does attention mechanism work?",
  "facts": [
    {
      "fact_id": "770e8400-...",
      "subject": "Attention mechanism",
      "predicate": "computes",
      "object": "weighted sum of values",
      "confidence": 0.95,
      "rank_score": 0.89,
      "similarity": 0.94,
      "explanation": {
        "pagerank_score": 0.92,
        "pagerank_reason": "Central node with 23 incoming edges",
        "decay_factor": 0.97,
        "decay_reason": "Created 5 days ago",
        "semantic_similarity": 0.94,
        "similarity_reason": "Query embedding matches 'attention' and 'mechanism'",
        "confidence_source": "Extracted from peer-reviewed paper",
        "final_computation": "0.92 * 0.97 * 0.95 = 0.85"
      },
      "provenance": {
        "source_url": "https://arxiv.org/abs/1706.03762",
        "document_title": "Attention Is All You Need",
        "chunk_text": "The attention mechanism computes..."
      }
    }
  ]
}
Step 3: Visualize Reasoning (Frontend)
Frontend Explain Panel shows:

Confidence score breakdown
PageRank contribution
Time decay impact
Semantic similarity score
Citation with link to source


Export and Share a Memory Pack
Goal: Export facts as a signed, portable Memory Pack for sharing.
Step 1: Export Pack
Frontend:

Navigate to "Export"
Select filters:

Min rank score: 0.5
Include facts: Yes
Include entities: Yes


Click "Export Pack"
Download memory-pack.json

API:
bashcurl -X POST http://localhost:8000/packs/export \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "550e8400-...",
    "include_facts": true,
    "include_entities": true,
    "min_rank_score": 0.5
  }'
Response:
json{
  "pack_id": "pack-123",
  "download_url": "https://storage.googleapis.com/.../memory-pack.json",
  "signature": "a3f5d8c2...",
  "public_key": "9e4b7a1f...",
  "expires_at": "2025-01-21T14:30:00Z"
}
Step 2: Inspect Pack
bashcat memory-pack.json | jq .
Structure:
json{
  "@context": "https://contextcache.org/schema/v1",
  "@type": "MemoryPack",
  "version": "1.0",
  "facts": [ ... ],
  "entities": [ ... ],
  "metadata": {
    "fact_count": 523,
    "created_by": "user@example.com"
  },
  "signature": "base64-signature",
  "public_key": "base64-pubkey"
}
Step 3: Share Pack
Methods:

Email attachment
Cloud storage (Dropbox, Google Drive)
Git repository (if public research)
Direct file transfer

Security note: Pack is signed but not encrypted. Anyone can read it.

Verify an Imported Pack
Goal: Verify signature and integrity before importing.
Step 1: Verify Signature (CLI)
bash# Extract public key
cat memory-pack.json | jq -r '.public_key' | base64 -d > pack.pub

# Extract signature
cat memory-pack.json | jq -r '.signature' | base64 -d > pack.sig

# Extract content (without signature fields)
cat memory-pack.json | jq 'del(.signature, .public_key)' > pack-content.json

# Verify with Ed25519
# Requires: pip install pynacl
python3 << EOF
from nacl.signing import VerifyKey
import json

with open('pack.pub', 'rb') as f:
    verify_key = VerifyKey(f.read())

with open('pack-content.json', 'r') as f:
    content = json.dumps(json.load(f), sort_keys=True)

with open('pack.sig', 'rb') as f:
    signature = f.read()

try:
    verify_key.verify(content.encode(), signature)
    print("Signature valid")
except:
    print("Signature INVALID")
EOF
Step 2: Import Pack
Frontend:

Navigate to "Export"
Click "Import Pack"
Select memory-pack.json
Review signature status
Click "Confirm Import"

API:
bashcurl -X POST http://localhost:8000/packs/import \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "X-Project-ID: 550e8400-..." \
  -F "pack=@memory-pack.json"
Response:
json{
  "job_id": "job-789",
  "signature_valid": true,
  "facts_to_import": 523,
  "duplicates_found": 12,
  "status": "queued"
}
Step 3: Verify Import
bashcurl http://localhost:8000/jobs/job-789 \
  -H "Authorization: Bearer YOUR_API_KEY"
Response:
json{
  "job_id": "job-789",
  "status": "completed",
  "facts_imported": 511,
  "duplicates_skipped": 12,
  "audit_event_id": "aa0e8400-..."
}

Visualize the Knowledge Graph
Goal: Explore the knowledge graph visually with Cytoscape.
Step 1: Open Graph View
Frontend:

Navigate to "Graph"
Wait for initial render

Step 2: Navigate the Graph
Controls:

Scroll: Zoom in/out
Drag: Pan
Click node: Show details drawer
Double-click node: Focus on node + neighbors

Step 3: Apply Overlays
Rank Heatmap:

Toolbar > "Rank Overlay"
Nodes colored by rank_score (red = high, blue = low)

Time Decay:

Toolbar > "Recency Overlay"
Node size based on creation date (larger = newer)

Communities:

Toolbar > "Detect Communities"
Algorithm: Louvain
Nodes colored by cluster

Step 4: Filter Graph
Filters available:

Min rank score: 0.7
Entity type: person, organization, concept
Date range: Last 30 days
Confidence: > 0.8

Step 5: Export Visualization
Options:

PNG (screenshot)
SVG (vector)
JSON (Cytoscape format for re-import)


Set Up Custom Domain Allowlist
Goal: Restrict document imports to trusted domains.
Step 1: Edit Policy Configuration
File: api/cc_core/config/default.yaml
yamlpolicy_gate:
  domain_allowlist:
    global:
      - arxiv.org
      - wikipedia.org
      - pubmed.ncbi.nlm.nih.gov
    
    per_project:
      "550e8400-e29b-41d4-a716-446655440000":
        - company-internal-wiki.example.com
        - research.example.edu
Step 2: Reload Configuration
bash# Development
docker-compose -f infra/docker-compose.dev.yml restart api

# Production
gcloud run services update contextcache-api \
  --update-env-vars ALLOWED_DOMAINS=arxiv.org,wikipedia.org
Step 3: Test Allowlist
Allowed domain:
bashcurl -X POST http://localhost:8000/documents/ingest \
  -H "X-Project-ID: 550e8400-..." \
  -d '{"source_url": "https://arxiv.org/abs/1706.03762"}'
Response: 202 Accepted
Blocked domain:
bashcurl -X POST http://localhost:8000/documents/ingest \
  -H "X-Project-ID: 550e8400-..." \
  -d '{"source_url": "https://untrusted-site.com/doc"}'
Response:
json{
  "error": "domain_not_allowed",
  "message": "Domain 'untrusted-site.com' not in allowlist",
  "allowed_domains": ["arxiv.org", "wikipedia.org"]
}

Backup and Restore
Goal: Backup project data and restore on another instance.
Step 1: Export Full Backup
bash# Export Memory Pack (facts only)
curl -X POST http://localhost:8000/packs/export \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"project_id": "550e8400-..."}' \
  -o backup-facts.json

# Export Audit Log
curl http://localhost:8000/audit/export?project_id=550e8400-... \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -o backup-audit.json

# Export Project Metadata
curl http://localhost:8000/projects/550e8400-... \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -o backup-metadata.json
Step 2: Secure Backup
bash# Encrypt backup with GPG
tar czf backup.tar.gz backup-*.json
gpg --symmetric --cipher-algo AES256 backup.tar.gz
rm backup.tar.gz backup-*.json

# Store encrypted backup
cp backup.tar.gz.gpg ~/secure-backups/
Step 3: Restore from Backup
bash# Decrypt backup
gpg --decrypt backup.tar.gz.gpg > backup.tar.gz
tar xzf backup.tar.gz

# Create new project (use same name and salt)
curl -X POST http://localhost:8000/projects \
  -H "Content-Type: application/json" \
  -d @backup-metadata.json

# Import facts
curl -X POST http://localhost:8000/packs/import \
  -H "X-Project-ID: NEW_PROJECT_ID" \
  -F "pack=@backup-facts.json"

# Verify audit chain
curl -X POST http://localhost:8000/audit/verify \
  -H "Content-Type: application/json" \
  -d '{"project_id": "NEW_PROJECT_ID"}'

Rotate Project Keys
Goal: Change project passphrase and re-encrypt all data.
Step 1: Export Recovery Kit (Current Key)
Frontend:

Settings > Recovery Kit
Click "Export Kit"
Save securely offline

Step 2: Trigger Key Rotation
API (Planned v0.2):
bashcurl -X POST http://localhost:8000/projects/550e8400-.../rotate-key \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "old_passphrase": "correct horse battery staple",
    "new_passphrase": "mountain river sunset ocean forest meadow"
  }'
Process:

Verify old passphrase
Decrypt all facts with old key
Derive new key from new passphrase
Re-encrypt all facts with new key
Update salt
Log audit event

Step 3: Export New Recovery Kit
Frontend:

Settings > Recovery Kit
Click "Export Kit" (new key)
Save securely offline
Destroy old recovery kit


Monitor Rate Limits
Goal: Track API usage and avoid rate limit errors.
Step 1: Check Current Usage
bashcurl http://localhost:8000/projects/550e8400-.../rate-limits \
  -H "Authorization: Bearer YOUR_API_KEY"
Response:
json{
  "limits": {
    "light_read": {
      "limit": 120,
      "remaining": 87,
      "reset_at": "2025-01-20T14:01:00Z"
    },
    "ingest": {
      "limit": 30,
      "remaining": 23,
      "reset_at": "2025-01-20T14:01:00Z"
    }
  }
}
Step 2: Monitor in Dashboard
Frontend:

Settings > Rate Limits
Real-time usage graphs
Alerts when approaching limits

Step 3: Handle 429 Errors
pythonimport time
import httpx

def query_with_retry(url, headers, data, max_retries=3):
    for attempt in range(max_retries):
        response = httpx.post(url, headers=headers, json=data)
        
        if response.status_code == 429:
            retry_after = int(response.headers.get('Retry-After', 60))
            print(f"Rate limited. Retrying after {retry_after}s")
            time.sleep(retry_after)
            continue
        
        return response
    
    raise Exception("Max retries exceeded")

Deploy to Production
Goal: Deploy ContextCache to Google Cloud Run.
Step 1: Set Up GCP Project
bash# Create project
gcloud projects create contextcache-prod

# Enable APIs
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
Step 2: Configure Secrets
bash# Create secrets
echo -n "postgresql://..." | gcloud secrets create DATABASE_URL --data-file=-
echo -n "redis://..." | gcloud secrets create REDIS_URL --data-file=-
echo -n "your-api-key" | gcloud secrets create API_INTERNAL_KEY --data-file=-
Step 3: Deploy Backend
bash# Tag release
git tag v0.1.0
git push origin v0.1.0

# GitHub Actions will:
# 1. Build Docker image
# 2. Push to GCR
# 3. Deploy to Cloud Run
# 4. Run migrations
Step 4: Deploy Frontend
bash# Configure Cloudflare Pages
# 1. Connect GitHub repo
# 2. Set build command: pnpm build
# 3. Set output directory: .next
# 4. Add environment variables
Step 5: Verify Deployment
bash# Check API health
curl https://api.thecontextcache.com/health

# Check frontend
curl https://thecontextcache.pages.com

Next Steps
For more examples:

See API Reference for all endpoints
See MCP Documentation for server APIs
Join GitHub Discussions