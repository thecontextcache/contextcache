variable "aws_region" {
  description = "Cloud region"
  type        = string
  default     = "us-east-1"
}

variable "db_host" {
  description = "Managed Postgres endpoint"
  type        = string
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "contextcache"
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "contextcache"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "redis_host" {
  description = "Managed Redis endpoint"
  type        = string
}
