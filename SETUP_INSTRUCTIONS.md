# ContextCache Setup Instructions
**Cloud-Native with Clerk Authentication**

---

## 🚀 Quick Start

### 1. Set Up Clerk (Authentication)

1. Go to [https://clerk.com](https://clerk.com) and create a free account
2. Create a new application in the Clerk Dashboard
3. Copy your API keys:
   - **Publishable Key**: `pk_test_xxx...`
   - **Secret Key**: `sk_test_xxx...`

### 2. Set Up Upstash Redis (Session Storage)

1. Go to [https://upstash.com](https://upstash.com) and create a free account
2. Create a new Redis database (choose any region)
3. Copy the **REST URL**: `rediss://default:xxx@xxx.upstash.io:6379`

**Cost**: ✅ Free tier (10k requests/day)

### 3. Set Up Neon PostgreSQL (Database)

1. Go to [https://neon.tech](https://neon.tech) and create a free account
2. Create a new project
3. Copy the **Connection String**: `postgresql://username:password@host/dbname`

**Cost**: ✅ Free tier (512MB compute, 0.5GB storage)

---

## 📝 Environment Variables

### Frontend (Next.js)

Create `frontend/.env.local`:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend (FastAPI)

Create `api/.env.local`:

```env
# Database
DATABASE_URL=postgresql://username:password@host/dbname

# Redis (Upstash)
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379

# Clerk Authentication
CLERK_SECRET_KEY=sk_test_xxx
CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_ISSUER=https://your-app.clerk.accounts.dev

# CORS
CORS_ORIGINS=http://localhost:3000

# Environment
ENVIRONMENT=development
```

**To get CLERK_ISSUER**:
- Go to Clerk Dashboard → API Keys
- Look for "Issuer" (usually `https://your-app.clerk.accounts.dev`)
- Or use `https://clerk.accounts.dev` for test keys

---

## 🗄️ Database Setup

### 1. Run Migration

```bash
cd api

# Install dependencies
pip install -r requirements.txt

# Run migration SQL
psql $DATABASE_URL < migrations/001_add_multi_tenant_auth.sql
```

### 2. Verify Tables

```sql
-- Connect to your database
psql $DATABASE_URL

-- Check tables exist
\dt

-- Should see:
-- users, projects, documents, chunks, audit_events, etc.

-- Verify users table structure
\d users
```

---

## 🏃 Running the Application

### Start Backend

```bash
cd api

# Activate virtual environment (if using)
source venv/bin/activate

# Install dependencies (if not already done)
pip install -r requirements.txt

# Start server
uvicorn main:app --reload --port 8000

# You should see:
# ✅ Clerk authentication configured
# ✅ Database connected
# ✅ Redis connected (if configured)
```

### Start Frontend

```bash
cd frontend

# Install dependencies (if not already done)
pnpm install

# Start development server
pnpm dev

# Open http://localhost:3000
```

---

## 🧪 Testing the Integration

### 1. Sign In with Clerk

1. Open http://localhost:3000
2. Click "Sign In" (or "Sign Up" if new user)
3. Complete Clerk's sign-in flow
4. You should see the UserButton in the header

### 2. Unlock Session

1. After signing in, you'll see an "Unlock Session" modal
2. Enter a master passphrase (minimum 20 characters)
   - Example: `my super secure master passphrase for contextcache`
3. Click "Unlock Session"
4. If successful, modal closes and you can access the app

### 3. Verify Backend

```bash
# Get JWT token from browser DevTools:
# 1. Open DevTools → Application → Cookies
# 2. Find __session cookie
# 3. Copy the value (this is your JWT)

# Test authentication
curl http://localhost:8000/auth/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected response:
# {"unlocked": false, "message": "Session locked..."}

# Unlock session
curl -X POST http://localhost:8000/auth/unlock \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "master_passphrase=my super secure master passphrase for contextcache"

# Expected response:
# {"status": "unlocked", "user_id": "xxx", "session_id": "xxx", "expires_in": 3600}

# Check status again
curl http://localhost:8000/auth/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected response:
# {"unlocked": true, "session_id": "xxx"}
```

---

## 🔍 Troubleshooting

### Issue: "Invalid JWT"

**Cause**: Clerk configuration mismatch

**Fix**:
1. Verify `CLERK_ISSUER` in `api/.env.local` matches your Clerk Dashboard
2. Check JWT in browser DevTools is from the correct Clerk environment
3. Ensure `CLERK_SECRET_KEY` matches the publishable key environment (test vs live)

### Issue: "Redis connection failed"

**Cause**: REDIS_URL not set or incorrect

**Fix**:
1. Check `REDIS_URL` in `api/.env.local`
2. Test connection: `redis-cli -u $REDIS_URL ping`
3. If using Upstash, ensure you copied the **REST URL** (not CLI URL)

### Issue: "Database error"

**Cause**: Migration not run or connection issue

**Fix**:
1. Verify `DATABASE_URL` is correct
2. Run migration: `psql $DATABASE_URL < migrations/001_add_multi_tenant_auth.sql`
3. Check tables exist: `psql $DATABASE_URL -c "\dt"`

### Issue: "Session locked" after unlocking

**Cause**: KEK expired (1 hour TTL) or Redis cleared

**Fix**:
1. Normal behavior after 1 hour - re-enter passphrase
2. Check Redis health: `redis-cli -u $REDIS_URL ping`
3. Verify session ID in backend logs

---

## 📊 Cost Summary (Free Tiers)

| Service | Free Tier Limits | Cost |
|---------|------------------|------|
| **Clerk** | 10,000 MAU (Monthly Active Users) | $0 |
| **Upstash Redis** | 10,000 requests/day | $0 |
| **Neon PostgreSQL** | 512MB compute, 0.5GB storage | $0 |
| **Cloudflare Pages** (frontend) | Unlimited requests | $0 |
| **TOTAL** | Good for MVP testing | **$0/month** ✅ |

**When you'll need to pay**:
- Clerk: >10,000 active users ($25/month)
- Upstash: >10k requests/day (~$10/month)
- Neon: Need more storage/compute (~$25/month)

**Estimated cost at 1000 users**: ~$60/month

---

## 🎯 Next Steps

Now that authentication is working, you can:

1. **Create projects** (will be encrypted with your KEK)
2. **Ingest documents** (Phase 6 - coming next)
3. **Query data** (will be decrypted automatically)
4. **Share access** (multi-tenant isolation works!)

**What's working now**:
- ✅ Clerk sign-in/sign-up
- ✅ JWT verification
- ✅ Session unlock (KEK derivation)
- ✅ Redis session storage
- ✅ Multi-tenant database schema
- ✅ User isolation

**What's coming next** (Phases 5-6):
- ⏳ Project encryption (DEK generation)
- ⏳ Document encryption
- ⏳ Encrypted query results

---

## 🆘 Need Help?

- **Clerk Issues**: https://clerk.com/docs
- **Upstash Issues**: https://docs.upstash.com
- **Neon Issues**: https://neon.tech/docs
- **ContextCache Docs**: See `CLOUD_NATIVE_AUTH_PLAN.md`

**Common Questions**:

**Q: Can I use different services?**  
A: Yes! You can use Auth0 instead of Clerk, any Redis provider instead of Upstash, or any PostgreSQL instead of Neon. Just update the environment variables.

**Q: How do I deploy to production?**  
A: See `DEPLOYMENT.md` (coming soon) or follow the Cloud Run deployment guide in `infra/cloudrun/`.

**Q: What if I forget my passphrase?**  
A: Currently, there's no recovery (true zero-knowledge). BIP39 recovery phrase support is coming in Phase 7.

---

**Status**: ✅ Phases 1-3 Complete (Clerk + Auth + Session Management)  
**Next**: Phase 4 (Frontend Integration) → Phase 5 (Project Encryption)

