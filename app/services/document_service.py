"""Text extraction and chunking for document collection indexing."""

import os
from typing import List

SUPPORTED_EXTS = {'.txt', '.md', '.rst', '.docx', '.pdf'}


def extract_text(abs_path: str) -> str:
    """Extract plain text from a document file. Returns empty string on failure."""
    ext = os.path.splitext(abs_path)[1].lower()
    try:
        if ext in ('.txt', '.md', '.rst'):
            with open(abs_path, encoding='utf-8', errors='replace') as f:
                return f.read()
        elif ext == '.docx':
            import docx
            doc = docx.Document(abs_path)
            return '\n'.join(p.text for p in doc.paragraphs)
        elif ext == '.pdf':
            import fitz  # PyMuPDF
            doc = fitz.open(abs_path)
            pages = [page.get_text() for page in doc]
            doc.close()
            return '\n'.join(pages)
    except Exception as e:
        print(f'[document_service] extract_text failed for {abs_path}: {e}')
    return ''


def chunk_text(text: str, chunk_size: int = 200) -> List[str]:
    """Split text into chunks of approximately chunk_size words."""
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunk = ' '.join(words[i:i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
    return chunks
