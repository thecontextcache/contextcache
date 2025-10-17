# ContextCache Cloud-Native Implementation Checklist
**Date**: 2025-01-17  
**Branch**: `feature/cloud-native-auth`

---

## 📋 Pre-Implementation Setup

### Environment Setup
- [ ] Create Clerk account (https://clerk.com)
- [ ] Create new Clerk application
- [ ] Copy Clerk publishable key → `.env.local` (frontend)
- [ ] Copy Clerk secret key → `.env.local` (backend)
- [ ] Set up Upstash Redis account (https://upstash.com)
- [ ] Copy Redis URL → `.env.local` (backend)
- [ ] Update CORS settings in Clerk dashboard (allow localhost:3000)

### Git Workflow
```bash
git checkout dev
git pull origin dev
git checkout -b feature/cloud-native-auth
```

---

## 🔧 Phase 1: Clerk Integration (Days 1-2)

### Frontend (Next.js)

#### 1.1 Install Dependencies
```bash
cd frontend
pnpm add @clerk/nextjs
```

#### 1.2 Update Environment Variables
```env
# frontend/.env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### 1.3 Modify Files
- [ ] ✅ `frontend/app/layout.tsx` - Already has ClerkProvider, verify it's correct
- [ ] ✅ `frontend/middleware.ts` - Already has clerkMiddleware, verify routes
- [ ] Update `frontend/lib/api.ts` - Add Clerk token to all requests:
  ```typescript
  import { useAuth } from '@clerk/nextjs';
  
  // In each API method:
  const { getToken } = useAuth();
  const token = await getToken();
  headers: { 'Authorization': `Bearer ${token}` }
  ```

#### 1.4 Test Sign In/Out
- [ ] Run `pnpm dev`
- [ ] Open http://localhost:3000
- [ ] Click "Sign In" → Clerk modal appears
- [ ] Sign up with test email
- [ ] Verify UserButton shows in header
- [ ] Click logout → returns to signed out state

---

### Backend (FastAPI)

#### 1.5 Install Dependencies
```bash
cd api
pip install python-jose[cryptography] python-multipart redis hiredis
pip freeze > requirements.txt
```

#### 1.6 Update Environment Variables
```env
# api/.env.local
CLERK_PEM_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\nMII...\n-----END PUBLIC KEY-----
CLERK_ISSUER=https://clerk.your-domain.com
REDIS_URL=redis://localhost:6379
```

**Get Clerk public key**:
1. Go to Clerk Dashboard → API Keys
2. Click "Show JWT public key"
3. Copy PEM format
4. Replace newlines with `\n` for .env

#### 1.7 Create Auth Module
- [ ] Create `api/cc_core/auth/__init__.py`
- [ ] Create `api/cc_core/auth/clerk.py`:
  ```python
  from fastapi import HTTPException, Depends
  from fastapi.security import HTTPBearer
  from jose import jwt
  import os
  
  security = HTTPBearer()
  
  async def get_current_user(credentials = Depends(security)):
      # See CLOUD_NATIVE_AUTH_PLAN.md for full implementation
      pass
  ```

#### 1.8 Test JWT Verification
```python
# Test in Python REPL:
import os
from jose import jwt

token = "eyJ..."  # Copy from browser DevTools
public_key = os.getenv("CLERK_PEM_PUBLIC_KEY")
payload = jwt.decode(token, public_key, algorithms=["RS256"])
print(payload)  # Should show user_id, email, etc.
```

---

## 🗄️ Phase 2: Database Migration (Days 2-3)

### 2.1 Create Users Table
- [ ] Create `api/cc_core/models/user.py`:
  ```python
  from sqlalchemy import Column, String, LargeBinary
  from cc_core.storage.database import Base
  
  class UserDB(Base):
      __tablename__ = "users"
      id = Column(PGUUID, primary_key=True)
      clerk_user_id = Column(String(255), unique=True)
      email = Column(String(255))
      kek_salt = Column(LargeBinary)
      # ...
  ```

### 2.2 Update Projects Table
- [ ] Modify `api/cc_core/models/project.py`:
  ```python
  # Add to ProjectDB:
  user_id = Column(PGUUID, ForeignKey('users.id'))
  encrypted_dek = Column(LargeBinary)
  dek_nonce = Column(LargeBinary)
  ```

### 2.3 Write Migration Script
- [ ] Create `api/migrations/001_add_users_and_multi_tenant.sql`:
  ```sql
  -- Create users table
  CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) NOT NULL,
      kek_salt BYTEA NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
  );
  
  -- Add user_id to projects
  ALTER TABLE projects ADD COLUMN user_id UUID REFERENCES users(id);
  ALTER TABLE projects ADD COLUMN encrypted_dek BYTEA;
  ALTER TABLE projects ADD COLUMN dek_nonce BYTEA;
  ALTER TABLE projects DROP COLUMN salt; -- Old approach
  ```

### 2.4 Run Migration
```bash
# Apply to local DB
psql $DATABASE_URL < api/migrations/001_add_users_and_multi_tenant.sql

