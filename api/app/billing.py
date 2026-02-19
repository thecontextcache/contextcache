from __future__ import annotations

import os


BILLING_PROVIDER = os.getenv("BILLING_PROVIDER", "none").strip().lower()


def emit_usage_event(*, event_type: str, user_id: int | None) -> None:
    """No-op billing hook for future Stripe/Paddle usage metering."""
    if BILLING_PROVIDER in {"", "none"}:
        return
    # Future integration point:
    # - enqueue metering event to billing connector
    # - include org + tier context
    _ = (event_type, user_id)
