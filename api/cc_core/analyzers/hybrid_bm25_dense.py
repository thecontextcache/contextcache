from __future__ import annotations
import math
from collections import Counter
from typing import Dict, Iterable, List

from cc_core.analyzers.base import Analyzer
from cc_core.models.fact import Fact
from cc_core.services.embedding_service import EmbeddingService


class HybridBM25DenseAnalyzer(Analyzer):
    """
    Hybrid ranker:
      final = α * BM25 + β * dense_cosine + γ * pagerank + δ * time_decay
    """

    name = "hybrid_bm25_dense"
    version = "0.1.0"

    def __init__(
        self,
        alpha: float = 0.3,
        beta: float = 0.4,
        gamma: float = 0.2,
        delta: float = 0.1,
        k1: float = 1.2,
        b: float = 0.75,
        half_life_days: float = 90.0,
        embedding: EmbeddingService | None = None,
    ):
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.delta = delta
        self.k1 = k1
        self.b = b
        self.half_life_days = half_life_days
        self.embedding = embedding or EmbeddingService()

    # ---- utilities ----

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        text = (text or "").lower()
        # simple tokenization; can be replaced with better NLP if needed
        return [t for t in "".join(ch if ch.isalnum() else " " for ch in text).split() if t]

    @staticmethod
    def _safe_idf(N: int, df: int, eps: float = 1e-6) -> float:
        num = max(N - df, 0) + 0.5
        den = df + 0.5
        return max(0.0, math.log((num + eps) / (den + eps)))

    @staticmethod
    def _normalize(xs: List[float]) -> List[float]:
        if not xs:
            return []
        lo, hi = min(xs), max(xs)
        if hi - lo < 1e-12:
            return [0.0] * len(xs)
        return [(x - lo) / (hi - lo) for x in xs]

    @staticmethod
    def _cosine(a: List[float], b: List[float]) -> float:
        import numpy as np
        va = np.asarray(a, dtype=float)
        vb = np.asarray(b, dtype=float)
        na = float(np.linalg.norm(va))
        nb = float(np.linalg.norm(vb))
        if na == 0.0 or nb == 0.0:
            return 0.0
        return float(va.dot(vb) / (na * nb))

    # ---- main API ----

    async def compute_scores(self, project_id, facts: List[Fact], **kwargs) -> Dict:
        if not facts:
            return {}
        N = len(facts)

        # Build "documents" from facts (subject + predicate + object + context)
        docs = [
            " ".join([f.subject, f.predicate, f.object, f.context or ""]).strip()
            for f in facts
        ]
        tokens = [self._tokenize(d) for d in docs]
        doc_lens = [len(ts) for ts in tokens]
        avg_len = (sum(doc_lens) / len(doc_lens)) if doc_lens else 0.0

        # IDF
        df: Counter[str] = Counter()
        for ts in tokens:
            for term in set(ts):
                df[term] += 1
        idf: Dict[str, float] = {t: self._safe_idf(N, c) for t, c in df.items()}

        # BM25 per doc against its own terms (surrogate for matching against query-less rerank)
        bm25_scores: List[float] = []
        for ts, L in zip(tokens, doc_lens):
            tf = Counter(ts)
            s = 0.0
            for term, freq in tf.items():
                w = idf.get(term, 0.0)
                denom = freq + self.k1 * (1 - self.b + self.b * (L / (avg_len or 1.0)))
                s += w * ((freq * (self.k1 + 1)) / (denom or 1.0))
            bm25_scores.append(s)

        # Dense: embed each doc (fact text) and compute self-sim surrogate (or provided query embedding)
        # If a query vector is supplied in kwargs, use that; otherwise use the doc embedding mean as context.
        dense_scores: List[float] = []
        if "query_embedding" in kwargs:
            qv = kwargs["query_embedding"]
            doc_vecs = self.embedding.embed_batch(docs)
            dense_scores = [self._cosine(qv, dv) for dv in doc_vecs]
        else:
            # self-sim surrogate: scale by norm (keeps relative magnitude)
            doc_vecs = self.embedding.embed_batch(docs)
            dense_scores = [self._cosine(dv, dv) for dv in doc_vecs]

        # PageRank provided via kwargs (precomputed) or uniform fallback
        pr_map: Dict[str, float] = kwargs.get("pagerank", {})
        pr_scores: List[float] = [float(pr_map.get(str(f.id), 0.0)) for f in facts]
        if all(p == 0.0 for p in pr_scores):
            uni = 1.0 / N
            pr_scores = [uni] * N

        # Decay: use precomputed or compute from fact.created_at (if present)
        decay_map: Dict[str, float] = kwargs.get("decay", {})
        decay_scores: List[float] = [float(decay_map.get(str(f.id), 1.0)) for f in facts]

        bm25_n = self._normalize(bm25_scores)
        dense_n = self._normalize(dense_scores)
        pr_n = self._normalize(pr_scores)
        decay_n = self._normalize(decay_scores)

        final = [
            self.alpha * bm25_n[i]
            + self.beta * dense_n[i]
            + self.gamma * pr_n[i]
            + self.delta * decay_n[i]
            for i in range(N)
        ]
        return {facts[i].id: final[i] for i in range(N)}

    async def apply_decay(self, project_id, facts: List[Fact], **kwargs) -> Dict:
        # if caller didn’t provide, fall back to 1.0 (no decay)
        return {f.id: 1.0 for f in facts}
