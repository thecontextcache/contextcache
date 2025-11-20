# Dashboard "Not Found" Error - Troubleshooting Guide

## Issue
When visiting `/dashboard`, you see:
```
⚠️
Connection Error
Not Found
Try Again
```

## Root Causes & Solutions

### 1. **Database Not Set Up Yet** (Most Likely)
If you haven't run the database migrations in Neon, the `users` table doesn't exist, causing a 404 error.

**Solution**: Follow the step-by-step guide in `NEON_SETUP_INSTRUCTIONS.md`

Quick check: Log in to Neon SQL Editor and run:
```sql
SELECT COUNT(*) FROM users;
```

If you get an error "relation users does not exist", follow the migration steps.

---

### 2. **Backend API Not Running**
The frontend expects the backend at: `https://contextcache-api-ktdjdc66ca-ue.a.run.app`

**Check if it's running:**
```bash
curl https://contextcache-api-ktdjdc66ca-ue.a.run.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "2.0.0"
}
```

If you get an error, the backend is down. Redeploy it:
```bash
cd /Users/nd/Documents/contextcache
./infra/cloudrun/deploy-api.sh
```

---

### 3. **CORS Issues**
If the backend is blocking the frontend's requests.

**Check backend logs** in Google Cloud Run console for CORS errors.

**Fix**: Update `api/main.py` CORS settings:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://thecontextcache.com",
        "https://contextcache.pages.dev",
        "https://*.contextcache.pages.dev",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### 4. **Clerk Authentication Issue**
The JWT token might not be getting passed to the backend.

**Check browser console** (F12 → Network tab):
- Look for `/auth/status` or `/projects` requests
- Check if `Authorization: Bearer <token>` header is present
- Check the response status code

**Common issues:**
- Clerk publishable key mismatch
- JWT verification failing on backend
- Session expired

---

### 5. **First-Time User Flow**
When a user signs in for the first time:
1. They need to create a master passphrase at `/auth/unlock`
2. The backend creates a `users` record
3. Then they can access `/dashboard`

**What should happen:**
- Dashboard should automatically redirect to `/auth/unlock` if session is locked
- User enters master passphrase
- User is redirected back to dashboard

**Fix**: I've updated the dashboard to handle 404 errors by redirecting to `/auth/unlock`.

---

## Quick Diagnostic Steps

1. **Check if you're signed in with Clerk:**
   - Look at top-right corner - do you see "Sign In" or your user info?
   - If "Sign In" → Click it and sign in
   
2. **Check browser console for errors:**
   - Press F12
   - Go to Console tab
   - Look for red errors
   - Share them with me

3. **Check Network tab:**
   - Press F12
   - Go to Network tab
   - Try loading dashboard
   - Look for failed requests (red)
   - Click on them to see error details

4. **Check backend health:**
   ```bash
   curl https://contextcache-api-ktdjdc66ca-ue.a.run.app/health
   ```

5. **Clear browser cache & cookies:**
   - Sometimes Clerk tokens get stale
   - Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)

---

## Recommended Action Plan

**For you right now:**

1. **First, set up Neon database:**
   - Follow `NEON_SETUP_INSTRUCTIONS.md`
   - Run migrations step-by-step
   - This is likely the issue

2. **Then, test the flow:**
   - Go to https://thecontextcache.com
   - Sign in with Clerk
   - You should be redirected to `/auth/unlock`
   - Enter a master passphrase (make it strong, you'll need it every session)
   - You should now see the dashboard

3. **If still broken:**
   - Check browser console (F12)
   - Check Network tab for failed requests
   - Check backend health endpoint
   - Share error details with me

---

## Updated Code

I've made the following fixes to help debug:

1. **Dashboard now redirects to `/auth/unlock` on 404**
   - If the backend returns 404 (user not found), dashboard redirects to unlock page
   - This handles first-time users better

2. **Better error messages**
   - More descriptive errors instead of just "Not Found"
   - Shows connection errors clearly

3. **Neon setup instructions**
   - Step-by-step guide to avoid query truncation issues
   - Explains what each migration does

---

## Next Steps

After you've set up the Neon database:
1. Visit https://thecontextcache.com
2. Sign in
3. If redirected to `/auth/unlock`, enter a master passphrase
4. You should now see the dashboard
5. Create your first project!

Let me know if you're still seeing errors after setting up the database.

