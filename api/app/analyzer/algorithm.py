"""Public analyzer shim.

Runtime prefers the private ``contextcache-engine`` package. When it is not
available, fall back to the internal compatibility module.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

try:  # pragma: no cover - exercised when the private engine is installed
    from contextcache_engine.algorithm import *  # type: ignore[import-untyped]  # noqa: F403
except ModuleNotFoundError:  # pragma: no cover - local/test fallback path
    logger.warning(
        "Private contextcache-engine package is unavailable; using internal compatibility fallback."
    )
    from ._algorithm_fallback import *  # noqa: F403
except Exception:  # pragma: no cover - defensive import guard
    logger.exception(
        "Private contextcache-engine package failed to import; using internal compatibility fallback."
    )
    from ._algorithm_fallback import *  # noqa: F403
