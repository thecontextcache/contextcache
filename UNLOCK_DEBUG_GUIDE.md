# Unlock "Not Found" Error - Debugging Guide

## Current Issue
When you try to unlock your session, you see:
- "Not Found" error in the bottom of the page
- Toast notification: "Unlock failed: Not found"

## What I've Done

### 1. Added Detailed Error Logging
The unlock page now logs comprehensive error details to the browser console, including:
- HTTP status code
- Error message from backend
- API URL being called
- Request method and configuration

### 2. Improved Error Messages
You'll now see specific error messages for:
- **404**: "API endpoint not found. Please check if the backend is running."
- **401**: "Authentication failed. Please sign out and sign in again."
- **400**: "Incorrect master key. Please try again."
- **500**: "Server error. Please try again later."

### 3. Added Theme Toggle
The light/dark mode toggle is now visible in the top-right corner on all pages.

## Next Steps to Diagnose

### Step 1: Check Browser Console (MOST IMPORTANT)

1. Open the unlock page: https://thecontextcache.com/auth/unlock
2. Press **F12** (or Cmd+Option+I on Mac) to open DevTools
3. Go to the **Console** tab
4. Try to unlock again
5. Look for the error logs starting with:
   ```
   Failed to unlock session: ...
   Error details: { status: ..., statusText: ..., data: ... }
   ```

**Share these details with me** - this will tell us exactly what's failing.

### Step 2: Check Network Tab

1. Stay in DevTools (F12)
2. Go to the **Network** tab
3. Try to unlock again
4. Look for a request to `/auth/unlock`
5. Click on it to see:
   - **Status Code**: (200, 404, 500, etc.)
   - **Response**: What the server returned
   - **Headers**: Including Authorization header

**Take a screenshot or share the details**.

### Step 3: Verify Backend is Running

Try visiting these URLs directly in your browser:

**Health Check**:
```
https://contextcache-api-ktdjdc66ca-ue.a.run.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected"
}
```

If you get an error or can't reach it, the backend is down.

**Root endpoint**:
```
https://contextcache-api-ktdjdc66ca-ue.a.run.app/
```

Expected response:
```json
{
  "message": "ContextCache API",
  "version": "2.0.0",
  "status": "running"
}
```

### Step 4: Check Clerk Authentication

The "Not Found" could also mean your Clerk token isn't valid. Try:

1. **Sign out completely** (click your avatar → Sign Out)
2. **Clear browser cache** (Ctrl+Shift+Del or Cmd+Shift+Del)
3. **Sign in again**
4. Try unlocking

## Possible Causes & Solutions

### Cause 1: Backend Not Deployed or Down
**Symptom**: Can't access `https://contextcache-api-ktdjdc66ca-ue.a.run.app/health`

**Solution**:
```bash
cd /Users/nd/Documents/contextcache
./infra/cloudrun/deploy-api.sh
```

### Cause 2: Database Not Set Up
**Symptom**: Backend returns 500 error, or console shows database connection errors

**Solution**: 
1. Log in to Neon console
2. Run this query to check if tables exist:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

If no tables, follow the setup guide that I gave you earlier.

### Cause 3: CORS Issue
**Symptom**: Console shows "CORS policy" error

**Solution**: The backend needs to allow requests from `thecontextcache.com`. Check the backend CORS configuration in `api/main.py`.

### Cause 4: Clerk Token Not Being Sent
**Symptom**: Console shows the request doesn't have an `Authorization` header

**Solution**: 
1. Make sure you're signed in with Clerk
2. Check that `APIProvider` is wrapping the app (it is, I verified)
3. Try signing out and back in

### Cause 5: Wrong API URL
**Symptom**: Request goes to wrong URL (like localhost:8000)

**Solution**: Check that `NEXT_PUBLIC_API_URL` is set correctly in Cloudflare Pages environment variables.

## Quick Checks

**1. Is the theme toggle visible now?**
- Look at top-right corner
- Should see a sun/moon icon next to Sign In button

**2. Can you see better error messages?**
- Try unlocking
- Error should be more specific than just "Not Found"

**3. What does the browser console say?**
- This is the KEY to diagnosing the issue
- Press F12 → Console tab
- Share the error details

## What to Share With Me

To help you fix this, I need:

1. **Browser console logs** (after trying to unlock)
2. **Network tab details** (status code, response for `/auth/unlock` request)
3. **Can you access the backend health endpoint?** (paste the URL in browser)
4. **Screenshot** of the error (optional but helpful)

---

## Temporary Workaround

If the backend is down or misconfigured, you won't be able to unlock. In that case:

1. **Option A**: Redeploy the backend
   ```bash
   cd /Users/nd/Documents/contextcache
   ./infra/cloudrun/deploy-api.sh
   ```

2. **Option B**: Check Google Cloud Run console
   - Go to https://console.cloud.google.com/run
   - Find `contextcache-api` service
   - Check logs for errors
   - Verify it's running and has traffic

---

**Wait 2-3 minutes** for Cloudflare to deploy the new error logging, then try again and share the console logs with me!

