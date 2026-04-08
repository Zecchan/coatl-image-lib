# Coatl Image Library

A self-hosted local media library with AI-powered tagging, captioning, and semantic search.
Organises image collections, video collections, music libraries, and document archives into a searchable catalogue backed by SQLite and Qdrant.

---

## What it does

- **Scan & index** — point it at a folder, preview its contents, tag and caption images automatically with WD14 and BLIP, then save the entry to your library
- **Browse** — paginated grid view with keyword search, field filters, content-rating filters, and mediatype filters
- **Semantic search (text → image)** — describe what you're looking for in plain English; CLIP finds visually similar collections
- **Semantic search (text → documents/lyrics)** — the same query also searches embedded document text and track lyrics using MiniLM; both result sets are merged and ranked by similarity score
- **Semantic search (image)** — drag an image into the search box; CLIP finds collections with similar visual content
- **Media viewer** — per-collection viewer for images, videos, audio tracks, and documents with metadata, tags, and edit support

---

## Supported media types

| Type | What it stores | How it is indexed |
|------|---------------|-------------------|
| **Image Collection** | Folder of images (JPEG, PNG, WEBP, GIF, …) | CLIP embeddings + BLIP captions + WD14 tags |
| **Video Collection** | Folder of video files (MP4, MKV, WebM, …) | CLIP embeddings from sampled ffmpeg frames |
| **Music Collection** | Folder of audio files (MP3, FLAC, OGG, …) | Track list populated from filenames; lyrics embedded with MiniLM for text search |
| **Document Collection** | Folder of text documents (.txt, .md, .rst, .docx, .pdf) | Text extracted, chunked (~200 words), embedded with MiniLM for text search |

---

## Prerequisites

Install all of these before running `install.bat`:

| Tool | Purpose | Download |
|------|---------|----------|
| Python 3.10–3.11 | AI backend | https://python.org/downloads/ |
| Node.js 18+ | Web UI server | https://nodejs.org/ |
| Docker Desktop | Runs Qdrant for vector search | https://www.docker.com/products/docker-desktop/ |
| ffmpeg + ffprobe | Video frame extraction and duration detection | https://ffmpeg.org/download.html |

> **GPU drivers:** Make sure your GPU drivers are up to date.
> DirectML works on any modern Windows GPU (AMD, Intel, NVIDIA).
> CUDA requires NVIDIA drivers 520+.

---

## Step 1 — Start Qdrant

Qdrant stores both the image/video embeddings (CLIP, 512-dim) and text embeddings (MiniLM, 384-dim) used for semantic search.
Run this once in **PowerShell** or **Command Prompt** — Docker will keep it running across reboots.

```powershell
docker pull qdrant/qdrant:latest

docker run -d `
  --name qdrant `
  --restart unless-stopped `
  -p 6333:6333 `
  -v qdrant_storage:/qdrant/storage `
  qdrant/qdrant:latest
```

Verify it is running:

```powershell
docker ps
# The PORTS column must show: 0.0.0.0:6333->6333/tcp

Invoke-RestMethod http://localhost:6333
# Returns JSON with "title": "qdrant - vector search engine"
```

> After the initial setup, Docker Desktop starts Qdrant automatically when Windows boots
> (if Docker's **Start on login** option is enabled).

---

## Step 2 — Install

Double-click **`install.bat`** or run it from a terminal.

The installer will ask:

1. **Recreate `.venv`?** — only shown if a virtual environment already exists.
   Press Enter to keep it, type `y` to start fresh.

2. **GPU backend** — used by the WD14 image tagger:
   - `1` **DirectML** *(default)* — any Windows GPU (AMD Radeon, Intel Arc, NVIDIA)
   - `2` **CUDA** — NVIDIA only, slightly faster
   - `3` **CPU** — no GPU required, slowest

   > CLIP (for image semantic search) and MiniLM (for text/lyrics/document search) always run on CPU via PyTorch regardless of this choice.

3. **Python API port** — default `8000`

4. **Web UI port** — default `3000`

5. **Start now?** — type `y` to launch immediately after install

What the installer does:
- Creates `.venv` and installs all Python dependencies
  (FastAPI, PyTorch, open_clip, BLIP, WD14, qdrant-client, sentence-transformers, and the selected ONNX Runtime backend)
- Writes your choices to `.env`
- Runs `npm install` for the Vue 3 / Express web UI

> **First-time model downloads:** WD14 (~600 MB) and BLIP (~900 MB) download from Hugging Face
> the first time you tag or caption an image. MiniLM (~90 MB) downloads the first time a text
> search or document/lyrics index runs. All downloads happen on demand, not during install.

---

## Step 3 — Run

Double-click **`start.bat`** or run it from a terminal.

This opens two terminal windows:

| Window | Default address |
|--------|-----------------|
| **Coatl API** — Python FastAPI | `http://127.0.0.1:8000` |
| **Coatl UI** — Node.js + Vite | `http://127.0.0.1:3000` |