# Or use Alembic (recommended):
cd api
alembic revision --autogenerate -m "Add users and multi-tenant"
alembic upgrade head
```

### 2.5 Test Database
```sql
-- Verify schema
\d users
\d projects

-- Insert test user
INSERT INTO users (clerk_user_id, email, kek_salt) 
VALUES ('test_clerk_123', 'test@example.com', '\x0123456789abcdef');
```

---

## 🔐 Phase 3: Session Key Management (Days 3-5)

### 3.1 Implement KeyService
- [ ] Create `api/cc_core/services/key_service.py`
- [ ] Implement methods:
  - [ ] `store_kek(session_id, kek, ttl)`
  - [ ] `get_kek(session_id)`
  - [ ] `store_dek(session_id, project_id, dek, ttl)`
  - [ ] `get_dek(session_id, project_id)`
  - [ ] `clear_session(session_id)`

### 3.2 Add Redis Connection
- [ ] Update `api/main.py` lifespan:
  ```python
  import redis
  
  @asynccontextmanager
  async def lifespan(app):
      app.state.redis = redis.from_url(os.getenv("REDIS_URL"))
      yield
      app.state.redis.close()
  ```

### 3.3 Create Auth Endpoints
- [ ] Add to `api/main.py`:
  - [ ] `POST /auth/unlock` - Derive KEK, store in Redis
  - [ ] `GET /auth/status` - Check if session unlocked
  - [ ] `POST /auth/logout` - Clear session keys

### 3.4 Test Endpoints
```bash
# 1. Sign in with Clerk, get token
TOKEN="eyJ..."

# 2. Unlock session
curl -X POST http://localhost:8000/auth/unlock \
  -H "Authorization: Bearer $TOKEN" \
  -F "master_passphrase=my very secure passphrase here"

# Expected: {"status": "unlocked", "session_id": "..."}

# 3. Check status
curl http://localhost:8000/auth/status \
  -H "Authorization: Bearer $TOKEN"

# Expected: {"unlocked": true}
```

---

## 🎨 Phase 4: Frontend Session Management (Days 5-6)

### 4.1 Create Unlock Modal
- [ ] Create `frontend/components/unlock-session-modal.tsx`
- [ ] Features:
  - [ ] Password input (type="password")
  - [ ] Show/hide password toggle
  - [ ] Loading state
  - [ ] Error handling (wrong passphrase)
  - [ ] "Don't have a passphrase?" help text

### 4.2 Create Session Guard Hook
- [ ] Create `frontend/hooks/useSessionGuard.ts`
- [ ] Check unlock status on mount
- [ ] Return `{ unlocked, loading }`

### 4.3 Update Protected Layout
- [ ] Modify `frontend/app/(protected)/layout.tsx`
- [ ] Show UnlockSessionModal if not unlocked
- [ ] Add loading spinner while checking status

### 4.4 Update API Client
- [ ] Modify `frontend/lib/api.ts`:
  ```typescript
  import { useAuth } from '@clerk/nextjs';
  
  class APIClient {
    async request(endpoint, options) {
      const { getToken } = useAuth();
      const token = await getToken();
      
      return fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      });
    }
  }
  ```

### 4.5 Test Full Flow
- [ ] Sign in with Clerk
- [ ] Unlock modal appears
- [ ] Enter passphrase → modal closes
- [ ] Create project (should work)
- [ ] Logout
- [ ] Sign in again → unlock modal appears
- [ ] Wrong passphrase → error message
- [ ] Correct passphrase → access granted

---

## 🔒 Phase 5: Project Encryption (Days 6-8)

### 5.1 Update Create Project Endpoint
- [ ] Modify `POST /projects`:
  ```python
  @app.post("/projects")
  async def create_project(
      name: str,
      current_user: dict = Depends(get_current_user),
      db = Depends(get_db)
  ):
      # 1. Get KEK from Redis
      key_service = KeyService()
      kek = await key_service.get_kek(current_user["session_id"])
      if not kek:
          raise HTTPException(401, "Session locked")
      
      # 2. Generate random DEK
      dek = os.urandom(32)
      
      # 3. Encrypt DEK with KEK
      encryptor = Encryptor()
      encrypted_dek, nonce = encryptor.encrypt(dek, kek)
      
      # 4. Store encrypted_dek in DB
      project = ProjectDB(
          user_id=user.id,
          name=name,
          encrypted_dek=encrypted_dek,
          dek_nonce=nonce,
      )
      # ...
  ```

### 5.2 Update List Projects Endpoint
- [ ] Add user isolation:
  ```python
  @app.get("/projects")
  async def list_projects(
      current_user = Depends(get_current_user),
      db = Depends(get_db)
  ):
      result = await db.execute(
          select(ProjectDB)
          .join(UserDB)
          .where(UserDB.clerk_user_id == current_user["clerk_user_id"])
      )
      # ...
  ```

### 5.3 Update Get Project Endpoint
- [ ] Add DEK decryption:
  ```python
  @app.get("/projects/{project_id}")
  async def get_project(
      project_id: str,
      current_user = Depends(get_current_user),
      db = Depends(get_db)
  ):
      # 1. Verify user owns project
      # 2. Get KEK from Redis
      # 3. Decrypt DEK
      # 4. Cache DEK in Redis (5 min)
      # 5. Return project
  ```

### 5.4 Test Project CRUD
```bash
# Create project
curl -X POST http://localhost:8000/projects \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=My Research"

