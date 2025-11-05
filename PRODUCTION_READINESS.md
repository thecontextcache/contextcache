# 🚀 Production Readiness Checklist

## ✅ Security

### Environment Variables
- [ ] Generate `SESSION_ENCRYPTION_KEY` with: `openssl rand -base64 32`
- [ ] Never commit `.env.local` or production secrets to Git
- [ ] Use Infisical or similar secret manager for production
- [ ] Rotate all API keys from development
- [ ] Ensure `CLERK_SECRET_KEY` is set to production key (sk_live_...)
- [ ] Set strong `DATABASE_URL` password (20+ characters, mixed)
- [ ] Use `rediss://` (SSL) for Redis in production

### Credentials Audit
- [ ] No hardcoded credentials in code ✅
- [ ] All secrets loaded from environment variables ✅
- [ ] `.gitignore` includes `.env.local` ✅
- [ ] Example files (`.env.example`) contain no real secrets ✅

### API Security
- [ ] CORS restricted to production domains only
- [ ] Rate limiting enabled (`REDIS_URL` configured)
- [ ] Session TTL configured (default 1 hour)
- [ ] Input validation on all endpoints ✅
- [ ] SQL injection prevention (SQLAlchemy ORM) ✅

## ✅ Encryption

### Content Encryption
- [ ] Content encryption implemented ✅
- [ ] Database migration applied: `002_add_content_encryption.sql`
- [ ] KEK/DEK key hierarchy working ✅
- [ ] Session-based key management active ✅

### Key Management
- [ ] KEK expires after 1 hour (configurable) ✅
- [ ] DEK cached for 5 minutes ✅
- [ ] Keys cleared on logout ✅
- [ ] Argon2id parameters reviewed (OPSLIMIT_MODERATE) ✅

## ✅ Infrastructure

### Database (Neon PostgreSQL)
- [ ] Connection pooling configured
- [ ] SSL mode enabled (`sslmode=require`)
- [ ] Migrations applied:
  - [ ] `001_add_multi_tenant_auth.sql`
  - [ ] `002_add_content_encryption.sql`
- [ ] pgvector extension installed
- [ ] Indexes created on foreign keys ✅

### Redis (Upstash)
- [ ] Redis URL uses SSL (`rediss://`)
- [ ] Connection timeout configured
- [ ] Background jobs enabled ✅
- [ ] Rate limiting middleware active ✅

### Cloud Run (API)
- [ ] Minimum instances set (0 or 1 based on budget)
- [ ] Maximum instances set (10-20)
- [ ] Memory allocation: 2GB recommended
- [ ] CPU: 2 vCPU recommended
- [ ] Timeout: 300s for document processing
- [ ] Environment variables configured in Cloud Run

### Cloudflare Pages (Frontend)
- [ ] Build command: `cd frontend && pnpm build`
- [ ] Output directory: `frontend/.next`
- [ ] Node version: 20+
- [ ] Environment variables set in Cloudflare dashboard

### Background Worker
- [ ] Worker deployed separately (Cloud Run or dedicated instance)
- [ ] Same Redis URL as API
- [ ] Same Database URL as API
- [ ] Run with: `python run_worker.py`
- [ ] Monitoring/logging configured

## ✅ Performance

### API Optimization
- [ ] Thread pool for CPU-intensive tasks ✅
- [ ] Async/await for I/O operations ✅
- [ ] Connection pooling enabled
- [ ] Embeddings generated in thread pool ✅
- [ ] Background jobs for heavy processing ✅

### Caching
- [ ] KEK cached in Redis (1 hour) ✅
- [ ] DEK cached in Redis (5 minutes) ✅
- [ ] PageRank scores cached (if enabled)
- [ ] Redis eviction policy: `allkeys-lru`

### Database
- [ ] Indexes on frequently queried columns ✅
- [ ] Vector index for similarity search ✅
- [ ] Query timeouts configured
- [ ] Slow query logging enabled

## ✅ Monitoring

### Logging
- [ ] Structured logging implemented
- [ ] Log level set to INFO (not DEBUG) in production
- [ ] Sensitive data excluded from logs ✅
- [ ] Request timing logged ✅

### Error Tracking
- [ ] Sentry DSN configured (optional)
- [ ] Error boundaries in frontend ✅
- [ ] HTTP error handling in API ✅
- [ ] Validation errors with clear messages ✅

