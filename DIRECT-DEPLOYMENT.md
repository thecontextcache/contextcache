# Direct Deployment Instructions

## ⚠️ Cloudflare Pages Auto-Deploy Won't Work

**Issue**: OpenNext generates a Worker bundle, but Cloudflare Pages expects static files or Pages Functions. Pages auto-deploy rejects our wrangler.toml because it's configured for Workers, not Pages.

**Log shows:**
```
Found wrangler.toml file. Reading build configuration...
A wrangler.toml file was found but it does not appear to be valid.
Skipping file and continuing.
```

Result: Only static assets deployed, Worker ignored.

---

## ✅ Solution: Direct Wrangler Deployment

### Prerequisites

1. Install Wrangler globally:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```
   This will open a browser for authentication.

---

### Method 1: Automated Script

From repository root:

```bash
chmod +x deploy-direct.sh
./deploy-direct.sh
```

This will:
- Build the application
- Deploy directly to Cloudflare Workers
- Bypass Cloudflare Pages entirely

---

### Method 2: Manual Steps

```bash
# 1. Navigate to frontend
cd frontend

# 2. Install dependencies
pnpm install

# 3. Build
pnpm run build:cloudflare

# 4. Go back to root (where wrangler.toml is)
cd ..

# 5. Deploy
wrangler deploy
```

---

### Method 3: Using npm Scripts (if added)

Add to root `package.json`:
```json
{
  "scripts": {
    "deploy": "cd frontend && pnpm install && pnpm run build:cloudflare && cd .. && wrangler deploy"
  }
}
```

Then run:
```bash
npm run deploy
```

---

## 📋 What Gets Deployed

When you run `wrangler deploy`, it will:

1. ✅ Read `wrangler.toml` from root
2. ✅ Deploy `frontend/.open-next/worker.js` to Cloudflare Workers
3. ✅ Upload `frontend/.open-next/assets/` as static assets
4. ✅ Configure Workers runtime with nodejs_compat
5. ✅ Route all requests through the Worker

---

## 🔧 After Deployment

### Add Environment Variables

In Cloudflare Dashboard → Workers & Pages → Your Worker → Settings → Variables:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = pk_live_...
CLERK_SECRET_KEY = sk_live_...
NEXT_PUBLIC_API_URL = https://api.contextcache.com
NEXT_PUBLIC_APP_ENV = production
```

Then redeploy:
```bash
wrangler deploy
```

---

## ✅ Verification

After deployment:

```bash
curl -I https://thecontextcache.com/
# Should return: HTTP/2 200

curl -I https://thecontextcache.com/logo.png
# Should return: HTTP/2 200

curl -I https://thecontextcache.com/dashboard
# Should return: HTTP/2 200 or redirect
```

---

## 🆚 Cloudflare Pages vs Workers

| Feature | Cloudflare Pages | Cloudflare Workers |
|---------|------------------|-------------------|
| Deployment | Git integration | wrangler CLI |
| Configuration | pages_build_output_dir | main + assets |
| Runtime | Pages Functions | Full Worker runtime |
| OpenNext Support | ❌ Incompatible | ✅ Compatible |

**For OpenNext Cloudflare, you MUST use Workers deployment, not Pages auto-deploy.**

---

## 🔄 CI/CD Alternative

If you want automatic deployments from Git, use GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Build
        run: |
          cd frontend
          pnpm install
          pnpm run build:cloudflare

      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
```

---

## 📞 Need Help?

If deployment fails:
1. Check wrangler is authenticated: `wrangler whoami`
2. Verify build completed: `ls frontend/.open-next/worker.js`
3. Check wrangler.toml syntax: `wrangler validate`
4. View logs: `wrangler tail`

---

## 🎯 Summary

**Don't use Cloudflare Pages auto-deploy** - it's incompatible with OpenNext Workers.

**Use `wrangler deploy` directly** - this is the correct way to deploy OpenNext Cloudflare apps.
