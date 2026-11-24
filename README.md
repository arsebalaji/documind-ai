# DocuMind AI Pro
A local-first document Q&A application built with React/TypeScript, FastAPI, Ollama, and SQLite.

## 1. Prerequisites (Windows)
Install Python 3.12, Node.js 22 LTS, VS Code and Ollama for Windows from their official sites. Ensure `python --version`, `node --version`, `npm.cmd --version`, and `ollama --version` work in PowerShell. Model downloads require internet and sufficient RAM/disk; 8–16 GB RAM is a useful starting point, but speed varies. No paid API keys needed.

## 2. Setup
Open the project in VS Code and use its PowerShell terminal:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

## 3. Run the application (two terminals)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```
Open http://localhost:5173. Backend docs: http://127.0.0.1:8000/docs. The start script launches the backend in a separate process and the frontend in the current terminal.

## 4. Features and first run
Upload a text-based PDF, TXT, or Markdown file in **Documents**. Then try **Search** to find relevant passages, **AI conversations** for answers grounded in those passages, **Agents** for a bounded research or summarization workflow, or **Evaluation** to inspect retrieval and citation signals. **Settings** shows Ollama connectivity and lets you select an installed model. Answers and model quality can vary.

The backend uses local BM25-style full-text ranking over SQLite-stored document chunks and the Ollama chat API. It does not currently use vector embeddings. Scanned PDFs require OCR, which is not included.

## 5. Build verification
From root:
```powershell
cd backend
..\.venv\Scripts\python.exe -m py_compile app\main.py
```
From root in another terminal:
```powershell
cd frontend
npm.cmd run build
```
The backend currently has no automated test suite. Evaluation runs are diagnostic signals, not proof of answer factuality.

## 6. Design choices and limits
- SQLite stores documents, chunks, conversations, and evaluation history. Retrieval uses local lexical ranking and is intended for small educational collections, not large-scale search.
- The research and summarization workflows are bounded to local document retrieval and a configured Ollama model; there is no unrestricted autonomy.
- Citations point to retrieved passages and do not guarantee factual entailment. Scanned PDFs need external OCR. Raw uploads and extracted text are retained locally.
- This is a local educational reference, not hardened production software. Do not deploy it publicly without security, resource-limit and privacy review. No Docker configuration is included.
- Uploaded files and the SQLite database are stored under `data/` and excluded from source control. The database is created at `data/documents.db`. No AI model weights are bundled.

## Documentation
- [API](docs/API.md)
