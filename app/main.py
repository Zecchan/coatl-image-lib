from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.models import TextRequest, ImageRequest, TagRequest, AnalyzeRequest, IndexRequest, SearchRequest, ImageSearchRequest, VideoIndexRequest, LyricsIndexRequest, TextSearchRequest
from app.services.clip_service import clip_service
from app.services.image_service import analyze_image
from app.services.caption_service import caption_service
from app.services.tag_service import tag_service
from app.services.qdrant_service import qdrant_service
from app.services.text_qdrant_service import text_qdrant_service
import numpy as np

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# INDEX MEDIA IMAGES INTO QDRANT
@app.post("/index_media")
def index_media(req: IndexRequest):
    count = qdrant_service.index_media(req.media_uid, req.image_paths)
    return {"indexed": count, "media_uid": req.media_uid}


# INDEX VIDEO COLLECTION INTO QDRANT (extracts frames via ffmpeg internally)
@app.post("/index_video")
def index_video(req: VideoIndexRequest):
    count = qdrant_service.index_video_media(req.media_uid, req.video_paths)
    return {"indexed": count, "media_uid": req.media_uid}


# REMOVE MEDIA FROM QDRANT
@app.delete("/index_media/{media_uid}")
def delete_index(media_uid: str):
    qdrant_service.delete_media(media_uid)
    return {"deleted": True, "media_uid": media_uid}


# SEMANTIC TEXT SEARCH
@app.post("/search_images")
def search_images(req: SearchRequest):
    hits = qdrant_service.search_by_text(req.text, req.limit, req.allowed_uids)
    return {"results": hits}


# SEMANTIC IMAGE SEARCH
@app.post("/search_by_image")
def search_by_image(req: ImageSearchRequest):
    import base64, io
    from PIL import Image
    try:
        data = base64.b64decode(req.image_base64)
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")
    hits = qdrant_service.search_by_image(image, req.limit, req.allowed_uids)
    return {"results": hits}


# QDRANT COLLECTION STATUS
@app.get("/qdrant_status")
def qdrant_status():
    return qdrant_service.collection_info()


# INDEX LYRICS / TEXT INTO TEXT QDRANT
@app.post("/index_lyrics")
def index_lyrics(req: LyricsIndexRequest):
    ok = text_qdrant_service.index_lyrics(req.audiofile_uid, req.media_uid, req.text)
    return {"ok": ok}


# REMOVE A SINGLE AUDIOFILE'S TEXT POINT FROM QDRANT
@app.delete("/index_text/{audiofile_uid}")
def delete_text(audiofile_uid: str):
    text_qdrant_service.delete_text(audiofile_uid)
    return {"deleted": True, "audiofile_uid": audiofile_uid}


# REMOVE ALL TEXT POINTS FOR A MEDIA (e.g. music collection deleted)
@app.delete("/index_text_media/{media_uid}")
def delete_text_media(media_uid: str):
    text_qdrant_service.delete_by_media(media_uid)
    return {"deleted": True, "media_uid": media_uid}


# SEMANTIC TEXT SEARCH (lyrics / text)
@app.post("/search_text")
def search_text(req: TextSearchRequest):
    hits = text_qdrant_service.search(req.text, req.limit, req.allowed_uids)
    return {"results": hits}


# TEXT QDRANT COLLECTION STATUS
@app.get("/text_qdrant_status")
def text_qdrant_status():
    return text_qdrant_service.collection_info()
