from PIL import Image
import imagehash
import hashlib


def analyze_image(path: str):
    img = Image.open(path).convert("RGB")

    phash = str(imagehash.phash(img))
    dhash = str(imagehash.dhash(img))
    ahash = str(imagehash.average_hash(img))

    with open(path, "rb") as f:
        sha256 = hashlib.sha256(f.read()).hexdigest()

    return {
        "path": path,
        "width": img.width,
        "height": img.height,
        "phash": phash,
        "dhash": dhash,
        "ahash": ahash,
        "sha256": sha256,
    }
