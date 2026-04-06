from transformers import BlipProcessor, BlipForConditionalGeneration
from PIL import Image


class CaptionService:
    def __init__(self):
        self.processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
        self.model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")
        self.model.eval()

    def caption(self, image_path: str) -> str:
        image = Image.open(image_path).convert("RGB")
        inputs = self.processor(image, return_tensors="pt")
        output = self.model.generate(**inputs, max_new_tokens=64)
        return self.processor.decode(output[0], skip_special_tokens=True)


caption_service = CaptionService()
