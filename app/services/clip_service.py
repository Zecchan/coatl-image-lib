import os
import torch
import open_clip
import numpy as np
from PIL import Image
from torchvision import transforms
import onnxruntime as ort

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models", "clip")
VISUAL_PATH = os.path.join(MODEL_DIR, "clip_visual.onnx")
TEXT_PATH = os.path.join(MODEL_DIR, "clip_text.onnx")

_EP_ENV = os.environ.get("ORT_PROVIDER", "dml").lower()
if _EP_ENV == "cuda":
    PROVIDERS = ["CUDAExecutionProvider", "CPUExecutionProvider"]
elif _EP_ENV == "cpu":
    PROVIDERS = ["CPUExecutionProvider"]
else:  # dml (default)
    PROVIDERS = ["DmlExecutionProvider", "CPUExecutionProvider"]

CLIP_PREPROCESS = transforms.Compose([
    transforms.Resize(224, interpolation=transforms.InterpolationMode.BICUBIC),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=(0.48145466, 0.4578275, 0.40821073),
        std=(0.26862954, 0.26130258, 0.27577711),
    ),
])


class _TextWrapper(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self._model = model

    def forward(self, text):
        return self._model.encode_text(text)


def _export_if_needed():
    if os.path.exists(VISUAL_PATH) and os.path.exists(TEXT_PATH):
        return

    os.makedirs(MODEL_DIR, exist_ok=True)
    print("Exporting CLIP to ONNX (one-time setup, may take a minute)...")

    model, _, _ = open_clip.create_model_and_transforms("ViT-B-32", pretrained="openai")
    model.eval()

    with torch.no_grad():
        if not os.path.exists(VISUAL_PATH):
            dummy_img = torch.zeros(1, 3, 224, 224)
            torch.onnx.export(
                model.visual,
                dummy_img,
                VISUAL_PATH,
                input_names=["pixel_values"],
                output_names=["image_features"],
                dynamic_axes={"pixel_values": {0: "batch"}, "image_features": {0: "batch"}},
                opset_version=18,
            )

        if not os.path.exists(TEXT_PATH):
            dummy_text = torch.zeros(1, 77, dtype=torch.long)
            wrapper = _TextWrapper(model)
            wrapper.eval()
            torch.onnx.export(
                wrapper,
                dummy_text,
                TEXT_PATH,
                input_names=["input_ids"],
                output_names=["text_features"],
                dynamic_axes={"input_ids": {0: "batch"}, "text_features": {0: "batch"}},
                opset_version=18,
            )

    print("ONNX export complete.")


class ClipService:
    def __init__(self):
        _export_if_needed()
        self.tokenizer = open_clip.get_tokenizer("ViT-B-32")
        self._visual = ort.InferenceSession(VISUAL_PATH, providers=PROVIDERS)
        self._text = ort.InferenceSession(TEXT_PATH, providers=PROVIDERS)
        print(f"[CLIP] visual providers: {self._visual.get_providers()}")
        print(f"[CLIP] text providers:   {self._text.get_providers()}")

    def embed_text(self, text: str):
        tokens = self.tokenizer([text]).numpy().astype(np.int64)
        features = self._text.run(None, {"input_ids": tokens})[0]
        features = features / np.linalg.norm(features, axis=-1, keepdims=True)
        return features[0].tolist()

    def embed_image(self, image_path: str):
        image = Image.open(image_path).convert("RGB")
        img_tensor = CLIP_PREPROCESS(image).unsqueeze(0).numpy()
        features = self._visual.run(None, {"pixel_values": img_tensor})[0]
        features = features / np.linalg.norm(features, axis=-1, keepdims=True)
        return features[0].tolist()


clip_service = ClipService()
