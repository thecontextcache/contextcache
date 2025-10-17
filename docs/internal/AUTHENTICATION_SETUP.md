# Authentication Setup Guide

This document explains how to set up Clerk authentication for ContextCache.

---

## Overview

ContextCache uses a three-layer encryption architecture:
1. **Master Passphrase** → KEK (Key Encryption Key)
2. **KEK** → DEK (Data Encryption Key per project)
3. **DEK** → Encrypted document content

Authentication is handled by [Clerk](https://clerk.com) with session-based key management in Redis.

---

## Prerequisites

You'll need accounts with:
- **Clerk** - Authentication provider (free tier: 10k MAU)
- **Upstash Redis** - Session storage (free tier: 10k req/day)
- **Neon PostgreSQL** - Database (free tier: 512MB compute)

---

## Setup Steps

### 1. Create Clerk Application

1. Go to [https://clerk.com/dashboard](https://clerk.com/dashboard)
2. Create a new application
3. Choose authentication methods (email + password recommended)
4. Copy your API keys from the dashboard

### 2. Configure Environment Variables

#### Frontend (`frontend/.env.local`):
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### Backend (`api/.env.local`):
```env
DATABASE_URL=postgresql://user:pass@host/db
REDIS_URL=redis://default:pass@host:6379
CLERK_SECRET_KEY=sk_test_xxx
CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_ISSUER=https://your-app.clerk.accounts.dev
CORS_ORIGINS=http://localhost:3000
ENVIRONMENT=development
```

**Important**: Extract the issuer domain from your Clerk dashboard or publishable key.

### 3. Set Up Upstash Redis

1. Go to [https://console.upstash.com](https://console.upstash.com)
2. Create a new Redis database
3. Copy the connection string (format: `rediss://default:xxx@host:6379`)
4. Add to `api/.env.local` as `REDIS_URL`

### 4. Run Database Migration

```bash
cd api
psql $DATABASE_URL < migrations/001_add_multi_tenant_auth.sql
```

This creates:
- `users` table (clerk_user_id, email, kek_salt)
- Updates `projects` table (user_id, encrypted_dek, dek_nonce)
- Updates `documents` table (user_id)
- Necessary indexes

### 5. Start the Application

```bash
# Terminal 1: Backend
cd api
pip install -r requirements.txt
uvicorn main:app --reload

# Terminal 2: Frontend
cd frontend
pnpm install
pnpm dev
```

### 6. Test Authentication

1. Open http://localhost:3000
2. Click "Sign In" → Complete Clerk authentication
3. Enter master passphrase (min 20 characters) in unlock modal
4. Session is now unlocked for 1 hour

---

## Architecture

### Authentication Flow

```
User → Clerk Sign-In → JWT Token
     → Enter Passphrase → Derive KEK (Argon2id)
     → KEK stored in Redis (1 hour TTL)
     → Create Project → Generate DEK
     → Encrypt DEK with KEK → Store in DB
     → Ingest Document → Encrypt with DEK
     → Query Data → Decrypt with DEK
```

### Key Management

- **KEK (Key Encryption Key)**:
  - Derived from user's master passphrase
  - Stored in Redis, encrypted with Clerk session secret
  - TTL: 1 hour (renewable on activity)
  - Cleared on logout

- **DEK (Data Encryption Key)**:
  - Generated per project (random 32 bytes)
  - Encrypted with KEK, stored in database
  - Cached in Redis (5 min TTL) after decryption
  - Used to encrypt all project data

### Security Features

- ✅ Zero-knowledge: Server never sees master passphrase or KEK
- ✅ Multi-tenant: Each user has isolated data
- ✅ Session-bound: Keys expire automatically
- ✅ Encrypted at rest: All data encrypted before storage
- ✅ JWT verification: All API calls authenticated

---

## API Endpoints

### Authentication

- `POST /auth/unlock` - Unlock session with master passphrase
- `GET /auth/status` - Check if session is unlocked
- `POST /auth/logout` - Clear all session keys

### Projects

- `POST /projects` - Create encrypted project
- `GET /projects` - List user's projects
- `GET /projects/{id}` - Get project details

### Documents

- `POST /documents/ingest` - Ingest and encrypt document
- `POST /query` - Query and decrypt results

---

## Testing

### Backend Authentication Test

```bash
# Get JWT from browser cookies (__session cookie)
JWT="your_jwt_token_here"

# Check status
curl http://localhost:8000/auth/status \
  -H "Authorization: Bearer $JWT"

# Unlock session
curl -X POST http://localhost:8000/auth/unlock \
  -H "Authorization: Bearer $JWT" \
  -F "master_passphrase=your test passphrase min 20 chars"

# Verify unlocked
curl http://localhost:8000/auth/status \
  -H "Authorization: Bearer $JWT"
```

---

## Troubleshooting

### "Invalid JWT" error
- Check `CLERK_ISSUER` matches your Clerk dashboard
- Verify JWT is from correct environment (test vs production)
- Ensure `CLERK_SECRET_KEY` matches the publishable key

### "Redis connection failed"
- Verify `REDIS_URL` is correct connection string
- Check Upstash database is active
- Test with: `redis-cli -u $REDIS_URL ping`

### "Table 'users' does not exist"
- Run migration: `psql $DATABASE_URL < migrations/001_add_multi_tenant_auth.sql`
- Verify with: `psql $DATABASE_URL -c "\dt"`

### Session expires immediately
- Check Redis TTL settings
- Verify system clock is correct
- Check Redis memory limits (Upstash free tier)

---

## Production Deployment

### Environment Variables

Set these in your deployment platform:

```env
# Clerk (production keys)
CLERK_SECRET_KEY=sk_live_xxx
CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_ISSUER=https://your-app.clerk.accounts.com

# Database (production connection)
DATABASE_URL=postgresql://...

# Redis (production instance)
REDIS_URL=rediss://...

# CORS (production frontend URL)
CORS_ORIGINS=https://your-app.com

# Environment
ENVIRONMENT=production
```

### Security Checklist

- [ ] Use production Clerk keys (not test keys)
- [ ] Enable SSL/TLS for database connections
- [ ] Use secure Redis connection (rediss://)
- [ ] Set strong CORS policy
- [ ] Enable rate limiting
- [ ] Configure Sentry for error monitoring
- [ ] Review and update session TTL
- [ ] Set up backup for database
- [ ] Document recovery procedures

---

## Cost Estimates

Free tier limits:
- Clerk: 10,000 MAU (Monthly Active Users)
- Upstash Redis: 10,000 requests/day
- Neon PostgreSQL: 512MB compute, 0.5GB storage

Estimated costs at scale:
- 1,000 users: ~$60/month
- 10,000 users: ~$150/month
- 100,000 users: ~$500/month

---

## References

- [Clerk Documentation](https://clerk.com/docs)
- [Upstash Redis Documentation](https://docs.upstash.com)
- [Neon PostgreSQL Documentation](https://neon.tech/docs)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [Next.js Authentication](https://nextjs.org/docs/authentication)

---

## Support

For issues or questions:
1. Check this document's troubleshooting section
2. Review Clerk documentation for auth issues
3. Check application logs for error details
4. Verify environment variables are set correctly

---

**Last Updated**: 2025-01-17  
**Version**: 1.0.0

