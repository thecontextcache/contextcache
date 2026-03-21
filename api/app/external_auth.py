from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)


class ExternalAuthError(RuntimeError):
    """Base error for bearer-token verification failures."""


class ExternalAuthInvalidToken(ExternalAuthError):
    """Raised when the upstream auth service marks a bearer token as inactive."""


class ExternalAuthMisconfigured(ExternalAuthError):
    """Raised when local external-auth env configuration is invalid."""


class ExternalAuthUnavailable(ExternalAuthError):
    """Raised when the upstream auth service cannot be reached or returns a bad response."""


@dataclass(frozen=True)
class ExternalAuthIdentity:
    email: str
    subject: str | None = None
    display_name: str | None = None
    is_admin: bool = False


@dataclass(frozen=True)
class _ExternalAuthConfig:
    introspection_url: str
    service_token: str | None
    timeout_seconds: float
    audience: str | None
    allow_insecure_http: bool


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() == "true"


def external_auth_enabled() -> bool:
    return _bool_env("EXTERNAL_AUTH_ENABLED", False)


def trust_admin_claims_enabled() -> bool:
    return _bool_env("EXTERNAL_AUTH_TRUST_ADMIN_CLAIMS", False)


def extract_bearer_token(header_value: str | None) -> str | None:
    if not header_value:
        return None
    scheme, _, token = header_value.partition(" ")
    token = token.strip()
    if scheme.strip().lower() != "bearer" or not token:
        return None
    return token


def _load_config() -> _ExternalAuthConfig:
    introspection_url = os.getenv("EXTERNAL_AUTH_INTROSPECTION_URL", "").strip()
    if not introspection_url:
        raise ExternalAuthMisconfigured(
            "EXTERNAL_AUTH_ENABLED=true but EXTERNAL_AUTH_INTROSPECTION_URL is empty"
        )

    parsed = urlparse(introspection_url)
    if parsed.scheme not in {"http", "https"}:
        raise ExternalAuthMisconfigured(
            "EXTERNAL_AUTH_INTROSPECTION_URL must use http or https"
        )

    allow_insecure_http = _bool_env("EXTERNAL_AUTH_ALLOW_INSECURE_HTTP", False)
    if parsed.scheme != "https" and not allow_insecure_http:
        raise ExternalAuthMisconfigured(
            "External auth introspection requires https unless "
            "EXTERNAL_AUTH_ALLOW_INSECURE_HTTP=true is set for private-network use"
        )

    timeout_ms = int(os.getenv("EXTERNAL_AUTH_TIMEOUT_MS", "1500").strip() or "1500")
    if timeout_ms <= 0:
        raise ExternalAuthMisconfigured("EXTERNAL_AUTH_TIMEOUT_MS must be > 0")

    audience = os.getenv("EXTERNAL_AUTH_AUDIENCE", "").strip() or None
    service_token = os.getenv("EXTERNAL_AUTH_SERVICE_TOKEN", "").strip() or None

    return _ExternalAuthConfig(
        introspection_url=introspection_url,
        service_token=service_token,
        timeout_seconds=timeout_ms / 1000.0,
        audience=audience,
        allow_insecure_http=allow_insecure_http,
    )


def _parse_identity(payload: Any) -> ExternalAuthIdentity:
    if not isinstance(payload, dict):
        raise ExternalAuthUnavailable("External auth response must be a JSON object")

    if not bool(payload.get("active")):
        raise ExternalAuthInvalidToken("Bearer token is inactive")

    email = str(payload.get("email") or "").strip().lower()
    if not email:
        raise ExternalAuthUnavailable("External auth response is missing email")

    subject = str(payload.get("sub") or payload.get("subject") or "").strip() or None
    display_name = str(payload.get("display_name") or payload.get("name") or "").strip() or None
    is_admin = bool(payload.get("is_admin") or payload.get("admin"))

    return ExternalAuthIdentity(
        email=email,
        subject=subject,
        display_name=display_name,
        is_admin=is_admin,
    )


def _introspect_token_sync(config: _ExternalAuthConfig, token: str) -> ExternalAuthIdentity:
    payload: dict[str, Any] = {"token": token}
    if config.audience:
        payload["audience"] = config.audience

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if config.service_token:
        headers["Authorization"] = f"Bearer {config.service_token}"

    req = Request(
        config.introspection_url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urlopen(req, timeout=config.timeout_seconds) as response:
            raw_body = response.read().decode("utf-8")
    except HTTPError as exc:
        # Invalid caller credentials or upstream failures are infrastructure problems.
        if exc.code == 200:
            raw_body = exc.read().decode("utf-8")
        else:
            raise ExternalAuthUnavailable(
                f"External auth introspection failed with HTTP {exc.code}"
            ) from exc
    except (URLError, socket.timeout, TimeoutError) as exc:
        raise ExternalAuthUnavailable("External auth introspection request failed") from exc

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise ExternalAuthUnavailable("External auth response was not valid JSON") from exc

    return _parse_identity(body)


async def verify_bearer_token(token: str) -> ExternalAuthIdentity:
    token = token.strip()
    if not token:
        raise ExternalAuthInvalidToken("Bearer token is empty")
    config = _load_config()
    return await asyncio.to_thread(_introspect_token_sync, config, token)
