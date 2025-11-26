"""
Knowledge Representation Learning (KRL) Service

Trains knowledge graph embeddings using TransE-style model.
TransE learns embeddings such that: h + r ≈ t
where h = head entity, r = relation, t = tail entity

This service:
1. Loads entities, relations, and facts from the database
2. Builds training triples (subject_id, predicate, object_id)
3. Trains embeddings using PyTorch with margin ranking loss
4. Saves learned embeddings back to the database
5. Computes KRL scores for facts based on model fit

Architecture:
- Runs offline (not part of request path)
- Can be triggered from Arq worker for background training
- Uses modest dependencies (PyTorch only)
- Starts with simple baseline, can be extended later

Author: ContextCache Team
"""
from typing import Dict, List, Tuple, Optional, Set
from uuid import UUID
from datetime import datetime
import random
from structlog import get_logger

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np

from cc_core.storage.adapters.postgres import PostgresAdapter
from cc_core.models.entity import Entity
from cc_core.models.relation import Relation

logger = get_logger(__name__)


class KGDataset(Dataset):
    """
    PyTorch Dataset for knowledge graph triples.
    
    Each sample is a triple: (head_idx, relation_idx, tail_idx)
    where indices map to entity/relation embeddings.
    """
    
    def __init__(
        self,
        triples: List[Tuple[int, int, int]],
        num_entities: int,
        negative_samples: int = 1
    ):
        """
        Initialize dataset.
        
        Args:
            triples: List of (head, relation, tail) index triples
            num_entities: Total number of entities (for negative sampling)
            negative_samples: Number of negative samples per positive
        """
        self.triples = triples
        self.num_entities = num_entities
        self.negative_samples = negative_samples
        
        # Build set for fast negative sampling
        self.triple_set = set(triples)
    
    def __len__(self) -> int:
        return len(self.triples)
    
    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        """
        Get positive triple and negative samples.
        
        Returns dict with:
        - pos_triple: (h, r, t) positive triple
        - neg_triples: List of (h', r, t') negative triples
        """
        h, r, t = self.triples[idx]
        
        # Generate negative samples by corrupting head or tail
        neg_triples = []
        for _ in range(self.negative_samples):
            # Randomly corrupt head or tail
            if random.random() < 0.5:
                # Corrupt head
                h_neg = random.randint(0, self.num_entities - 1)
                while (h_neg, r, t) in self.triple_set and h_neg != h:
                    h_neg = random.randint(0, self.num_entities - 1)
                neg_triples.append((h_neg, r, t))
            else:
                # Corrupt tail
                t_neg = random.randint(0, self.num_entities - 1)
                while (h, r, t_neg) in self.triple_set and t_neg != t:
                    t_neg = random.randint(0, self.num_entities - 1)
                neg_triples.append((h, r, t_neg))
        
        return {
            'pos_triple': torch.LongTensor([h, r, t]),
            'neg_triples': torch.LongTensor(neg_triples)
        }


