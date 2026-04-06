import os
import random
from typing import List

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    FilterSelector,
)

from app.services.clip_service import clip_service

QDRANT_HOST = os.environ.get("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.environ.get("QDRANT_PORT", "6333"))
COLLECTION_NAME = "coatl_images"
VECTOR_DIM = 512
MAX_IMAGES_PER_MEDIA = 200


class QdrantService:
    def __init__(self):
        self._client: QdrantClient | None = None

    def _get_client(self) -> QdrantClient:
        if self._client is None:
            self._client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        return self._client

    def ensure_collection(self):
        client = self._get_client()
        existing = [c.name for c in client.get_collections().collections]
        if COLLECTION_NAME not in existing:
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
            )

    def index_media(self, media_uid: str, image_paths: List[str]) -> int:
        """Embed up to MAX_IMAGES_PER_MEDIA images and upsert into Qdrant.
        
        Points are identified by a deterministic integer ID derived from
        (media_uid, image index) so re-indexing is idempotent.
        Returns the number of images indexed.
        """
        self.ensure_collection()
        client = self._get_client()

        # Sample if too many images
        if len(image_paths) > MAX_IMAGES_PER_MEDIA:
            image_paths = random.sample(image_paths, MAX_IMAGES_PER_MEDIA)

        # Delete existing points for this media before re-indexing
        client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="media_uid", match=MatchValue(value=media_uid))]
                )
            ),
        )

        points: List[PointStruct] = []
        for i, path in enumerate(image_paths):
            try:
                embedding = clip_service.embed_image(path)
            except Exception:
                continue  # skip unreadable images

            # Use a stable integer ID: hash of uid+index truncated to 63 bits
            point_id = abs(hash(f"{media_uid}::{i}")) % (2**63)

            points.append(
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={"media_uid": media_uid, "image_path": path},
                )
            )

        if points:
            client.upsert(collection_name=COLLECTION_NAME, points=points)

        return len(points)

    def delete_media(self, media_uid: str):
        """Remove all Qdrant points for a given media_uid."""
        self.ensure_collection()
        client = self._get_client()
        client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="media_uid", match=MatchValue(value=media_uid))]
                )
            ),
        )

    def search_by_text(self, text: str, limit: int = 20) -> List[dict]:
        """Embed text query and return top media_uid groups ordered by best score."""
        self.ensure_collection()
        client = self._get_client()

        query_vector = clip_service.embed_text(text)

        # Fetch limit*10 candidates then group by media_uid in Python
        response = client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            limit=limit * 10,
            with_payload=True,
        )

        # Keep best-scoring point per media_uid
        seen: dict = {}
        for hit in response.points:
            uid = hit.payload.get("media_uid")
            if uid and (uid not in seen or hit.score > seen[uid]["score"]):
                seen[uid] = {
                    "score": hit.score,
                    "image_path": hit.payload.get("image_path"),
                }

        hits = [{"media_uid": uid, **v} for uid, v in seen.items()]
        hits.sort(key=lambda x: x["score"], reverse=True)
        return hits[:limit]

    def collection_info(self) -> dict:
        try:
            client = self._get_client()
            info = client.get_collection(COLLECTION_NAME)
            return {
                "status": "ok",
                "collection": COLLECTION_NAME,
                "vectors_count": info.vectors_count,
                "points_count": info.points_count,
            }
        except Exception as e:
            return {"status": "error", "detail": str(e)}


qdrant_service = QdrantService()
