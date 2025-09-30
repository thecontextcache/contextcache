#!/bin/bash
set -e

PROJECT_ID="contextcache-prod"
BACKUP_BUCKET="gs://contextcache-backups"
DATE=$(date +%Y%m%d-%H%M%S)

echo "Starting backup: $DATE"

# Backup Postgres
gcloud sql backups create \
  --instance=contextcache-db \
  --project=$PROJECT_ID

# Export database dump
gcloud sql export sql contextcache-db \
  $BACKUP_BUCKET/db-$DATE.sql.gz \
  --database=contextcache_prod \
  --project=$PROJECT_ID

# Backup Redis (if using persistent storage)
redis-cli --rdb /tmp/redis-$DATE.rdb
gsutil cp /tmp/redis-$DATE.rdb $BACKUP_BUCKET/

# Backup secrets (encrypted)
gcloud secrets versions list DATABASE_URL --limit=1 > /tmp/secrets-$DATE.txt
gpg --encrypt --recipient ops@contextcache.com /tmp/secrets-$DATE.txt
gsutil cp /tmp/secrets-$DATE.txt.gpg $BACKUP_BUCKET/

# Cleanup old backups (keep 30 days)
gsutil ls $BACKUP_BUCKET/ | grep -v $(date +%Y%m -d '30 days ago') | xargs gsutil rm

echo "Backup complete: $DATE"
Schedule (Cloud Scheduler):
bashgcloud scheduler jobs create http daily-backup \
  --schedule="0 2 * * *" \
  --uri="https://api.thecontextcache.com/admin/backup" \
  --http-method=POST \
  --headers="Authorization=Bearer $ADMIN_API_KEY"
Manual Backup
On-demand backup:
bash# Full project export
curl -X POST https://api.thecontextcache.com/admin/backup \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{"type": "full", "project_ids": ["all"]}'

# Single project backup
curl -X POST https://api.thecontextcache.com/packs/export \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"project_id": "550e8400-..."}'

Restore Procedures
Full System Restore
Prerequisites:

Access to backup bucket
GCP project with services enabled
Decryption keys for secrets

Step 1: Restore Database
bash# Create new Cloud SQL instance
gcloud sql instances create contextcache-db-restore \
  --database-version=POSTGRES_16 \
  --tier=db-custom-4-16384 \
  --region=us-central1

# Restore from backup
gcloud sql backups restore BACKUP_ID \
  --backup-instance=contextcache-db \
  --restore-instance=contextcache-db-restore
Step 2: Restore Redis
bash# Copy Redis dump
gsutil cp gs://contextcache-backups/redis-YYYYMMDD.rdb /tmp/

# Restore to Redis instance
redis-cli --rdb /tmp/redis-YYYYMMDD.rdb
redis-cli BGREWRITEAOF
Step 3: Restore Secrets
bash# Decrypt secrets backup
gpg --decrypt secrets-YYYYMMDD.txt.gpg > secrets.txt

# Restore to Secret Manager
while IFS= read -r line; do
  SECRET_NAME=$(echo $line | cut -d: -f1)
  SECRET_VALUE=$(echo $line | cut -d: -f2-)
  echo -n "$SECRET_VALUE" | gcloud secrets create $SECRET_NAME --data-file=-
done < secrets.txt
Step 4: Redeploy Services
bash# Deploy API
gcloud run deploy contextcache-api \
  --image=gcr.io/$PROJECT_ID/contextcache-api:latest \
  --region=us-central1

# Verify health
curl https://api.thecontextcache.com/health
Step 5: Verify Integrity
bash# Check fact counts
curl https://api.thecontextcache.com/admin/stats \
  -H "Authorization: Bearer $ADMIN_API_KEY"

# Verify audit chains
curl -X POST https://api.thecontextcache.com/admin/verify-all-chains \
  -H "Authorization: Bearer $ADMIN_API_KEY"

Key Rotation
API Keys
Rotate Internal API Keys:
bash# Generate new key
NEW_KEY=$(openssl rand -hex 32)

# Update Secret Manager
echo -n "$NEW_KEY" | gcloud secrets versions add API_INTERNAL_KEY --data-file=-

# Update all services
gcloud run services update contextcache-api \
  --update-secrets=API_INTERNAL_KEY=API_INTERNAL_KEY:latest

# Wait for rollout (5 minutes)
sleep 300

# Verify new key works
curl https://api.thecontextcache.com/health \
  -H "Authorization: Bearer $NEW_KEY"

# Revoke old key (delete old secret version)
gcloud secrets versions destroy PREVIOUS_VERSION --secret=API_INTERNAL_KEY
Database Credentials
Rotate Postgres Password:
bash# Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# Update database user
gcloud sql users set-password contextcache \
  --instance=contextcache-db \
  --password="$NEW_PASSWORD"

# Update connection string in Secret Manager
NEW_URL="postgresql://contextcache:$NEW_PASSWORD@HOST:5432/contextcache_prod"
echo -n "$NEW_URL" | gcloud secrets versions add DATABASE_URL --data-file=-

# Restart services to pick up new secret
gcloud run services update contextcache-api \
  --update-secrets=DATABASE_URL=DATABASE_URL:latest
TLS Certificates
Renew certificates (automatic with Cloud Run):
bash# Verify certificate expiry
echo | openssl s_client -servername api.contextcache.dev \
  -connect api.contextcache.dev:443 2>/dev/null | \
  openssl x509 -noout -dates

Database Maintenance
Vacuum and Analyze
Weekly maintenance:
bash# Connect to database
gcloud sql connect contextcache-db --user=contextcache

