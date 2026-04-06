import os
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.environ.get("TEXT_MODEL", "all-MiniLM-L6-v2")


class TextService:
    def __init__(self):
        self._model: SentenceTransformer | None = None

    def _get_model(self) -> SentenceTransformer:
        if self._model is None:
            print(f"[text_service] Loading model: {MODEL_NAME}")
            self._model = SentenceTransformer(MODEL_NAME)
            print("[text_service] Model ready")
        return self._model

    def embed(self, text: str) -> list[float]:
        emb = self._get_model().encode([text], normalize_embeddings=True)
        return emb[0].tolist()


text_service = TextService()
