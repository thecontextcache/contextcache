"""initial schema

Revision ID: 20260212_0001
Revises:
Create Date: 2026-02-12 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260212_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    op.create_table(
        "memberships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("org_id", "user_id", name="uq_memberships_org_user"),
        sa.CheckConstraint("role IN ('owner','admin','member','viewer')", name="chk_memberships_role"),
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
    )

    op.create_table(
        "memories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("search_tsv", postgresql.TSVECTOR(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "api_keys",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("prefix", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("key_hash", name="uq_api_keys_key_hash"),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("api_key_prefix", sa.String(length=16), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
    )

    op.create_index("idx_memberships_org_id", "memberships", ["org_id"])
    op.create_index("idx_memberships_user_id", "memberships", ["user_id"])
    op.create_index("idx_projects_org_id", "projects", ["org_id"])
    op.create_index("idx_projects_created_by_user_id", "projects", ["created_by_user_id"])
    op.create_index("idx_memories_project_id", "memories", ["project_id"])
    op.create_index("idx_memories_search_tsv", "memories", ["search_tsv"], postgresql_using="gin")
    op.create_index("idx_api_keys_org_id", "api_keys", ["org_id"])
    op.create_index("idx_api_keys_key_hash", "api_keys", ["key_hash"])
    op.create_index("idx_audit_logs_org_id", "audit_logs", ["org_id"])
    op.create_index("idx_audit_logs_api_key_prefix", "audit_logs", ["api_key_prefix"])

    op.execute(
        """
        CREATE OR REPLACE FUNCTION memories_search_tsv_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_tsv :=
                setweight(to_tsvector('english', coalesce(NEW.type, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(NEW.content, '')), 'A');
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_memories_search_tsv_update
        BEFORE INSERT OR UPDATE OF type, content
        ON memories
        FOR EACH ROW
        EXECUTE FUNCTION memories_search_tsv_update()
        """
    )
    op.execute(
        """
        UPDATE memories
        SET search_tsv =
            setweight(to_tsvector('english', coalesce(type, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(content, '')), 'A')
        WHERE search_tsv IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_memories_search_tsv_update ON memories")
    op.execute("DROP FUNCTION IF EXISTS memories_search_tsv_update()")

    op.drop_index("idx_audit_logs_api_key_prefix", table_name="audit_logs")
    op.drop_index("idx_audit_logs_org_id", table_name="audit_logs")
    op.drop_index("idx_api_keys_key_hash", table_name="api_keys")
    op.drop_index("idx_api_keys_org_id", table_name="api_keys")
    op.drop_index("idx_memories_search_tsv", table_name="memories")
    op.drop_index("idx_memories_project_id", table_name="memories")
    op.drop_index("idx_projects_created_by_user_id", table_name="projects")
    op.drop_index("idx_projects_org_id", table_name="projects")
    op.drop_index("idx_memberships_user_id", table_name="memberships")
    op.drop_index("idx_memberships_org_id", table_name="memberships")

    op.drop_table("audit_logs")
    op.drop_table("api_keys")
    op.drop_table("memories")
    op.drop_table("projects")
    op.drop_table("memberships")
    op.drop_table("users")
    op.drop_table("organizations")
