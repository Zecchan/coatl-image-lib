import os
from typing import List

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    MatchAny,
    FilterSelector,
)

from app.services.text_service import text_service

QDRANT_HOST = os.environ.get("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.environ.get("QDRANT_PORT", "6333"))
TEXT_COLLECTION_NAME = os.environ.get("TEXT_COLLECTION_NAME", "coatl_text")
TEXT_VECTOR_DIM = 384  # all-MiniLM-L6-v2


def _point_id(audiofile_uid: str) -> int:
    """Deterministic non-negative Qdrant integer ID from a 16-char hex uid."""
    return int(audiofile_uid, 16) % (2**63)


class TextQdrantService:
    def __init__(self):
        self._client: QdrantClient | None = None

    def _get_client(self) -> QdrantClient:
        if self._client is None:
            self._client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        return self._client

    def ensure_collection(self):
        client = self._get_client()
        existing = [c.name for c in client.get_collections().collections]
        if TEXT_COLLECTION_NAME not in existing:
            client.create_collection(
                collection_name=TEXT_COLLECTION_NAME,
                vectors_config=VectorParams(size=TEXT_VECTOR_DIM, distance=Distance.COSINE),
            )
            print(f"[text_qdrant] Created collection: {TEXT_COLLECTION_NAME}")

    def index_lyrics(self, audiofile_uid: str, media_uid: str, text: str) -> bool:
        """Embed lyrics/text and upsert a single point for this audiofile."""
        self.ensure_collection()
        client = self._get_client()
        try:
            embedding = text_service.embed(text)
            point = PointStruct(
                id=_point_id(audiofile_uid),
                vector=embedding,
                payload={"audiofile_uid": audiofile_uid, "media_uid": media_uid},
            )
            client.upsert(collection_name=TEXT_COLLECTION_NAME, points=[point])
            print(f"[text_qdrant] Indexed audiofile_uid={audiofile_uid} media_uid={media_uid}")
            return True
        except Exception as e:
            print(f"[text_qdrant] index_lyrics failed for {audiofile_uid}: {e}")
            return False

    def delete_text(self, audiofile_uid: str):
        """Remove a single point by audiofile_uid."""
        client = self._get_client()
        try:
            client.delete(
                collection_name=TEXT_COLLECTION_NAME,
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[FieldCondition(key="audiofile_uid", match=MatchValue(value=audiofile_uid))]
                    )
                ),
            )
            print(f"[text_qdrant] Deleted audiofile_uid={audiofile_uid}")
        except Exception as e:
            print(f"[text_qdrant] delete_text failed for {audiofile_uid}: {e}")

    def delete_by_media(self, media_uid: str):
        """Remove all points belonging to a media (used when a music collection is deleted)."""
        client = self._get_client()
        try:
            client.delete(
                collection_name=TEXT_COLLECTION_NAME,
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[FieldCondition(key="media_uid", match=MatchValue(value=media_uid))]
                    )
                ),
            )
            print(f"[text_qdrant] Deleted all points for media_uid={media_uid}")
        except Exception as e:
            print(f"[text_qdrant] delete_by_media failed for {media_uid}: {e}")

    def index_documents(self, media_uid: str, documents, chunk_size: int = 200, max_chunks: int = 500) -> dict:
        """Embed document chunks proportionally and upsert into Qdrant."""
        import random
        from collections import defaultdict
        from app.services.document_service import extract_text, chunk_text

        self.ensure_collection()
        client = self._get_client()

        # Delete existing document points for this media
        try:
            client.delete(
                collection_name=TEXT_COLLECTION_NAME,
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[
                            FieldCondition(key="media_uid", match=MatchValue(value=media_uid)),
                            FieldCondition(key="point_type", match=MatchValue(value="document")),
                        ]
                    )
                ),
            )
        except Exception as e:
            print(f"[text_qdrant] delete existing document points failed: {e}")

        # Extract and chunk all documents
        chunks_by_doc = defaultdict(list)  # rel_path -> [(chunk_idx, chunk_text)]
        for doc in documents:
            text = extract_text(doc.abs_path)
            if not text.strip():
                continue
            for i, chunk in enumerate(chunk_text(text, chunk_size)):
                chunks_by_doc[doc.rel_path].append((i, chunk))

        total_chunks = sum(len(v) for v in chunks_by_doc.values())
        if total_chunks == 0:
            return {"indexed": 0, "documents": 0}

        # Proportional budget per document
        selected: list = []
        if total_chunks <= max_chunks:
            for rel_path, chunks in chunks_by_doc.items():
                for chunk_idx, chunk_text_val in chunks:
                    selected.append((rel_path, chunk_idx, chunk_text_val))
        else:
            for rel_path, chunks in chunks_by_doc.items():
                budget = max(1, round(max_chunks * len(chunks) / total_chunks))
                sampled = random.sample(chunks, budget) if len(chunks) > budget else chunks
                for chunk_idx, chunk_text_val in sampled:
                    selected.append((rel_path, chunk_idx, chunk_text_val))

        # Embed and upsert in batches
        points = []
        for rel_path, chunk_idx, chunk_text_val in selected:
            try:
                embedding = text_service.embed(chunk_text_val)
                point_id = abs(hash(f"{media_uid}::{rel_path}::{chunk_idx}")) % (2**63)
                points.append(PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "media_uid": media_uid,
                        "document_path": rel_path,
                        "chunk_index": chunk_idx,
                        "point_type": "document",
                    },
                ))
            except Exception as e:
                print(f"[text_qdrant] embed chunk failed for {rel_path}:{chunk_idx}: {e}")

        BATCH = 64
        for i in range(0, len(points), BATCH):
            client.upsert(collection_name=TEXT_COLLECTION_NAME, points=points[i:i + BATCH])

        docs_indexed = len(chunks_by_doc)
        print(f"[text_qdrant] Indexed {len(points)} chunks from {docs_indexed} documents for media_uid={media_uid}")
        return {"indexed": len(points), "documents": docs_indexed}

    def search(self, query: str, limit: int = 20, allowed_uids=None) -> List[dict]:
        """Return [{audiofile_uid, document_path, media_uid, score}] sorted by score desc."""
        self.ensure_collection()
        client = self._get_client()
        try:
            embedding = text_service.embed(query)
            query_filter = (
                Filter(must=[FieldCondition(key="media_uid", match=MatchAny(any=allowed_uids))])
                if allowed_uids is not None else None
            )
            response = client.query_points(
                collection_name=TEXT_COLLECTION_NAME,
                query=embedding,
                limit=limit,
                with_payload=True,
                query_filter=query_filter,
            )
            return [
                {
                    "audiofile_uid": h.payload.get("audiofile_uid"),
                    "document_path": h.payload.get("document_path"),
                    "media_uid": h.payload.get("media_uid"),
                    "score": h.score,
                }
                for h in response.points
            ]
        except Exception as e:
            print(f"[text_qdrant] search failed: {e}")
            return []

    def collection_info(self) -> dict:
        client = self._get_client()
        try:
            info = client.get_collection(TEXT_COLLECTION_NAME)
            return {
                "name": TEXT_COLLECTION_NAME,
                "vectors_count": info.vectors_count,
                "points_count": info.points_count,
            }
        except Exception as e:
            return {"name": TEXT_COLLECTION_NAME, "error": str(e)}


text_qdrant_service = TextQdrantService()
