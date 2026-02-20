terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  database_url_asyncpg = "postgresql+asyncpg://${var.db_username}:${var.db_password}@${var.db_host}:5432/${var.db_name}"
  redis_url            = "redis://${var.redis_host}:6379/0"
}

# Reference-only skeleton:
# Replace db_host/redis_host with real outputs from your managed services
# (RDS, Aurora, Elasticache, MemoryDB, etc.) in your infra workspace.

output "database_url_asyncpg" {
  description = "Use as DATABASE_URL in ContextCache API."
  value       = local.database_url_asyncpg
  sensitive   = true
}

output "redis_url" {
  description = "Use as REDIS_URL (and CELERY_BROKER_URL)."
  value       = local.redis_url
}