# Run maintenance
VACUUM ANALYZE;

# Check table bloat
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
Index Maintenance
Identify missing indexes:
sqlSELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.5
ORDER BY n_distinct DESC;
Rebuild indexes:
sqlREINDEX TABLE facts;
REINDEX INDEX CONCURRENTLY idx_project_facts;
Partition Management
Archive old audit events:
sql-- Create archive table
CREATE TABLE audit_events_archive (LIKE audit_events INCLUDING ALL);

-- Move old events (older than 1 year)
INSERT INTO audit_events_archive
SELECT * FROM audit_events
WHERE timestamp < NOW() - INTERVAL '1 year';

-- Delete from main table
DELETE FROM audit_events
WHERE timestamp < NOW() - INTERVAL '1 year';

-- Vacuum to reclaim space
VACUUM FULL audit_events;

Incident Response
Severity Levels
SEV1 (Critical):

Complete service outage
Data loss or corruption
Security breach

SEV2 (High):

Partial service degradation
Performance issues affecting >50% users
Failed backups

SEV3 (Medium):

Minor service degradation
Performance issues affecting <50% users
Non-critical errors

Incident Response Checklist
Step 1: Assess (5 minutes)

Confirm incident severity
Identify affected services
Check recent deployments
Review error logs

Step 2: Communicate (10 minutes)

Post to status page
Notify stakeholders
Create incident channel

Step 3: Mitigate (immediate)
bash# Rollback recent deployment
gcloud run services update-traffic contextcache-api \
  --to-revisions=PREVIOUS_REVISION=100

# Scale up if capacity issue
gcloud run services update contextcache-api \
  --max-instances=20

# Enable circuit breakers
curl -X POST https://api.thecontextcache.com/admin/circuit-breaker \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{"enabled": true}'
Step 4: Investigate
bash# Check logs
gcloud logging read "severity>=ERROR" \
  --limit=100 \
  --format=json \
  --freshness=1h

# Check metrics
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count"'
Step 5: Resolve

Deploy fix
Verify resolution
Monitor for 30 minutes
Close incident

Step 6: Post-Mortem (within 48 hours)

Timeline of events
Root cause analysis
Action items to prevent recurrence


Performance Tuning
Database Query Optimization
Identify slow queries:
sqlSELECT 
    query,
    calls,
    total_time,
    mean_time,
    max_time
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC
LIMIT 20;
Enable query plan logging:
sqlSET log_min_duration_statement = 100;
Redis Optimization
Monitor memory usage:
bashredis-cli INFO memory

# Check key distribution
redis-cli --bigkeys
Optimize eviction policy:
bashredis-cli CONFIG SET maxmemory-policy allkeys-lru
Cloud Run Optimization
Adjust concurrency:
bashgcloud run services update contextcache-api \
  --concurrency=100 \
  --cpu=2 \
  --memory=2Gi
Optimize cold start:
bash# Keep minimum instances warm
gcloud run services update contextcache-api \
  --min-instances=2

Security Audits
Monthly Security Review
Check for exposed secrets:
bash# Scan code for secrets
gcloud secrets list
gcloud logging read "protoPayload.request.password" --limit=100

# Review IAM permissions
gcloud projects get-iam-policy PROJECT_ID
Review access logs:
bash# Check for unusual access patterns
gcloud logging read "protoPayload.authenticationInfo.principalEmail" \
  --limit=1000 \
  --format=json | jq '.[] | .protoPayload.authenticationInfo.principalEmail' | sort | uniq -c
Vulnerability scanning:
bash# Trivy scan
trivy image gcr.io/PROJECT_ID/contextcache-api:latest

# Check for CVEs
gcloud artifacts vulnerabilities list

Scaling Operations
Horizontal Scaling
Increase API instances:
bashgcloud run services update contextcache-api \
  --max-instances=50
Scale worker concurrency:
bash# Update worker config
export WORKER_CONCURRENCY=8
gcloud run services update contextcache-worker \
  --update-env-vars=WORKER_CONCURRENCY=8
Vertical Scaling
Increase database capacity:
bashgcloud sql instances patch contextcache-db \
  --tier=db-custom-8-32768
Scale Redis:
bash# Upstash: Update plan in dashboard
# Self-hosted: Increase memory limit
redis-cli CONFIG SET maxmemory 1gb

Troubleshooting
Common Issues
Issue: High latency on /query endpoint
Diagnosis:
bash# Check database query time
gcloud logging read "jsonPayload.query_time_ms > 1000"

# Check pgvector index
SELECT * FROM pg_indexes WHERE tablename = 'facts';
Solution:
sql-- Rebuild vector index
REINDEX INDEX CONCURRENTLY idx_embedding;
Issue: Worker jobs stuck in queue
Diagnosis:
bash# Check Redis queue depth
redis-cli LLEN arq:queue:default

# Check worker logs
gcloud logging read "resource.labels.service_name=contextcache-worker"
Solution:
bash# Scale up workers
gcloud run services update contextcache-worker --max-instances=10

# Clear stuck jobs (if safe)
redis-cli DEL arq:queue:default
Issue: 429 Rate Limit Errors
Diagnosis:
bash# Check rate limit metrics
redis-cli GET rate_limit:project:550e8400-...
Solution:
bash# Increase rate limits (temporarily)
curl -X POST https://api.thecontextcache.com/admin/rate-limits \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{"project_id": "550e8400-...", "ingest_limit": 60}'

Contact
On-call: thecontextcache@gmail.com
Escalation: GitHub Issues (https://github.com/thecontextcache/contextcache/issues)
Incident Reports: thecontextcache@gmail.com