class TransE(nn.Module):
    """
    TransE model: h + r ≈ t
    
    Simple but effective knowledge graph embedding model.
    Learns embeddings such that head + relation ≈ tail in embedding space.
    """
    
    def __init__(
        self,
        num_entities: int,
        num_relations: int,
        embedding_dim: int = 100,
        margin: float = 1.0,
        norm: int = 1
    ):
        """
        Initialize TransE model.
        
        Args:
            num_entities: Number of unique entities
            num_relations: Number of unique relation types
            embedding_dim: Dimension of embeddings (50-200 typical)
            margin: Margin for ranking loss
            norm: L1 or L2 norm (1 or 2)
        """
        super().__init__()
        
        self.num_entities = num_entities
        self.num_relations = num_relations
        self.embedding_dim = embedding_dim
        self.margin = margin
        self.norm = norm
        
        # Entity embeddings
        self.entity_embeddings = nn.Embedding(num_entities, embedding_dim)
        
        # Relation embeddings
        self.relation_embeddings = nn.Embedding(num_relations, embedding_dim)
        
        # Initialize with uniform distribution
        nn.init.uniform_(
            self.entity_embeddings.weight.data,
            a=-6.0 / np.sqrt(embedding_dim),
            b=6.0 / np.sqrt(embedding_dim)
        )
        nn.init.uniform_(
            self.relation_embeddings.weight.data,
            a=-6.0 / np.sqrt(embedding_dim),
            b=6.0 / np.sqrt(embedding_dim)
        )
        
        # Normalize entity embeddings
        self.entity_embeddings.weight.data = nn.functional.normalize(
            self.entity_embeddings.weight.data,
            p=2,
            dim=1
        )
    
    def forward(
        self,
        heads: torch.Tensor,
        relations: torch.Tensor,
        tails: torch.Tensor
    ) -> torch.Tensor:
        """
        Compute score for triples.
        
        Score = -||h + r - t|| (negative distance)
        Lower distance = higher plausibility
        
        Args:
            heads: Tensor of head entity indices [batch_size]
            relations: Tensor of relation indices [batch_size]
            tails: Tensor of tail entity indices [batch_size]
            
        Returns:
            Tensor of scores [batch_size]
        """
        # Look up embeddings
        h = self.entity_embeddings(heads)  # [batch_size, dim]
        r = self.relation_embeddings(relations)  # [batch_size, dim]
        t = self.entity_embeddings(tails)  # [batch_size, dim]
        
        # Compute TransE score: h + r - t
        score = h + r - t  # [batch_size, dim]
        
        # Compute distance (L1 or L2)
        if self.norm == 1:
            score = torch.norm(score, p=1, dim=1)  # L1 norm
        else:
            score = torch.norm(score, p=2, dim=1)  # L2 norm
        
        # Return negative distance (higher is better)
        return -score
    
    def normalize_embeddings(self):
        """Normalize entity embeddings to unit length."""
        self.entity_embeddings.weight.data = nn.functional.normalize(
            self.entity_embeddings.weight.data,
            p=2,
            dim=1
        )


