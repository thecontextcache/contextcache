# Git Commit Guide - What to Commit

This guide explains which files should be committed to the repository.

---

## ✅ Files TO COMMIT (Safe - No Credentials)

### Code Changes
- `api/main.py` - Added auth endpoints
- `api/cc_core/auth/` - New auth module
- `api/cc_core/models/user.py` - User model
- `api/cc_core/services/key_service.py` - Key management service
- `api/migrations/001_add_multi_tenant_auth.sql` - Database migration
- `frontend/lib/api.ts` - API client updates
- `frontend/app/layout.tsx` - Added APIProvider
- `frontend/components/api-provider.tsx` - Token injection
- `frontend/components/unlock-session-modal.tsx` - Unlock UI
- `frontend/hooks/useSessionGuard.ts` - Session guard hook
- `frontend/middleware.ts` - Clerk middleware (if not already committed)

### Configuration
- `.gitignore` - Updated to exclude planning docs
- `frontend/package.json` - Dependencies (if changed)
- `frontend/pnpm-lock.yaml` - Lock file (if changed)

### Documentation (Safe - Generic)
- `AUTHENTICATION_SETUP.md` - Generic setup guide (NO credentials)
- `IMPLEMENTATION_CHECKLIST.md` - Task checklist (safe)
- `SETUP_INSTRUCTIONS.md` - Generic instructions (safe)

---

## ❌ Files NOT TO COMMIT (Private/Local)

### Planning Documents (May contain examples with credentials)
- `QUICK_SETUP_GUIDE.md` - Contains your specific Clerk setup
- `START_HERE.md` - Has your credential examples
- `PROGRESS_SUMMARY.md` - Internal progress tracking
- `CLOUD_NATIVE_AUTH_PLAN.md` - Detailed architecture with examples
- `ARCHITECTURE_DECISIONS.md` - Decision rationale
- `ARCHITECTURE_DIAGRAM.md` - Visual diagrams
- `PLANNING_SUMMARY.md` - Planning overview
- `setup_env.sh` - Setup script with credential handling
- `compass_artifact_wf-*.md` - Research artifacts
- `contextcache-cloud-native-algorithms.md` - Algorithm research
- `bandit_report.json` - Security scan results

### Environment Files (NEVER commit these!)
- `frontend/.env.local` - Contains Clerk keys
- `api/.env.local` - Contains all secrets
- `.env` - Any environment files
- `.env.*.local` - All local env files

### Build/Cache Files
- `node_modules/` - Frontend dependencies
- `__pycache__/` - Python cache
- `.next/` - Next.js build
- `dist/`, `build/` - Build outputs

---

## 📋 Recommended Commit Structure

### Commit 1: Database Schema
```bash
git add api/migrations/001_add_multi_tenant_auth.sql
git add api/cc_core/models/user.py
git commit -m "feat: Add multi-tenant database schema with user isolation"
```

### Commit 2: Backend Authentication
```bash
git add api/cc_core/auth/
git add api/cc_core/services/key_service.py
git commit -m "feat: Implement Clerk JWT authentication and session management"
```

### Commit 3: Backend Endpoints
```bash
git add api/main.py
git commit -m "feat: Add authentication endpoints (/auth/unlock, /auth/status, /auth/logout)"
```

### Commit 4: Frontend Authentication
```bash
git add frontend/lib/api.ts
git add frontend/components/api-provider.tsx
git add frontend/app/layout.tsx
git commit -m "feat: Add JWT token injection to API client"
```

### Commit 5: Frontend UI
```bash
git add frontend/components/unlock-session-modal.tsx
git add frontend/hooks/useSessionGuard.ts
git commit -m "feat: Add session unlock UI and session guard hook"
```

### Commit 6: Configuration
```bash
git add .gitignore
git add frontend/package.json
git add frontend/pnpm-lock.yaml
git commit -m "chore: Update gitignore and dependencies"
```

### Commit 7: Documentation
```bash
git add AUTHENTICATION_SETUP.md
git add IMPLEMENTATION_CHECKLIST.md
git add SETUP_INSTRUCTIONS.md
git commit -m "docs: Add authentication setup guide"
```

---

## 🔒 Security Verification

Before pushing, verify NO credentials are committed:

```bash
# Check what's staged
git diff --cached

# Search for potential secrets in staged files
git diff --cached | grep -i -E "(secret|password|key.*=|api_key|token)"

# Verify .env files are not staged
git status | grep ".env"
```

**If you see ANY credentials, do NOT commit!**

---

## 🚀 Safe Push Commands

```bash
# 1. Check current status
git status

# 2. Verify .gitignore is working
git check-ignore START_HERE.md QUICK_SETUP_GUIDE.md setup_env.sh
# Should show all three files (they're ignored)

# 3. Stage safe files only
git add api/
git add frontend/
git add .gitignore
git add AUTHENTICATION_SETUP.md

# 4. Verify what's staged (should see NO .env files)
git status

# 5. Commit
git commit -m "feat: Add Clerk authentication with session management"

# 6. Push to your branch
git push origin dev
```

---

## ⚠️ What If I Accidentally Committed Credentials?

If you accidentally committed credentials:

### Option 1: Amend Last Commit (if not pushed)
```bash
# Remove file from staging
git reset HEAD path/to/file-with-secret

# Amend the commit
git commit --amend
```

### Option 2: Remove from History (if pushed)
```bash
# WARNING: This rewrites history!

# Remove file from git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/file" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (coordinate with team first!)
git push origin --force --all
```

### Option 3: Rotate Credentials (ALWAYS do this)
Even if you remove from git, credentials were exposed:

1. **Clerk**: Generate new API keys in dashboard
2. **Database**: Rotate password in Neon dashboard
3. **Redis**: Rotate credentials in Upstash dashboard
4. Update your local `.env.local` files
5. Update any deployed instances

---

## ✅ Verification Checklist

Before pushing to GitHub:

- [ ] `.gitignore` includes all planning docs
- [ ] No `.env.local` files are staged
- [ ] No credentials visible in `git diff --cached`
- [ ] Planning docs (START_HERE.md, etc.) show as ignored
- [ ] All code changes are staged
- [ ] Documentation is generic (no specific credentials)
- [ ] Commit message is descriptive
- [ ] Verified with `git status` and `git diff --cached`

---

## 📝 Current .gitignore Protection

Your `.gitignore` now protects:

```gitignore
# Environment & Secrets
.env
.env.local
.env.*.local
.env.enc
*.key
*.pem
secrets/

# Planning & Setup Documents (local only)
QUICK_SETUP_GUIDE.md
START_HERE.md
PROGRESS_SUMMARY.md
CLOUD_NATIVE_AUTH_PLAN.md
ARCHITECTURE_DECISIONS.md
ARCHITECTURE_DIAGRAM.md
PLANNING_SUMMARY.md
setup_env.sh
compass_artifact_wf-*.md
contextcache-cloud-native-algorithms.md
bandit_report.json
```

**These files will NEVER be pushed to GitHub.** ✅

---

## 🎯 Summary

**SAFE to commit**:
- All code in `api/` and `frontend/`
- Database migrations
- Generic documentation (AUTHENTICATION_SETUP.md)
- Updated .gitignore

**NEVER commit**:
- `.env.local` files
- Planning docs with credentials
- setup_env.sh
- Any files containing your Clerk keys

**Always verify** before pushing:
```bash
git diff --cached | grep -i "secret\|key.*=\|password"
```

If this shows ANYTHING, DO NOT PUSH! 🚨

---

**Last Updated**: 2025-01-17

