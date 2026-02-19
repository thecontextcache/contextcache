from __future__ import annotations

import os

SES_FROM_EMAIL = os.getenv("SES_FROM_EMAIL", "support@thecontextcache.com")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
APP_ENV = os.getenv("APP_ENV", "dev").strip().lower()


def send_magic_link(email: str, link: str, template_type: str = "login") -> tuple[bool, str]:
    subject = "Your ContextCache sign-in link"
    body = (
        "Your ContextCache sign-in link\n\n"
        f"{link}\n\n"
        "This link expires in 10 minutes.\n"
        "If you didn't request this, you can ignore this email.\n"
    )

    try:
        import boto3  # type: ignore

        client = boto3.client("ses", region_name=AWS_REGION)
        client.send_email(
            Source=SES_FROM_EMAIL,
            Destination={"ToAddresses": [email]},
            Message={
                "Subject": {"Data": subject},
                "Body": {
                    "Text": {"Data": body},
                },
            },
        )
        return True, "sent"
    except Exception as exc:
        if APP_ENV == "dev":
            print(f"[magic-link-debug] email={email} link={link} error={exc}")
            return True, "logged"
        return False, "failed"
