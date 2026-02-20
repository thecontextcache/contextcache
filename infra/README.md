# Infrastructure Baseline

This folder contains lightweight, production-ready scaffolding for infrastructure work.

## Current scope

- `terraform/`: minimal Terraform sample for a managed Postgres + Redis topology.
- `cloudflare/`: tunnel config reference for subdomain routing.

These files are intentionally small and safe defaults for expansion.

## How to use

1. Copy the Terraform sample into a private infra repo/workspace.
2. Replace placeholder values (VPC/subnet IDs, instance sizes, secrets).
3. Keep runtime app secrets in your deployment secret manager, not in Terraform state.
4. Use the Cloudflare example to align tunnel hostnames with `docs/06-deployment.md`.

## Non-goals in this repo

- No direct `terraform apply` from this application repository.
- No production credentials or account IDs checked into source control.
