---
title: Runbooks
description: "Operational procedures for maintenance and incidents"
---

# Runbooks

Operational procedures for maintaining ContextCache in production.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Backup Procedures](#backup-procedures)
3. [Restore Procedures](#restore-procedures)
4. [Key Rotation](#key-rotation)
5. [Database Maintenance](#database-maintenance)
6. [Incident Response](#incident-response)
7. [Performance Tuning](#performance-tuning)
8. [Security Audits](#security-audits)
9. [Scaling Operations](#scaling-operations)
10. [Troubleshooting](#troubleshooting)

---

## Daily Operations

### Morning Checklist

**Check Service Health:**
```bash
# API health
curl https://api.thecontextcache.com/health

# Database connection
gcloud sql instances describe contextcache-db --project=PROJECT_ID

# Redis status
redis-cli -h REDIS_HOST ping
Review Metrics:
bash# Cloud Run metrics
gcloud run services describe contextcache-api \
  --region=us-central1 \
  --format='value(status.traffic)'

# Check error rate
gcloud logging read "severity>=ERROR" \
  --limit=50 \
  --format=json
Verify Backups:
bash# List recent backups
gsutil ls gs://contextcache-backups/ | tail -n 7

# Verify latest backup integrity
gsutil cat gs://thecontextcache-backups/latest.tar.gz.sha256 | sha256sum -c
Weekly Tasks
Security Scans:

Review Aikido dashboard for new vulnerabilities
Check Dependabot PRs
Review audit logs for anomalies

Performance Review:

Analyze slow query logs
Review rate limit violations
Check worker job queue depth

Dependency Updates:

Review Renovate PRs
Test updates in staging
Merge and deploy approved updates