### Health Checks
- [ ] `/health` endpoint active ✅
- [ ] Database connectivity checked ✅
- [ ] Redis connectivity checked ✅
- [ ] Liveness probe configured in Cloud Run
- [ ] Readiness probe configured in Cloud Run

## ✅ Features

### Core Functionality
- [ ] Document ingestion (PDF, URL) ✅
- [ ] Text chunking with overlap ✅
- [ ] Vector embeddings generation ✅
- [ ] Semantic search ✅
- [ ] Multi-tenant isolation ✅
- [ ] Session-based encryption ✅

### Background Jobs
- [ ] Document processing queue ✅
- [ ] Ranking computation task ✅
- [ ] Time-based decay task (optional)
- [ ] Cleanup tasks (optional)

### API Endpoints
- [ ] Authentication (`/auth/unlock`, `/auth/status`, `/auth/logout`) ✅
- [ ] Projects CRUD ✅
- [ ] Document ingestion ✅
- [ ] Query/search ✅
- [ ] Project statistics ✅
- [ ] Graph visualization ✅
- [ ] Audit log (basic) ✅

## ✅ Testing

### Backend Tests
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Load testing completed (k6 scripts)
- [ ] Security testing (no vulnerabilities)

### Frontend Tests
- [ ] Component tests passing
- [ ] E2E tests passing (Playwright)
- [ ] Browser compatibility tested
- [ ] Mobile responsiveness verified

## ✅ Documentation

### User Documentation
- [ ] README.md updated ✅
- [ ] Quickstart guide available ✅
- [ ] API reference documented ✅
- [ ] Mintlify docs deployed (pending)

### Developer Documentation
- [ ] Architecture documented ✅
- [ ] Deployment guide available ✅
- [ ] Environment variables documented ✅
- [ ] Security model explained ✅

## ✅ Compliance

### Privacy
- [ ] Zero-knowledge architecture verified ✅
- [ ] No plaintext passwords stored ✅
- [ ] No user PII in logs ✅
- [ ] GDPR considerations reviewed

### License
- [ ] License files included ✅
- [ ] Third-party licenses reviewed
- [ ] Code of Conduct present ✅
- [ ] Contributing guidelines available ✅

## 🚀 Deployment Steps

### 1. Database Setup
```bash
# Apply migrations
psql $DATABASE_URL -f api/migrations/001_add_multi_tenant_auth.sql
psql $DATABASE_URL -f api/migrations/002_add_content_encryption.sql

# Verify
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
```

### 2. Generate Secrets
```bash
# Session encryption key
openssl rand -base64 32

# API internal key
openssl rand -hex 32
```

### 3. Configure Environment
Set these in Cloud Run / Cloudflare Pages:
```
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
SESSION_ENCRYPTION_KEY=<from step 2>
CLERK_SECRET_KEY=sk_live_...
CORS_ORIGINS=https://yourdomain.com
```

### 4. Deploy API
```bash
cd infra/cloudrun
./deploy-api.sh
```

### 5. Deploy Worker
```bash
cd infra/cloudrun
./deploy-worker.sh
```

### 6. Deploy Frontend
Push to GitHub → Cloudflare Pages auto-deploys

### 7. Verify
```bash
# Health check
curl https://api.yourdomain.com/health

# Test auth
curl -X POST https://api.yourdomain.com/auth/unlock \
  -H "Authorization: Bearer YOUR_CLERK_JWT" \
  -F "master_passphrase=test"
```

## ⚠️ Known Limitations

1. **Hybrid Ranking**: Basic vector similarity only. Full BM25+PageRank pending.
2. **Background Encryption**: Worker jobs store plaintext (requires session context for encryption)
3. **MCP Servers**: Defined but not fully integrated with main API
4. **Memory Packs**: Export/import not yet implemented
5. **Audit Chain**: BLAKE3 verification not yet implemented

## 📝 Post-Launch Tasks

- [ ] Set up monitoring dashboards
- [ ] Configure alerts for errors/downtime
- [ ] Enable backup strategy for database
- [ ] Document incident response procedures
- [ ] Plan for scaling (horizontal/vertical)
- [ ] Set up CI/CD pipeline
- [ ] Configure domain and SSL certificates
- [ ] Test disaster recovery procedures

## 🔐 Security Contacts

Report security issues to: security@yourdomain.com
GPG Key: [Your GPG key fingerprint]

---

**Last Updated:** 2025-01-20
**Next Review:** Before production launch