The browser opens automatically. **To stop:** close both terminal windows.

---

## Step 4 — First-time configuration

Go to **Administration → Server Configuration** and set:

- **Site name** — displayed in the navbar
- **SQLite path** — where the catalogue database is stored (default: `ui/data/coatl.db`)
- **Qdrant** settings (host/port/collection names) — defaults work with the Docker setup above
- **Image Embedding Limit** — maximum images indexed per image collection (default: 200)
- **Text Chunk Limit** — maximum text chunks embedded per document collection (default: 500)

Then:

1. **Administration → Media Types** — create at least one type (Image Collection, Video Collection, Music Collection, or Document Collection)
2. **Administration → Media Sources** — register your root library folder and assign it a media type

---

## Step 5 — Adding media

Click the folder icon in the navbar (**Add Media**):

1. Select the media source (which determines the type)
2. Enter the path to a folder
3. Click **Preview** — scans the folder and shows a sample of its contents
4. For image/video collections: fill in the metadata form (title, artist, tags, rating, …) and optionally run WD14 analysis on the preview samples
5. Check **Move content** if you want the folder moved into your library root (otherwise copied)
6. Click **Save Entry**

**Per type, after saving:**
- *Image Collection* — CLIP embeddings generated in the background (~1 min per 200 images)
- *Video Collection* — frames extracted with ffmpeg, then CLIP-embedded
- *Music Collection* — audio files registered as tracks; add lyrics per-track to enable text search
- *Document Collection* — text extracted from all files, chunked, and embedded with MiniLM; budget distributed proportionally across documents

The media's detail page shows an **Embedded** date once indexing completes.
To re-index an existing collection, open its media page → **Edit → Re-embed images / videos / documents**.

---

## Searching

On the home page, switch modes using the toggle in the search bar:

| Mode | Description |
|------|-------------|
| **Keyword** | Full-text search across title, artist, series, tags, and other fields. Supports `field:value`, `$tag`, `-$tag` syntax. |
| **Semantic → Text** | Describe what you're looking for in plain English. Searches both visual collections (CLIP) and text collections (MiniLM — lyrics and document chunks). Results from both are merged and ranked by cosine similarity score descending. |
| **Semantic → Image** | Drop or pick any image. CLIP finds collections with similar visual content. The image is resized to ≤512 px client-side before sending. |

Each semantic result shows a **similarity score** (0–100%) and, for music/document matches, the best-matching track title or document filename.

> Collections must be indexed before they appear in semantic results.
> To re-index a collection, open its media page → **Edit → Re-embed images / videos / documents**.

---

## Document viewer

Clicking a document row in a Document Collection opens a preview dialog:

| Format | Behaviour |
|--------|-----------|
| PDF | Displayed inline using the browser's native PDF viewer |
| .txt / .md / .rst | Displayed in a scrollable reader with serif font |
| .docx | Downloaded immediately |

---

## Notes

- **BLIP and WD14** model weights download from Hugging Face on first use, then cache locally
- **CLIP** and **MiniLM** run on CPU via PyTorch — no ONNX export, no one-time setup delay
- **Editing a media entry** (title, artist, tags, etc.) never moves or renames files on disk
- **Qdrant data** persists in a Docker named volume (`qdrant_storage`) across container restarts
- **Large folder copies** run asynchronously — other operations such as search remain responsive during the copy
- Closing the terminal windows frees all GPU/RAM used by models
