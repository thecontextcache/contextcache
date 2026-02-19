from __future__ import annotations

import os
import random

from locust import HttpUser, between, task


API_KEY = os.getenv("LOADTEST_API_KEY", "")
ORG_ID = os.getenv("LOADTEST_ORG_ID", "")
PROJECT_ID = os.getenv("LOADTEST_PROJECT_ID", "1")


class ContextCacheUser(HttpUser):
    wait_time = between(0.2, 1.2)

    def on_start(self) -> None:
        self.headers = {"Content-Type": "application/json"}
        if API_KEY:
            self.headers["X-API-Key"] = API_KEY
        if ORG_ID:
            self.headers["X-Org-Id"] = ORG_ID

    @task(3)
    def recall(self) -> None:
        q = random.choice(["postgres migration", "auth session", "vector recall", "usage limits"])
        self.client.get(
            f"/projects/{PROJECT_ID}/recall",
            params={"query": q, "limit": 10},
            headers=self.headers,
            name="/projects/:id/recall",
        )

    @task(1)
    def add_memory(self) -> None:
        payload = {
            "type": "note",
            "source": "api",
            "content": f"Load test memory {random.randint(1, 1_000_000)}",
        }
        self.client.post(
            f"/projects/{PROJECT_ID}/memories",
            json=payload,
            headers=self.headers,
            name="/projects/:id/memories",
        )
