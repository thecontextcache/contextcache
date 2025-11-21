# 🚀 DEPLOY NOW - FINAL CHECKLIST

## ✅ EVERYTHING IS READY!

### **What's Completed:**
1. ✅ Branding (thecontextcache™)
2. ✅ Simplified AI models
3. ✅ Multi-doc upload
4. ✅ Delete projects
5. ✅ Pricing page
6. ✅ LLM integration (Smart/GPT/Claude/Databricks/Ollama)
7. ✅ **Usage tracking (tamper-proof)**
8. ✅ **Usage limits enforcement**
9. ✅ **Admin role & controls**

---

## 📋 STEP 1: RUN SQL IN NEON (5 minutes)

Copy and paste **USAGE_TRACKING_MIGRATION.sql** into Neon Console:

### **Quick Summary:**
```sql
-- 1. Add admin role
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE NOT NULL;

-- 2. Create usage_logs (tamper-proof)
-- 3. Create user_quotas (limits per tier)
-- 4. Create indexes and triggers
-- 5. Set YOUR email as admin
-- 6. Create default quotas for existing users
```

### **IMPORTANT: Set Yourself as Admin**
After running the migration, run this (replace with YOUR email):
```sql
UPDATE users SET is_admin = TRUE WHERE email = 'dn@thecontextcache.com';
```

---

## 🚀 STEP 2: DEPLOY BACKEND (10 minutes)

```bash
cd /Users/nd/Documents/contextcache
./deploy-backend-now.sh
```

**What it does:**
- Builds Docker image with Cloud Build
- Deploys to Google Cloud Run
- Sets environment variables
- Starts the API

**Wait for:**
```
✅ Backend API deployed successfully!
🌐 API URL: https://contextcache-api-[...].run.app
```

---

## 🧪 STEP 3: TEST EVERYTHING (10 minutes)

### **Test 1: Basic Flow**
1. Visit: https://thecontextcache.com
2. Sign in with Clerk
3. Unlock with master key (first time: download it!)
4. Create a project
5. Upload 1-2 documents
6. Go to "Ask" page
7. Ask: "What is this document about?"
8. **Should see**: Real answer (not "sorry")

### **Test 2: Usage Tracking**
Open browser console and check:
```bash
# Get your usage
curl -H "Authorization: Bearer YOUR_JWT" \
  https://contextcache-api-[...].run.app/usage/me
```

**Should return:**
```json
{
  "email": "your@email.com",
  "usage": {
    "tier": "free",
    "documents": { "used": 2, "limit": 100, "percentage": 2.0 },
    "facts": { "used": 150, "limit": 10000, "percentage": 1.5 },
    "queries": { "used": 1, "limit": 1000, "percentage": 0.1 }
  }
}
```

### **Test 3: Admin Panel**
```bash
# View all users (admin only)
curl -H "Authorization: Bearer ADMIN_JWT" \
  https://contextcache-api-[...].run.app/admin/usage/all
```

### **Test 4: Delete Project**
1. Go to Dashboard
2. Click 3-dot menu on any project
3. Click "Delete Project"
4. Confirm
5. **Should**: Project disappears

### **Test 5: Pricing Page**
Visit: https://thecontextcache.com/pricing
**Should see**: Free/Pro/Enterprise plans

---

## 🔒 STEP 4: USAGE ENFORCEMENT (IMPORTANT!)

**Right now: DISABLED (Dev Mode)**

To **ENABLE** usage limits in production:

### **Option A: Environment Variable (Cloud Run)**
```bash
gcloud run services update contextcache-api \
  --region us-east1 \
  --update-env-vars "USAGE_ENFORCEMENT=enabled"
```

### **Option B: Keep Disabled**
Leave it as-is. Usage is tracked but not enforced.

**When enabled:**
- Free users: 100 docs → Returns 402 Payment Required
- Pro/Enterprise: Unlimited

---

## 👨‍💼 ADMIN CONTROLS

### **As Admin, you can:**

**1. View All Users**
```
GET /admin/usage/all
```

**2. Lock a User**
```
POST /admin/users/{user_id}/lock
Body: reason="Violated TOS"
```

**3. Unlock a User**
```
POST /admin/users/{user_id}/unlock
```

### **Admin Dashboard UI (Future)**
Create a React admin panel at `/admin` with:
- User list with usage stats
- Lock/unlock buttons
- Usage graphs
- Revenue tracking

---

## 🎯 WHAT USERS SEE

### **Free Plan (Current)**
- 100 documents
- 10,000 facts
- 1,000 queries/month
- No API access
- thecontextcache Smart AI only

**When limit reached:**
```
⚠️ Usage limit exceeded: Document limit reached (100). 
Please upgrade your plan.
```

### **Pro Plan ($29/mo) - Coming Soon**
- Unlimited everything
- Custom AI models
- Databricks integration
- API access

---

## 🔐 TAMPERING PREVENTION

### **How it works:**
1. Every usage log gets a SHA256 hash
2. Each record includes previous record's hash (blockchain-style)
3. Tampering detection:
   - Verify each record's hash
   - Verify chain integrity

### **Check integrity:**
```python
usage_service = UsageService()
is_valid, message = await usage_service.verify_usage_integrity(db, user_id)
# Returns: (True, "All records verified") or (False, "Chain broken...")
```

---

## 📊 DATABASE TABLES

### **usage_logs**
```
id, user_id, action_type, quantity, 
record_hash, previous_hash, created_at
```

### **user_quotas**
```
user_id, tier, 
documents_used, documents_limit,
facts_used, facts_limit,
queries_used, queries_limit,
locked, lock_reason
```

---

## 🐛 TROUBLESHOOTING

### **Issue: "User quota not found"**
**Fix:** User needs to perform one action to create quota:
```python
# Happens automatically on first action
await usage_service.get_or_create_quota(db, user_id)
```

### **Issue: "Admin access required"**
**Fix:** Set user as admin:
```sql
UPDATE users SET is_admin = TRUE WHERE email = 'your@email.com';
```

### **Issue: Usage not incrementing**
**Check:** `USAGE_ENFORCEMENT` is set to `disabled` (logs but doesn't block)

---

## 🎉 YOU'RE LIVE!

After deployment:
1. ✅ Usage is tracked (tamper-proof)
2. ✅ Limits are ready (but disabled in dev)
3. ✅ You are admin
4. ✅ Users can see their usage (`/usage/me`)
5. ✅ You can lock/unlock users
6. ✅ Payment plans are defined

**Next Steps:**
1. Test everything
2. Enable usage enforcement when ready
3. Integrate Stripe for paid plans
4. Build admin dashboard UI
5. Go live! 🚀

---

**All code is on GitHub (dev branch).**
**Run `./deploy-backend-now.sh` to deploy!**

