# Terraform Sample (Reference)

This is a reference-only starter for provisioning core ContextCache dependencies:

- PostgreSQL (managed)
- Redis (managed)
- Security groups and subnet placement hooks

It is not wired to a specific cloud account in this repo.

## Suggested flow

1. Copy this folder to your infra workspace.
2. Set provider credentials via your cloud CLI or CI secret store.
3. Fill `terraform.tfvars` with your VPC/subnet inputs.
4. Run:

```bash
terraform init
terraform plan
terraform apply
```

## Outputs

- `database_url_asyncpg`: sample asyncpg DSN format for `DATABASE_URL`.
- `redis_url`: Redis URL for `REDIS_URL`/Celery broker.
