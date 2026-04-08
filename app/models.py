from pydantic import BaseModel
from typing import List, Optional


class TextRequest(BaseModel):
    text: str


class ImageRequest(BaseModel):
    image_path: str


class TagRequest(BaseModel):
    image_path: str
    threshold: Optional[float] = 0.35


class AnalyzeRequest(BaseModel):
    folder_path: str
    images: List[str]


class IndexRequest(BaseModel):
    media_uid: str
    image_paths: List[str]
    max_images: Optional[int] = None


class SearchRequest(BaseModel):
    text: str
    limit: Optional[int] = 20
    allowed_uids: Optional[List[str]] = None


class ImageSearchRequest(BaseModel):
    image_base64: str
    limit: Optional[int] = 20
    allowed_uids: Optional[List[str]] = None


class VideoIndexRequest(BaseModel):
    media_uid: str
    video_paths: List[str]
    max_images: Optional[int] = None


class LyricsIndexRequest(BaseModel):
    audiofile_uid: str
    media_uid: str
    text: str


class DocumentFileInfo(BaseModel):
    abs_path: str
    rel_path: str


class DocumentIndexRequest(BaseModel):
    media_uid: str
    documents: List[DocumentFileInfo]
    chunk_size: Optional[int] = 200
    max_chunks: Optional[int] = 500


class TextSearchRequest(BaseModel):
    text: str
    limit: Optional[int] = 20
    allowed_uids: Optional[List[str]] = None
