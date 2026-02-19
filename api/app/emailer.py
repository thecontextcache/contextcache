from __future__ import annotations

import os

SES_FROM_EMAIL = os.getenv("SES_FROM_EMAIL", "support@thecontextcache.com")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
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

        client_kwargs = {"region_name": AWS_REGION}
        if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
            client_kwargs["aws_access_key_id"] = AWS_ACCESS_KEY_ID
            client_kwargs["aws_secret_access_key"] = AWS_SECRET_ACCESS_KEY
        client = boto3.client("ses", **client_kwargs)
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
