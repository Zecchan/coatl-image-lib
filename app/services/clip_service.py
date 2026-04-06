import torch
import open_clip
import numpy as np
from PIL import Image


class ClipService:
    def __init__(self):
        print("[CLIP] Loading ViT-B-32 via open_clip (CPU)...")
        self._model, _, self._preprocess = open_clip.create_model_and_transforms(
            "ViT-B-32", pretrained="openai"
        )
        self._model.eval()
        self._tokenizer = open_clip.get_tokenizer("ViT-B-32")
        print("[CLIP] Ready.")

    def embed_text(self, text: str) -> list:
        tokens = self._tokenizer([text])
        with torch.no_grad():
            features = self._model.encode_text(tokens)
            features = features / features.norm(dim=-1, keepdim=True)
        return features[0].tolist()

    def embed_image(self, image_path: str) -> list:
        image = Image.open(image_path).convert("RGB")
        img_tensor = self._preprocess(image).unsqueeze(0)
        with torch.no_grad():
            features = self._model.encode_image(img_tensor)
            features = features / features.norm(dim=-1, keepdim=True)
        return features[0].tolist()


clip_service = ClipService()
