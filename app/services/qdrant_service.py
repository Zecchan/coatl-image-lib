import io
import json as _json
import math
import os
import random
import subprocess
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

    def index_media(self, media_uid: str, image_paths: List[str], max_images: int = None) -> int:
        """Embed up to max_images images and upsert into Qdrant.
        
        Points are identified by a deterministic integer ID derived from
        (media_uid, image index) so re-indexing is idempotent.
        Returns the number of images indexed.
        """
        self.ensure_collection()
        client = self._get_client()
        limit = max_images if max_images else MAX_IMAGES_PER_MEDIA

        # Sample if too many images
        if len(image_paths) > limit:
            image_paths = random.sample(image_paths, limit)

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

    def search_by_text(self, text: str, limit: int = 20, allowed_uids=None) -> List[dict]:
        """Embed text query and search Qdrant."""
        self.ensure_collection()
        query_vector = clip_service.embed_text(text)
        return self.search_by_vector(query_vector, limit, allowed_uids)

    def search_by_image(self, pil_image, limit: int = 20, allowed_uids=None) -> List[dict]:
        """Embed a PIL image and search Qdrant."""
        self.ensure_collection()
        query_vector = clip_service.embed_image_pil(pil_image)
        return self.search_by_vector(query_vector, limit, allowed_uids)

    def search_by_vector(self, query_vector: List[float], limit: int = 20, allowed_uids=None) -> List[dict]:
        """Run a Qdrant nearest-neighbour search and group results by media_uid."""
        client = self._get_client()

        query_filter = (
            Filter(must=[FieldCondition(key="media_uid", match=MatchAny(any=allowed_uids))])
            if allowed_uids is not None else None
        )

        # Fetch limit*10 candidates then group by media_uid in Python
        response = client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            limit=limit * 10,
            with_payload=True,
            query_filter=query_filter,
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

    def index_video_media(self, media_uid: str, video_paths: List[str], max_images: int = None) -> int:
        """Extract frames from videos and index their CLIP embeddings into Qdrant.

        Strategy: at least 1 frame per video, distributing the total budget of
        max_images across all videos evenly (ceil division).
        Timestamps are evenly spaced across 10%–90% of each video's duration.
        """
        self.ensure_collection()
        client = self._get_client()
        limit = max_images if max_images else MAX_IMAGES_PER_MEDIA

        client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="media_uid", match=MatchValue(value=media_uid))]
                )
            ),
        )

        n_videos = len(video_paths)
        if not n_videos:
            return 0

        frames_per_video = max(1, math.ceil(limit / n_videos))

        points: List[PointStruct] = []
        point_idx = 0

        for vid_path in video_paths:
            try:
                r = subprocess.run(
                    ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', vid_path],
                    capture_output=True, text=True, timeout=10,
                )
                data = _json.loads(r.stdout)
                stream = next(
                    (s for s in data.get('streams', []) if s.get('codec_type') == 'video'),
                    data['streams'][0] if data.get('streams') else None,
                )
                # Prefer stream-level duration; fall back to container format duration
                raw_dur = (stream or {}).get('duration') or data.get('format', {}).get('duration')
                duration = float(raw_dur) if raw_dur else 0.0
            except Exception as e:
                print(f'[index_video] ffprobe failed for {vid_path}: {e}')
                duration = 0.0

            if duration <= 0:
                print(f'[index_video] skipping (no duration): {vid_path}')
                continue

            range_start = duration * 0.1
            range_end   = duration * 0.9
            timestamps = [
                range_start + (range_end - range_start) * ((i + 0.5) / frames_per_video)
                for i in range(frames_per_video)
            ]

            frames = clip_service.extract_frames_ffmpeg(vid_path, timestamps)
            print(f'[index_video] {vid_path}: duration={duration:.1f}s, {len(timestamps)} timestamps, {len(frames)} frames extracted')
            for frame in frames:
                try:
                    embedding = clip_service.embed_image_pil(frame)
                except Exception as e:
                    print(f'[index_video] embed failed: {e}')
                    continue

                point_id = abs(hash(f"{media_uid}::v{point_idx}")) % (2**63)
                points.append(PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={"media_uid": media_uid, "video_path": vid_path},
                ))
                point_idx += 1

        if points:
            client.upsert(collection_name=COLLECTION_NAME, points=points)

        return len(points)

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
