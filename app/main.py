from fastapi import FastAPI
from app.models import TextRequest, ImageRequest, TagRequest, AnalyzeRequest
from app.services.clip_service import clip_service
from app.services.image_service import analyze_image
from app.services.caption_service import caption_service
from app.services.tag_service import tag_service
import numpy as np

app = FastAPI()


@app.get("/")
def root():
    return {"status": "ok"}


# TEXT → EMBEDDING
@app.post("/embed_text")
def embed_text(req: TextRequest):
    embedding = clip_service.embed_text(req.text)
    return {"embedding": embedding}


# IMAGE → EMBEDDING
@app.post("/embed_image")
def embed_image(req: ImageRequest):
    embedding = clip_service.embed_image(req.image_path)
    return {"embedding": embedding}


# IMAGE → CAPTION (TEXT DESCRIPTION)
@app.post("/caption")
def caption(req: ImageRequest):
    text = caption_service.caption(req.image_path)
    return {"caption": text}


# IMAGE → DANBOORU TAGS
@app.post("/tag")
def tag(req: TagRequest):
    result = tag_service.tag(req.image_path, req.threshold)
    return result


# MULTI IMAGE ANALYSIS
@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    results = []
    embeddings = []

    for path in req.images:
        data = analyze_image(path)
        emb = clip_service.embed_image(path)

        embeddings.append(emb)
        results.append(data)

    folder_embedding = np.mean(embeddings, axis=0).tolist()

    return {
        "images": results,
        "embedding": folder_embedding,
    }