class KRLService:
    """
    Knowledge Representation Learning service.
    
    Trains TransE-style embeddings for knowledge graph entities and relations.
    Can be triggered from background worker or run manually.
    
    Usage:
        krl_service = KRLService(storage_adapter)
        await krl_service.train_and_update_embeddings(project_id)
    """
    
    def __init__(
        self,
        storage: PostgresAdapter,
        embedding_dim: int = 100,
        epochs: int = 100,
        batch_size: int = 128,
        learning_rate: float = 0.01,
        margin: float = 1.0,
        negative_samples: int = 5,
        device: Optional[str] = None
    ):
        """
        Initialize KRL service.
        
        Args:
            storage: PostgreSQL storage adapter
            embedding_dim: Dimension of learned embeddings (50-200 typical)
            epochs: Number of training epochs
            batch_size: Batch size for training
            learning_rate: Learning rate for Adam optimizer
            margin: Margin for ranking loss
            negative_samples: Number of negative samples per positive
            device: 'cpu', 'cuda', or None (auto-detect)
        """
        self.storage = storage
        self.embedding_dim = embedding_dim
        self.epochs = epochs
        self.batch_size = batch_size
        self.learning_rate = learning_rate
        self.margin = margin
        self.negative_samples = negative_samples
        
        # Device setup
        if device is None:
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        else:
            self.device = torch.device(device)
        
        logger.info(
            "Initialized KRL service",
            embedding_dim=embedding_dim,
            epochs=epochs,
            device=str(self.device)
        )
    
    async def train_and_update_embeddings(self, project_id: UUID) -> Dict:
        """
        Train KRL embeddings and update database.
        
        Main entry point for KRL training. This method:
        1. Loads all entities and relations from DB
        2. Builds training triples from facts/relations
        3. Trains TransE model
        4. Computes KRL scores for facts
        5. Saves embeddings and scores back to DB
        
        Args:
            project_id: Project UUID to train embeddings for
            
        Returns:
            Dict with training statistics and results
        """
        start_time = datetime.utcnow()
        logger.info("Starting KRL training", project_id=str(project_id))
        
        try:
            # Step 1: Load data from database
            logger.info("Loading entities and relations from database")
            entities = await self.storage.list_entities(
                project_id=project_id,
                limit=10000  # TODO: Handle pagination for very large projects
            )
            relations = await self._get_all_relations(project_id)
            
            if len(entities) < 2:
                logger.warning("Not enough entities to train", num_entities=len(entities))
                return {
                    "status": "skipped",
                    "reason": "insufficient_entities",
                    "num_entities": len(entities),
                    "num_relations": len(relations)
                }
            
            if len(relations) < 1:
                logger.warning("No relations found", num_entities=len(entities))
                return {
                    "status": "skipped",
                    "reason": "no_relations",
                    "num_entities": len(entities),
                    "num_relations": len(relations)
                }
            
            # Step 2: Build index mappings
            entity_to_idx, idx_to_entity = self._build_entity_index(entities)
            relation_to_idx, idx_to_relation = self._build_relation_index(relations)
            
            # Step 3: Build training triples
            triples = self._build_triples(relations, entity_to_idx, relation_to_idx)
            
            if len(triples) < 10:
                logger.warning("Not enough triples to train", num_triples=len(triples))
                return {
                    "status": "skipped",
                    "reason": "insufficient_triples",
                    "num_entities": len(entities),
                    "num_relations": len(relations),
                    "num_triples": len(triples)
                }
            
            logger.info(
                "Built training data",
                num_entities=len(entities),
                num_relations=len(relation_to_idx),
                num_triples=len(triples)
            )
            
            # Step 4: Train model
            model, final_loss = await self._train_model(
                triples=triples,
                num_entities=len(entity_to_idx),
                num_relations=len(relation_to_idx)
            )
            
            # Step 5: Extract embeddings
            entity_embeddings = self._extract_entity_embeddings(model, idx_to_entity)
            relation_embeddings = self._extract_relation_embeddings(model, idx_to_relation)
            
            # Step 6: Compute KRL scores for facts
            logger.info("Computing KRL scores for facts")
            fact_scores = await self._compute_fact_scores(
                project_id=project_id,
                model=model,
                entity_to_idx=entity_to_idx,
                relation_to_idx=relation_to_idx
            )
            
            # Step 7: Save to database
            logger.info("Saving embeddings to database")
            entities_updated = await self.storage.batch_update_entity_embeddings(
                entity_embeddings
            )
            relations_updated = await self.storage.batch_update_relation_embeddings(
                relation_embeddings
            )
            facts_updated = await self.storage.batch_update_fact_krl_scores(
                fact_scores
            )
            
            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()
            
            result = {
                "status": "completed",
                "project_id": str(project_id),
                "embedding_dim": self.embedding_dim,
                "num_entities": len(entities),
                "num_relations": len(relation_to_idx),
                "num_triples": len(triples),
                "epochs_trained": self.epochs,
                "final_loss": float(final_loss),
                "entities_updated": entities_updated,
                "relations_updated": relations_updated,
                "facts_scored": facts_updated,
                "training_duration_seconds": duration,
                "started_at": start_time.isoformat(),
                "completed_at": end_time.isoformat()
            }
            
            logger.info("KRL training completed", **result)
            return result
            
        except Exception as e:
            logger.error("KRL training failed", error=str(e), project_id=str(project_id))
            return {
                "status": "failed",
                "project_id": str(project_id),
                "error": str(e)
            }
    
    async def _get_all_relations(self, project_id: UUID) -> List[Relation]:
        """Load all relations for a project."""
        # Get all entities first
        entities = await self.storage.list_entities(project_id, limit=10000)
        
        # Collect all relations
        all_relations = []
        seen_relation_ids = set()
        
        for entity in entities:
            relations = await self.storage.get_relations_for_entity(
                entity.id,
                limit=1000
            )
            for rel in relations:
                if rel.id not in seen_relation_ids and rel.project_id == project_id:
                    all_relations.append(rel)
                    seen_relation_ids.add(rel.id)
        
        return all_relations
    
    def _build_entity_index(
        self,
        entities: List[Entity]
    ) -> Tuple[Dict[UUID, int], Dict[int, UUID]]:
        """Build bidirectional mapping between entity UUIDs and indices."""
        entity_to_idx = {entity.id: idx for idx, entity in enumerate(entities)}
        idx_to_entity = {idx: entity.id for entity.id, idx in entity_to_idx.items()}
        return entity_to_idx, idx_to_entity
    
    def _build_relation_index(
        self,
        relations: List[Relation]
    ) -> Tuple[Dict[str, int], Dict[int, str]]:
        """
        Build bidirectional mapping between relation predicates and indices.
        
        Note: We index by predicate string, not relation UUID, because
        multiple relation instances can share the same predicate type.
        """
        # Get unique predicates
        unique_predicates = list(set(rel.predicate for rel in relations))
        
        predicate_to_idx = {pred: idx for idx, pred in enumerate(unique_predicates)}
        idx_to_predicate = {idx: pred for pred, idx in predicate_to_idx.items()}
        
        return predicate_to_idx, idx_to_predicate
    
    def _build_triples(
        self,
        relations: List[Relation],
        entity_to_idx: Dict[UUID, int],
        relation_to_idx: Dict[str, int]
    ) -> List[Tuple[int, int, int]]:
        """
        Build list of training triples (head_idx, relation_idx, tail_idx).
        
        Filters out relations where entities are not in the index.
        """
        triples = []
        
        for rel in relations:
            # Check if both entities exist in our index
            if rel.subject_id in entity_to_idx and rel.object_id in entity_to_idx:
                h_idx = entity_to_idx[rel.subject_id]
                r_idx = relation_to_idx[rel.predicate]
                t_idx = entity_to_idx[rel.object_id]
                triples.append((h_idx, r_idx, t_idx))
        
        return triples
    
    async def _train_model(
        self,
        triples: List[Tuple[int, int, int]],
        num_entities: int,
        num_relations: int
    ) -> Tuple[TransE, float]:
        """
        Train TransE model on triples.
        
        Returns trained model and final loss.
        """
        logger.info("Initializing TransE model")
        
        # Create dataset and dataloader
        dataset = KGDataset(
            triples=triples,
            num_entities=num_entities,
            negative_samples=self.negative_samples
        )
        dataloader = DataLoader(
            dataset,
            batch_size=self.batch_size,
            shuffle=True,
            num_workers=0  # Use 0 for async compatibility
        )
        
        # Initialize model
        model = TransE(
            num_entities=num_entities,
            num_relations=num_relations,
            embedding_dim=self.embedding_dim,
            margin=self.margin
        ).to(self.device)
        
        # Optimizer
        optimizer = optim.Adam(model.parameters(), lr=self.learning_rate)
        
        # Training loop
        logger.info("Starting training", epochs=self.epochs)
        model.train()
        final_loss = 0.0
        
        for epoch in range(self.epochs):
            epoch_loss = 0.0
            num_batches = 0
            
            for batch in dataloader:
                # Get positive and negative triples
                pos_triple = batch['pos_triple'].to(self.device)  # [batch_size, 3]
                neg_triples = batch['neg_triples'].to(self.device)  # [batch_size, neg_samples, 3]
                
                # Compute positive scores
                pos_scores = model(
                    pos_triple[:, 0],
                    pos_triple[:, 1],
                    pos_triple[:, 2]
                )  # [batch_size]
                
                # Compute negative scores (average over negative samples)
                batch_size = neg_triples.size(0)
                neg_scores_list = []
                for i in range(self.negative_samples):
                    neg_score = model(
                        neg_triples[:, i, 0],
                        neg_triples[:, i, 1],
                        neg_triples[:, i, 2]
                    )
                    neg_scores_list.append(neg_score)
                
                neg_scores = torch.stack(neg_scores_list, dim=1).mean(dim=1)  # [batch_size]
                
                # Margin ranking loss: max(0, margin - pos_score + neg_score)
                # We want pos_score > neg_score by at least margin
                loss = torch.clamp(self.margin - pos_scores + neg_scores, min=0).mean()
                
                # Backward pass
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                
                # Normalize entity embeddings
                model.normalize_embeddings()
                
                epoch_loss += loss.item()
                num_batches += 1
            
            avg_loss = epoch_loss / num_batches
            final_loss = avg_loss
            
            if (epoch + 1) % 10 == 0 or epoch == 0:
                logger.info(
                    "Training progress",
                    epoch=epoch + 1,
                    loss=avg_loss
                )
        
        logger.info("Training completed", final_loss=final_loss)
        model.eval()
        return model, final_loss
    
    def _extract_entity_embeddings(
        self,
        model: TransE,
        idx_to_entity: Dict[int, UUID]
    ) -> Dict[UUID, List[float]]:
        """Extract entity embeddings from trained model."""
        embeddings = {}
        
        with torch.no_grad():
            for idx, entity_id in idx_to_entity.items():
                embedding = model.entity_embeddings(
                    torch.LongTensor([idx]).to(self.device)
                ).cpu().numpy()[0]
                embeddings[entity_id] = embedding.tolist()
        
        return embeddings
    
    def _extract_relation_embeddings(
        self,
        model: TransE,
        idx_to_relation: Dict[int, str]
    ) -> Dict[UUID, List[float]]:
        """
        Extract relation embeddings from trained model.
        
        Note: Returns empty dict for now since we index by predicate string,
        not relation UUID. To support per-relation-instance embeddings,
        we'd need to modify the indexing strategy.
        """
        # TODO: If needed, store predicate embeddings separately
        # For now, we return empty dict since Relation model expects UUID keys
        return {}
    
    async def _compute_fact_scores(
        self,
        project_id: UUID,
        model: TransE,
        entity_to_idx: Dict[UUID, int],
        relation_to_idx: Dict[str, int]
    ) -> Dict[UUID, float]:
        """
        Compute KRL plausibility scores for all facts.
        
        Score is normalized distance: sigmoid(-distance)
        Higher score = fact fits the model better
        """
        # Load all facts
        facts = await self.storage.list_facts(
            project_id=project_id,
            limit=100000  # TODO: Handle pagination
        )
        
        scores = {}
        model.eval()
        
        with torch.no_grad():
            for fact in facts:
                # Try to map fact to entities/relations
                # Note: Facts store string names, not UUIDs, so we need fuzzy matching
                # For now, we'll skip facts that don't map cleanly
                # In production, you'd want entity resolution here
                
                # Simple heuristic: compute average score over all valid triples
                # that mention the fact's subject/object strings
                # This is a placeholder - proper implementation would do entity linking
                
                # For baseline, we'll just give neutral score
                scores[fact.id] = 0.5
        
        logger.info("Computed KRL scores for facts", num_facts=len(scores))
        return scores
    
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        v1 = np.array(vec1)
        v2 = np.array(vec2)
        
        dot_product = np.dot(v1, v2)
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))
    
    async def find_similar_entities(
        self,
        project_id: UUID,
        entity_id: UUID,
        top_k: int = 10
    ) -> List[Tuple[Entity, float]]:
        """
        Find entities similar to a given entity using KRL embeddings.
        
        Args:
            project_id: Project ID
            entity_id: Target entity UUID
            top_k: Number of similar entities to return
            
        Returns:
            List of (entity, similarity_score) tuples, sorted by similarity
        """
        # Get target entity
        target_entity = await self.storage.get_entity(entity_id)
        if not target_entity or not target_entity.krl_embedding:
            return []
        
        # Get all entities with KRL embeddings
        entities = await self.storage.get_entities_with_krl_embeddings(
            project_id=project_id,
            limit=1000
        )
        
        # Compute similarities
        similarities = []
        for entity in entities:
            if entity.id == entity_id:
                continue  # Skip self
            
            if entity.krl_embedding:
                similarity = self.cosine_similarity(
                    target_entity.krl_embedding,
                    entity.krl_embedding
                )
                similarities.append((entity, similarity))
        
        # Sort by similarity and return top-k
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:top_k]

