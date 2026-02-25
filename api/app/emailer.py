from __future__ import annotations

import os
import urllib.request
import urllib.error
import json

# ── Configuration ────────────────────────────────────────────────────────────
APP_ENV = os.getenv("APP_ENV", "dev").strip().lower()
APP_PUBLIC_BASE_URL = os.getenv("APP_PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")

# Allow returning debug_link in non-dev when SES/Resend is broken (temp recovery)
MAGIC_LINK_ALLOW_LOG_FALLBACK = (
    os.getenv("MAGIC_LINK_ALLOW_LOG_FALLBACK", "false").strip().lower() == "true"
)

# ── Resend (primary provider) ─────────────────────────────────────────────────
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "noreply@thecontextcache.com").strip()

# ── AWS SES (fallback provider) ───────────────────────────────────────────────
SES_FROM_EMAIL = os.getenv("SES_FROM_EMAIL", "support@thecontextcache.com")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()


def _send_email_with_fallback(email: str, subject: str, body: str) -> tuple[bool, str]:
    """Send via Resend->SES, then optional debug-log fallback in dev."""
    last_exc: Exception | None = None

    # 1. Try Resend first (if configured)
    if RESEND_API_KEY:
        try:
            _send_via_resend(email, subject, body)
            return True, "sent"
        except Exception as exc:
            last_exc = exc
            print(f"[emailer] Resend failed: {exc} — trying SES fallback")

    # 2. Try AWS SES fallback
    try:
        _send_via_ses(email, subject, body)
        return True, "sent"
    except Exception as exc:
        last_exc = exc

    # 3. Dev / emergency log fallback
    if APP_ENV == "dev" or MAGIC_LINK_ALLOW_LOG_FALLBACK:
        print(f"[email-debug] email={email} subject={subject!r} error={last_exc}")
        print(body)
        return True, "logged"

    return False, "failed"


def _send_via_resend(email: str, subject: str, body: str) -> None:
    """Send via Resend API using stdlib only — no extra SDK dependency."""
    payload = json.dumps({
        "from": RESEND_FROM_EMAIL,
        "to": [email],
        "subject": subject,
        "text": body,
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        if resp.status not in (200, 201):
            raise RuntimeError(f"Resend HTTP {resp.status}")


def _send_via_ses(email: str, subject: str, body: str) -> None:
    """Send via AWS SES using boto3."""
    import boto3  # type: ignore

    client_kwargs: dict = {"region_name": AWS_REGION}
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
        client_kwargs["aws_access_key_id"] = AWS_ACCESS_KEY_ID
        client_kwargs["aws_secret_access_key"] = AWS_SECRET_ACCESS_KEY
    client = boto3.client("ses", **client_kwargs)
    client.send_email(
        Source=SES_FROM_EMAIL,
        Destination={"ToAddresses": [email]},
        Message={
            "Subject": {"Data": subject},
            "Body": {"Text": {"Data": body}},
        },
    )


def send_magic_link(email: str, link: str, template_type: str = "login") -> tuple[bool, str]:
    subject = "Your ContextCache sign-in link"
    body = (
        "Your ContextCache sign-in link\n\n"
        f"{link}\n\n"
        "This link expires in 10 minutes.\n"
        "If you didn't request this, you can ignore this email.\n"
    )

    sent, status = _send_email_with_fallback(email, subject, body)
    if sent and status == "logged":
        print(f"[magic-link-debug] email={email} link={link}")
    return sent, status


def send_invite_email(email: str) -> tuple[bool, str]:
    """Send a lightweight invite email that points users to /auth."""
    auth_url = f"{APP_PUBLIC_BASE_URL}/auth"
    subject = "You have been invited to ContextCache"
    body = (
        "You've been invited to ContextCache alpha.\n\n"
        f"Continue here: {auth_url}\n\n"
        "Enter this email and request your secure sign-in link.\n"
        "If this wasn't expected, you can ignore this email.\n"
    )
    return _send_email_with_fallback(email, subject, body)
