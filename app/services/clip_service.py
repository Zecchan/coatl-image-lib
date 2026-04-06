import io
import subprocess
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
        return self.embed_image_pil(image)

    def embed_image_pil(self, image) -> list:
        """Embed a PIL Image directly (avoids disk round-trip)."""
        img_tensor = self._preprocess(image).unsqueeze(0)
        with torch.no_grad():
            features = self._model.encode_image(img_tensor)
            features = features / features.norm(dim=-1, keepdim=True)
        return features[0].tolist()

    def extract_frames_ffmpeg(self, video_path: str, timestamps: list) -> list:
        """Extract frames at given timestamps from a video using ffmpeg.

        Frames are piped directly to PIL Image objects — no temp files on disk.
        Returns a list of PIL.Image (RGB). Skips timestamps where extraction fails.
        """
        images = []
        for t in timestamps:
            try:
                result = subprocess.run(
                    [
                        'ffmpeg', '-y',
                        '-ss', str(t),
                        '-i', video_path,
                        '-vframes', '1',
                        '-f', 'image2',
                        '-vcodec', 'png',
                        'pipe:1',
                    ],
                    capture_output=True,
                    timeout=15,
                )
                if result.returncode == 0 and result.stdout:
                    img = Image.open(io.BytesIO(result.stdout)).convert('RGB')
                    images.append(img)
                else:
                    print(f'[extract_frames] ffmpeg returncode={result.returncode} at t={t} for {video_path}')
                    if result.stderr:
                        print(f'[extract_frames] stderr: {result.stderr[-300:].decode(errors="replace")}')
            except Exception as e:
                print(f'[extract_frames] exception at t={t} for {video_path}: {e}')
                continue
        return images


clip_service = ClipService()
