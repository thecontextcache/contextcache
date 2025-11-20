# ContextCache Deployment Information

**Last Updated**: November 20, 2024  
**Version**: 0.1.0  
**Status**: ✅ Deployed to Production

---

## 🌐 Live URLs

### Frontend (Cloudflare Workers)
- **Production**: https://contextcache-frontend.doddanikhil.workers.dev
- **Version ID**: 2df80006-9c26-4729-8ad8-682eb2491e32
- **Deployment Date**: November 20, 2024
- **Build Time**: 8.2s
- **Worker Startup**: 23ms

### Backend (Google Cloud Run)
- **API**: https://contextcache-api-572546880171.us-east1.run.app
- **Health Check**: https://contextcache-api-572546880171.us-east1.run.app/health
- **Region**: us-east1

---

## 🚀 Deployment Methods

### 1. Manual Deployment (Wrangler)

```bash
# From project root
./deploy-frontend.sh

# Or manually
cd frontend
pnpm install
pnpm run build:cloudflare
pnpm run deploy:cloudflare
```

### 2. Automated Deployment (GitHub Actions)

**Triggers**:
- Push to `main` branch
- Manual workflow dispatch

**Workflows**:
- `.github/workflows/deploy-frontend-wrangler.yml` - Cloudflare Workers
- `.github/workflows/deploy-frontend-pages.yml` - Cloudflare Pages (alternative)
- `.github/workflows/deploy_api.yml` - Backend API

**Manual Trigger**:
1. Go to: https://github.com/thecontextcache/contextcache/actions
2. Select workflow
3. Click "Run workflow"

---

## 🔧 Environment Variables

### Required Variables (Cloudflare Dashboard)

Set these in: **Workers & Pages → contextcache-frontend → Settings → Variables**

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = pk_test_...
CLERK_SECRET_KEY = sk_test_...

# API Configuration
NEXT_PUBLIC_API_URL = https://contextcache-api-572546880171.us-east1.run.app

# Feature Flags
NEXT_PUBLIC_APP_ENV = production
NEXT_PUBLIC_ENABLE_ANALYTICS = false
NEXT_PUBLIC_ENABLE_EXPORT = true
NEXT_PUBLIC_ENABLE_GRAPH_VIEW = true
```

### Backend Environment Variables (Cloud Run)

```bash
# Database
DATABASE_URL = postgresql://...

# Redis
REDIS_URL = redis://...

# Clerk
CLERK_SECRET_KEY = sk_test_...

# CORS
CORS_ORIGINS = https://contextcache-frontend.doddanikhil.workers.dev

# Sentry (optional)
SENTRY_DSN = https://...
```

---

## 📦 Build Information

### Frontend
- **Framework**: Next.js 15.5.4
- **Build Tool**: OpenNext Cloudflare 1.11.0
- **Runtime**: Cloudflare Workers
- **Total Size**: 7.68 MB (gzipped: 1.57 MB)
- **Routes**: 10 pages (SSR)

### Backend
- **Framework**: FastAPI
- **Python**: 3.11+
- **Database**: Neon PostgreSQL + pgvector
- **Cache**: Upstash Redis
- **Container**: Google Cloud Run

---

## 🎨 New Features in Latest Deployment

### UI/UX Improvements
- ✅ ChatGPT-like conversation interface
- ✅ AI provider selector (HuggingFace, Ollama, OpenAI, Anthropic)
- ✅ Real-time typing indicators
- ✅ Source citations with relevance scores
- ✅ Conversation history
- ✅ Dark mode support
- ✅ Keyboard shortcuts (Enter to send, Shift+Enter for newline)

### License Update
- ✅ Changed to proprietary license
- ✅ No longer open source
- ✅ Development phase - internal use only

### Architecture
- ✅ Redis caching (KEK/DEK, rate limiting)
- ✅ Rate limiting: 300/min, 5000/hour
- ✅ Multi-provider embeddings
- ✅ End-to-end encryption
- ✅ Multi-tenant isolation

---

## 🧪 Testing the Deployment

### 1. Health Check
```bash
curl https://contextcache-api-572546880171.us-east1.run.app/health
```

### 2. Frontend Access
Visit: https://contextcache-frontend.doddanikhil.workers.dev

### 3. Test New Features
1. Go to `/ask` page
2. Select AI provider from dropdown
3. Ask a question
4. Verify conversation interface works
5. Check source citations appear

### 4. Test Authentication
1. Sign in with Clerk
2. Create a project
3. Upload a document
4. Query the document

---

## 📊 Monitoring & Logs

### Frontend (Cloudflare)
- **Dashboard**: https://dash.cloudflare.com
- **Workers**: Workers & Pages → contextcache-frontend
- **Logs**: Real-time logs in dashboard
- **Analytics**: Built-in Cloudflare analytics

### Backend (Google Cloud)
- **Dashboard**: https://console.cloud.google.com
- **Cloud Run**: Cloud Run → contextcache-api
- **Logs**: Cloud Logging
- **Metrics**: Cloud Monitoring

### Error Tracking
- **Sentry**: (if configured)
- **GitHub Issues**: Auto-created on deployment failures

---

## 🔄 Rollback Procedure

### Frontend (Cloudflare)
1. Go to Cloudflare dashboard
2. Workers & Pages → contextcache-frontend → Deployments
3. Find previous version
4. Click "Rollback"

### Backend (Cloud Run)
1. Go to Cloud Run console
2. Select contextcache-api
3. Revisions tab
4. Select previous revision
5. Click "Manage Traffic"
6. Route 100% to previous revision

---

## 📝 Deployment Checklist

Before deploying:
- [ ] All tests passing
- [ ] Linter checks passed
- [ ] Environment variables configured
- [ ] Database migrations applied (if any)
- [ ] API health check returns 200
- [ ] Frontend builds without errors
- [ ] Clerk authentication configured
- [ ] CORS origins updated

After deploying:
- [ ] Health check passes
- [ ] Frontend loads correctly
- [ ] Authentication works
- [ ] API calls succeed
- [ ] New features work as expected
- [ ] No console errors
- [ ] Mobile responsive
- [ ] Dark mode works

---

## 🆘 Troubleshooting

### Frontend won't load
1. Check Cloudflare Workers logs
2. Verify environment variables are set
3. Check CORS configuration
4. Verify API URL is correct

### API errors
1. Check Cloud Run logs
2. Verify database connection
3. Check Redis connection
4. Verify Clerk credentials

### Authentication issues
1. Verify Clerk keys are correct
2. Check CORS origins include frontend URL
3. Verify JWT token is being sent
4. Check Clerk dashboard for errors

### Build failures
1. Check Node.js version (>=20)
2. Clear `.next` cache
3. Delete `node_modules` and reinstall
4. Check for TypeScript errors
5. Verify all dependencies installed

---

## 📞 Support

- **Email**: thecontextcache@gmail.com
- **GitHub**: https://github.com/thecontextcache/contextcache
- **Issues**: https://github.com/thecontextcache/contextcache/issues

---

## 🔐 Security Notes

- All user data encrypted end-to-end
- Zero-knowledge architecture
- KEK stored in Redis (session-bound)
- DEK encrypted with KEK
- Rate limiting active
- CORS properly configured
- Proprietary license - no public distribution

---

**Deployment Status**: ✅ Production Ready  
**Next Deployment**: Automated on push to main

