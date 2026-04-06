import torch
import open_clip
from PIL import Image


class ClipService:
    def __init__(self):
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            'ViT-B-32', pretrained='openai'
        )
        self.tokenizer = open_clip.get_tokenizer('ViT-B-32')
        self.model.eval()

    def embed_text(self, text: str):
        with torch.no_grad():
            tokens = self.tokenizer([text])
            features = self.model.encode_text(tokens)
            features /= features.norm(dim=-1, keepdim=True)
            return features[0].cpu().numpy().tolist()

    def embed_image(self, image_path: str):
        image = Image.open(image_path).convert("RGB")

        with torch.no_grad():
            image_tensor = self.preprocess(image).unsqueeze(0)
            features = self.model.encode_image(image_tensor)
            features /= features.norm(dim=-1, keepdim=True)
            return features[0].cpu().numpy().tolist()


clip_service = ClipService()
