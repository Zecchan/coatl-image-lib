# Coatl Image Library

A self-hosted local media library with AI-powered tagging, captioning, and semantic search.
Organises image collections, manga, games, and other media into a searchable catalogue backed by SQLite and Qdrant.

---

## What it does

- **Scan & index** — point it at a folder, preview its contents, tag and caption images automatically with WD14 and BLIP, then save the entry to your library
- **Browse** — paginated grid view with keyword search, field filters, content-rating filters, and mediatype filters
- **Semantic search (text)** — describe what you're looking for in plain English; CLIP finds visually similar collections
- **Semantic search (image)** — drag an image into the search box; CLIP finds collections with similar visual content
- **Media viewer** — full image viewer per collection with metadata, tags, and edit support

---

## Prerequisites

Install all of these before running `install.bat`:

| Tool | Purpose | Download |
|------|---------|----------|
| Python 3.10–3.11 | AI backend | https://python.org/downloads/ |
| Node.js 18+ | Web UI server | https://nodejs.org/ |
| Docker Desktop | Runs Qdrant for vector search | https://www.docker.com/products/docker-desktop/ |

> **GPU drivers:** Make sure your GPU drivers are up to date.
> DirectML works on any modern Windows GPU (AMD, Intel, NVIDIA).
> CUDA requires NVIDIA drivers 520+.

---

## Step 1 — Start Qdrant

Qdrant stores the image embeddings for semantic search.
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

   > CLIP (for semantic search) always runs on CPU via PyTorch regardless of this choice.

3. **Python API port** — default `8000`

4. **Web UI port** — default `3000`

5. **Start now?** — type `y` to launch immediately after install

What the installer does:
- Creates `.venv` and installs all Python dependencies
  (FastAPI, PyTorch, open_clip, BLIP, WD14, qdrant-client, and the selected ONNX Runtime backend)
- Writes your choices to `.env`
- Runs `npm install` for the Vue 3 / Express web UI

> **First-time model downloads:** WD14 (~600 MB) and BLIP (~900 MB) download from Hugging Face
> the first time you tag or caption an image. This happens on demand, not during install.

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
- **Qdrant** settings (host/port/collection) — defaults work with the Docker setup above

Then:

1. **Administration → Media Types** — create at least one type (e.g. "Image Collection")
2. **Administration → Media Sources** — register your root library folder

---

## Step 5 — Adding media

Click the folder icon in the navbar (**Add Media**):

1. Enter the path to a folder of images
2. Click **Preview** — samples up to 12 images and counts the total
3. Configure analysis options (tags, captions, embedding)
4. Fill in the metadata form (title, artist, tags, rating, …)
5. Check **Move content** if you want the folder moved into your library root (otherwise copied)
6. Click **Save Entry**

Images are embedded into Qdrant automatically in the background.
The media's detail page shows an **Embedded** date once indexing completes (~1 min per 200 images).

---

## Searching

On the home page, switch modes using the toggle in the search bar:

| Mode | Description |
|------|-------------|
| **Keyword** | Full-text search across title, artist, series, tags, and other fields. Supports `field:value`, `$tag`, `-$tag` syntax. |
| **Semantic → Text** | Describe what you're looking for in plain English. CLIP finds visually similar collections. |
| **Semantic → Image** | Drop or pick any image. CLIP finds collections with similar content. The image is resized to ≤512 px client-side before sending. |

Each semantic result shows a **similarity score** (0–100%) on the card.

> Collections must be indexed before they appear in semantic results.
> To re-index a collection after adding images, open its media page → **Edit → Re-embed images**.

---

## Notes

- **BLIP and WD14** model weights download from Hugging Face on first use, then cache locally
- **CLIP** runs on CPU via PyTorch — no ONNX export, no one-time setup delay
- **Editing a media entry** (title, artist, tags, etc.) never moves or renames files on disk
- **Qdrant data** persists in a Docker named volume (`qdrant_storage`) across container restarts
- Closing the terminal windows frees all GPU/RAM used by models
