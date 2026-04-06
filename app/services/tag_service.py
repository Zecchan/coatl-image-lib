import numpy as np
import pandas as pd
from PIL import Image
from huggingface_hub import hf_hub_download
import onnxruntime as ort

MODEL_REPO = "SmilingWolf/wd-vit-tagger-v3"
TARGET_SIZE = 448
DEFAULT_THRESHOLD = 0.35

# Tag categories in selected_tags.csv
CATEGORY_RATING = 9
CATEGORY_GENERAL = 0
CATEGORY_CHARACTER = 4


class TagService:
    def __init__(self):
        model_path = hf_hub_download(MODEL_REPO, "model.onnx")
        tags_path = hf_hub_download(MODEL_REPO, "selected_tags.csv")

        self.session = ort.InferenceSession(
            model_path,
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        self.input_name = self.session.get_inputs()[0].name
        self.tags_df = pd.read_csv(tags_path)

    def _prepare_image(self, image_path: str) -> np.ndarray:
        image = Image.open(image_path).convert("RGB")

        # Pad to square with white background
        size = max(image.size)
        canvas = Image.new("RGB", (size, size), (255, 255, 255))
        canvas.paste(image, ((size - image.width) // 2, (size - image.height) // 2))

        canvas = canvas.resize((TARGET_SIZE, TARGET_SIZE), Image.BICUBIC)
        img_array = np.array(canvas, dtype=np.float32)
        return np.expand_dims(img_array, axis=0)

    def tag(self, image_path: str, threshold: float = DEFAULT_THRESHOLD) -> dict:
        img = self._prepare_image(image_path)
        scores = self.session.run(None, {self.input_name: img})[0][0]

        tag_names = self.tags_df["name"].tolist()
        categories = self.tags_df["category"].tolist()

        general_tags = []
        character_tags = []
        ratings = {}

        for tag, score, category in zip(tag_names, scores, categories):
            if category == CATEGORY_RATING:
                ratings[tag] = round(float(score), 4)
            elif score >= threshold:
                entry = {"tag": tag, "score": round(float(score), 4)}
                if category == CATEGORY_CHARACTER:
                    character_tags.append(entry)
                else:
                    general_tags.append(entry)

        general_tags.sort(key=lambda x: x["score"], reverse=True)
        character_tags.sort(key=lambda x: x["score"], reverse=True)

        return {
            "general": general_tags,
            "characters": character_tags,
            "ratings": ratings,
        }


tag_service = TagService()