# List projects (should only see your own)
curl http://localhost:8000/projects \
  -H "Authorization: Bearer $TOKEN"

# Get project
curl http://localhost:8000/projects/{id} \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📄 Phase 6: Document Encryption (Days 8-10)

### 6.1 Update Ingest Endpoint
- [ ] Modify `POST /documents/ingest`:
  ```python
  async def ingest_document(...):
      # 1. Get DEK (from cache or decrypt with KEK)
      dek = await key_service.get_dek(session_id, project_id)
      if not dek:
          kek = await key_service.get_kek(session_id)
          dek = encryptor.decrypt(project.encrypted_dek, kek)
          await key_service.store_dek(session_id, project_id, dek)
      
      # 2. Encrypt document content
      encrypted_content, nonce = encryptor.encrypt(text, dek)
      
      # 3. Store encrypted content
      document.encrypted_content = encrypted_content
      document.nonce = nonce
      # ...
  ```

### 6.2 Update Query Endpoint
- [ ] Modify `POST /query`:
  ```python
  async def query_documents(...):
      # 1. Get DEK
      dek = await get_dek_for_project(session_id, project_id)
      
      # 2. Query vector DB (embeddings unencrypted)
      chunks = await vector_search(query, limit=50)
      
      # 3. Decrypt chunk text
      results = []
      for chunk in chunks:
          decrypted_text = encryptor.decrypt(chunk.encrypted_text, dek)
          results.append({
              "text": decrypted_text,
              "similarity": chunk.similarity,
          })
      
      return results
  ```

### 6.3 Optimize Batch Decryption
- [ ] Add batch decryption method:
  ```python
  def decrypt_batch(encrypted_chunks: List[Tuple], dek: bytes):
      """Decrypt multiple chunks in parallel"""
      return [
          encryptor.decrypt(ciphertext, nonce, dek)
          for ciphertext, nonce in encrypted_chunks
      ]
  ```

---

## 🧪 Phase 7: Testing & Validation (Days 10-12)

### 7.1 Unit Tests
- [ ] `tests/unit/test_key_service.py`
  - [ ] Test KEK storage/retrieval
  - [ ] Test KEK expiry (TTL)
  - [ ] Test session clearing
- [ ] `tests/unit/test_encryption.py`
  - [ ] Test DEK encryption with KEK
  - [ ] Test document encryption with DEK
  - [ ] Test batch decryption

### 7.2 Integration Tests
- [ ] `tests/integration/test_auth_flow.py`
  - [ ] Sign in → unlock → create project → logout → locked
  - [ ] Wrong passphrase → error
  - [ ] Session expiry → auto-lock
- [ ] `tests/integration/test_multi_tenant.py`
  - [ ] User A cannot see User B's projects
  - [ ] User A cannot query User B's documents

### 7.3 Performance Tests
```python
# tests/performance/test_latency.py
import pytest
import time

@pytest.mark.asyncio
async def test_query_latency():
    """Query with decryption should be <500ms P95"""
    latencies = []
    for _ in range(100):
        start = time.time()
        await client.post("/query", ...)
        latencies.append(time.time() - start)
    
    p95 = sorted(latencies)[95]
    assert p95 < 0.5, f"P95 latency {p95}s exceeds 500ms"
```

### 7.4 Security Tests
- [ ] Test: Cannot access projects without JWT
- [ ] Test: Cannot decrypt without correct KEK
- [ ] Test: Session keys cleared on logout
- [ ] Test: Keys expire after TTL
- [ ] Run: `bandit -r api/cc_core` (security linter)

---

## 🚀 Phase 8: Deployment (Days 12-14)

