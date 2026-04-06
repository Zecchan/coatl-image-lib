# Coatl Image Library

A local image library with AI-powered semantic search, tagging, and captioning.
Consists of a Python FastAPI backend (CLIP, WD14, BLIP) and a Vue 3 web UI served by Node.js/Express.

---

## Prerequisites

Install these before running `install.bat`:

| Tool | Download |
|------|----------|
| Python 3.10–3.11 | https://www.python.org/downloads/ |
| Node.js 18+ | https://nodejs.org/ |
| Qdrant *(optional, for vector search)* | https://qdrant.tech/documentation/quick-start/ |

> **AMD GPU users:** DirectML is selected by default during install and requires Windows 10 1903+ with up-to-date drivers.

---

## Installation

```bat
install.bat
```

The installer will:
1. Create a Python virtual environment (`.venv`)
2. Install all Python dependencies (PyTorch, CLIP, BLIP, WD14, FastAPI, …)
3. Ask which GPU backend to use: **DirectML** (AMD/Intel), **CUDA** (NVIDIA), or **CPU**
4. Ask for API and UI port numbers (defaults: `8000` and `3000`)
5. Install Node.js dependencies for the web UI
6. Optionally start the service immediately

Settings are saved to `.env` (gitignored).

---

## Running

```bat
start.bat
```

Opens two terminal windows:
- **Coatl API** — Python FastAPI on `http://127.0.0.1:{API_PORT}`
- **Coatl UI** — Vue 3 + Vite dev server on `http://127.0.0.1:{UI_PORT}`

The browser opens automatically.

To stop: close both terminal windows.

---

## API Endpoints

Base URL: `http://127.0.0.1:8000`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/embed_text` | Text → CLIP embedding |
| POST | `/embed_image` | Image path → CLIP embedding |
| POST | `/caption` | Image path → BLIP text caption |
| POST | `/tag` | Image path → WD14 Danbooru tags |
| POST | `/analyze` | Multiple image paths → hashes + averaged embedding |

### Example payloads

**`/embed_text`**
```json
{ "text": "blue hair anime girl" }
```

**`/embed_image`** and **`/caption`** and **`/tag`**
```json
{ "image_path": "D:/images/photo.jpg" }
```

**`/tag`** (optional threshold, default 0.35)
```json
{ "image_path": "D:/images/photo.jpg", "threshold": 0.4 }
```

**`/analyze`**
```json
{
  "folder_path": "D:/images",
  "images": ["D:/images/1.jpg", "D:/images/2.jpg"]
}
```

> Use forward slashes (`D:/images/`) or escaped backslashes (`D:\\images\\`) in paths.
> All paths must be absolute.

Interactive docs (Swagger UI): `http://127.0.0.1:8000/docs`

---

## Web UI

| Page | URL | Description |
|------|-----|-------------|
| Library | `/` | Image grid with semantic search |
| Administration | `/admin` | Management tools |
| Server Config | `/serverconfig` | Database and site settings |

### Server Configuration

Saved to `ui/serverconfig.json` (gitignored — local only).

- **Site title** — displayed in the navbar
- **SQLite path** — where the image metadata database is stored
- **Qdrant** — host, port, and collection name for vector search

---

## Notes

- **First startup is slow** — CLIP exports to ONNX on first run (~1 min), then loads into GPU memory
- **Subsequent requests are fast** — ONNX models stay loaded while the API window is open
- **BLIP and WD14** download their weights (~900 MB + ~600 MB) from Hugging Face on first use, then cache locally
- Closing the terminal windows frees all GPU/RAM memory