### 8.1 Update Cloud Run Config
```yaml
# infra/cloudrun/api-service.yaml
env:
  - name: CLERK_PEM_PUBLIC_KEY
    valueFrom:
      secretKeyRef:
        name: clerk-public-key
  - name: REDIS_URL
    valueFrom:
      secretKeyRef:
        name: upstash-redis-url
```

### 8.2 Add Secrets
```bash
# GCP Secret Manager
gcloud secrets create clerk-public-key --data-file=clerk_public_key.pem
gcloud secrets create upstash-redis-url --data-file=-
# Paste: rediss://default:xxx@xxx.upstash.io:6379

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding clerk-public-key \
  --member=serviceAccount:xxx@xxx.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

### 8.3 Deploy
```bash
cd infra/cloudrun
./QUICK_DEPLOY.sh

# Test production
curl https://api.contextcache.com/health
curl https://api.contextcache.com/auth/status \
  -H "Authorization: Bearer $PROD_TOKEN"
```

### 8.4 Update Frontend
```env
# frontend/.env.production
NEXT_PUBLIC_API_URL=https://api.contextcache.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
```

### 8.5 Deploy Frontend
```bash
cd frontend
pnpm build
# Deploy to Cloudflare Pages or Vercel
```

---

## ✅ Final Checklist

### Functionality
- [ ] User can sign in with Clerk
- [ ] User can unlock session with passphrase
- [ ] User can create encrypted projects
- [ ] User can ingest encrypted documents
- [ ] User can query and see decrypted results
- [ ] User logout clears all session keys
- [ ] Multi-tenant isolation works (users can't see each other's data)

### Performance
- [ ] P50 query latency <300ms
- [ ] P95 query latency <800ms
- [ ] KEK derivation <500ms
- [ ] Project creation <500ms

### Security
- [ ] All data encrypted at rest ✅
- [ ] KEK never stored in plaintext ✅
- [ ] Session keys cleared on logout ✅
- [ ] JWT verification works ✅
- [ ] User isolation enforced ✅
- [ ] Bandit security scan passes ✅

### Documentation
- [ ] README updated with new auth flow
- [ ] API docs updated (add /auth endpoints)
- [ ] Environment variables documented
- [ ] Deployment guide updated

---

## 🐛 Common Issues & Solutions

### Issue: "Invalid JWT signature"
**Solution**: 
1. Verify CLERK_PEM_PUBLIC_KEY has correct newlines (`\n`)
2. Check CLERK_ISSUER matches your Clerk domain
3. Ensure JWT is from correct Clerk environment (dev vs prod)

### Issue: "Session locked" when creating project
**Solution**:
1. Check Redis connection: `redis-cli ping`
2. Verify KEK stored: `redis-cli GET "kek:{session_id}"`
3. Check session ID matches between frontend and backend

### Issue: "Could not decrypt data"
**Solution**:
1. Verify DEK encryption/decryption uses same nonce
2. Check KEK is correct (try re-unlocking)
3. Ensure AES-GCM tag verification passes

### Issue: Slow queries (>1s)
**Solution**:
1. Profile with cProfile: `python -m cProfile -o output.prof main.py`
2. Check if decryption is bottleneck
3. Enable DEK caching (should reduce to 1 decrypt per project per 5 min)
4. Consider batch decryption for multiple chunks

---

## 📊 Progress Tracking

| Phase | Status | Completed | Notes |
|-------|--------|-----------|-------|
| 1. Clerk Integration | ⏳ Not Started | _ / 8 tasks | |
| 2. Database Migration | ⏳ Not Started | _ / 5 tasks | |
| 3. Session Key Management | ⏳ Not Started | _ / 4 tasks | |
| 4. Frontend Session | ⏳ Not Started | _ / 5 tasks | |
| 5. Project Encryption | ⏳ Not Started | _ / 4 tasks | |
| 6. Document Encryption | ⏳ Not Started | _ / 3 tasks | |
| 7. Testing | ⏳ Not Started | _ / 4 tasks | |
| 8. Deployment | ⏳ Not Started | _ / 5 tasks | |

**Total Progress**: 0% (0 / 38 tasks)

---

## 🎯 Next Steps

1. **Review both planning docs**:
   - [ ] `CLOUD_NATIVE_AUTH_PLAN.md` (detailed architecture)
   - [ ] `ARCHITECTURE_DECISIONS.md` (decision rationale)
   - [ ] This checklist (step-by-step implementation)

2. **Set up development environment**:
   - [ ] Create Clerk account
   - [ ] Set up Upstash Redis
   - [ ] Copy API keys to `.env.local`

3. **Start Phase 1**:
   - [ ] Create feature branch
   - [ ] Install Clerk dependencies
   - [ ] Test sign in/out flow

**Ready to start?** Let me know when you want to begin Phase 1! 🚀

