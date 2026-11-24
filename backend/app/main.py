import json
import math
import os
import re
import sqlite3
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2] / 'data'
UPLOADS = ROOT / 'uploads'
UPLOADS.mkdir(parents=True, exist_ok=True)
DB = ROOT / 'documents.db'
LIMIT = 20 * 1024 * 1024
OLLAMA_URL = os.getenv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434').rstrip('/')
DEFAULT_MODEL = os.getenv('OLLAMA_CHAT_MODEL', 'llama3.2:3b')
TOKEN_RE = re.compile(r'[\w-]+', re.UNICODE)
CHUNK_SIZE = 900
CHUNK_OVERLAP = 120


def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    return db


def initialize_db():
    with connect() as db:
        db.execute('CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT, size INTEGER, pages INTEGER, text TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)')
        db.execute('CREATE TABLE IF NOT EXISTS document_chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT NOT NULL, ordinal INTEGER NOT NULL, text TEXT NOT NULL, UNIQUE(document_id, ordinal))')
        db.execute('CREATE INDEX IF NOT EXISTS chunks_document_idx ON document_chunks(document_id)')
        db.execute('CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)')
        db.execute('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, citations TEXT NOT NULL DEFAULT "[]", created TEXT DEFAULT CURRENT_TIMESTAMP)')
        db.execute('CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, id)')
        db.execute('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL, answer TEXT NOT NULL, retrieved INTEGER NOT NULL, cited INTEGER NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP)')
        old_documents = db.execute('SELECT id,text FROM documents WHERE NOT EXISTS (SELECT 1 FROM document_chunks WHERE document_chunks.document_id=documents.id)').fetchall()
        for document in old_documents:
            save_chunks(db, document['id'], document['text'])


def split_chunks(text: str) -> list[str]:
    cleaned = text.strip()
    if not cleaned:
        return []
    chunks = []
    start = 0
    while start < len(cleaned):
        end = min(start + CHUNK_SIZE, len(cleaned))
        if end < len(cleaned):
            boundary = max(cleaned.rfind('\n', start + CHUNK_SIZE // 2, end), cleaned.rfind('. ', start + CHUNK_SIZE // 2, end))
            if boundary > start:
                end = boundary + 1
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == len(cleaned):
            break
        start = max(start + 1, end - CHUNK_OVERLAP)
    return chunks


def save_chunks(db: sqlite3.Connection, document_id: str, text: str):
    db.executemany(
        'INSERT OR IGNORE INTO document_chunks(document_id,ordinal,text) VALUES(?,?,?)',
        [(document_id, index, chunk) for index, chunk in enumerate(split_chunks(text))],
    )


initialize_db()

app = FastAPI(title='DocuMind AI Pro', version='0.3.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4176').split(','),
    allow_methods=['GET', 'POST', 'DELETE', 'PUT'],
    allow_headers=['Content-Type'],
)


class ChatInput(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None
    mode: str = 'rag'


class AgentInput(BaseModel):
    task: str = Field(min_length=1, max_length=2000)
    agent: str = 'research'


class SearchInput(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=5, ge=1, le=20)


class SettingsInput(BaseModel):
    model: str = Field(min_length=1, max_length=200)


def ollama_json(path: str, payload: dict | None = None, timeout: int = 180):
    body = None if payload is None else json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(
        f'{OLLAMA_URL}{path}',
        data=body,
        headers={'Content-Type': 'application/json'} if body is not None else {},
        method='POST' if body is not None else 'GET',
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode('utf-8'))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise HTTPException(503, f'Cannot reach the local Ollama service at {OLLAMA_URL}: {error}') from error


def selected_model() -> str:
    with connect() as db:
        row = db.execute('SELECT value FROM app_settings WHERE key=?', ('model',)).fetchone()
    return row['value'] if row else DEFAULT_MODEL


def retrieve(query: str, limit: int = 5) -> list[dict]:
    terms = [term.lower() for term in TOKEN_RE.findall(query) if len(term) > 1]
    if not terms:
        return []
    with connect() as db:
        rows = db.execute(
            'SELECT c.id,c.document_id,c.ordinal,c.text,d.name FROM document_chunks c JOIN documents d ON d.id=c.document_id'
        ).fetchall()
    if not rows:
        return []
    query_terms = set(terms)
    document_frequency = Counter()
    tokenized = []
    for row in rows:
        words = [word.lower() for word in TOKEN_RE.findall(row['text'])]
        counts = Counter(words)
        tokenized.append((row, counts, len(words)))
        document_frequency.update(set(counts))
    average_length = max(1, sum(length for _, _, length in tokenized) / len(tokenized))
    ranked = []
    for row, counts, length in tokenized:
        score = 0.0
        for term in query_terms:
            frequency = counts[term]
            if frequency:
                inverse_frequency = math.log(1 + (len(rows) - document_frequency[term] + 0.5) / (document_frequency[term] + 0.5))
                score += inverse_frequency * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * length / average_length))
        if score:
            snippet = row['text']
            ranked.append({
                'id': row['id'],
                'document_id': row['document_id'],
                'document': row['name'],
                'snippet': snippet[:420] + ('…' if len(snippet) > 420 else ''),
                'score': round(score, 4),
            })
    ranked.sort(key=lambda result: result['score'], reverse=True)
    return ranked[:limit]


def ensure_question(value: str) -> str:
    question = value.strip()
    if not question:
        raise HTTPException(400, 'Enter a question or search phrase.')
    return question


def generate_answer(question: str, sources: list[dict], mode: str = 'rag', history: list[dict] | None = None) -> str:
    source_text = '\n\n'.join(f'[{index}] {source["document"]}\n{source["snippet"]}' for index, source in enumerate(sources, 1))
    if mode == 'chat':
        instruction = 'Answer the user conversationally. Use the supplied document context when relevant, and cite any document facts as [1], [2], etc. If context is missing, say so.'
    else:
        instruction = 'Answer using only the supplied document context. If it does not contain the answer, say that clearly. Cite supporting sources using [1], [2], etc.; never invent citations.'
    messages = [
        {'role': 'system', 'content': f'{instruction}\n\nDocument context:\n{source_text or "(No matching document passages found.)"}'},
    ]
    messages.extend(history or [])
    messages.append({'role': 'user', 'content': question})
    result = ollama_json('/api/chat', {
        'model': selected_model(),
        'stream': False,
        'messages': messages,
        'options': {'temperature': 0.2},
    })
    answer = result.get('message', {}).get('content', '').strip()
    if not answer:
        raise HTTPException(502, 'The local model returned an empty answer.')
    return answer


def ensure_conversation(conversation_id: str | None, question: str) -> str:
    with connect() as db:
        if conversation_id:
            exists = db.execute('SELECT id FROM conversations WHERE id=?', (conversation_id,)).fetchone()
            if not exists:
                raise HTTPException(404, 'Conversation not found.')
            db.execute('UPDATE conversations SET updated=CURRENT_TIMESTAMP WHERE id=?', (conversation_id,))
            return conversation_id
        new_id = uuid4().hex
        title = question[:80]
        db.execute('INSERT INTO conversations(id,title) VALUES(?,?)', (new_id, title))
        return new_id


def store_message(conversation_id: str, question: str, answer: str, citations: list[dict]):
    with connect() as db:
        db.executemany(
            'INSERT INTO messages(conversation_id,role,content,citations) VALUES(?,?,?,?)',
            [
                (conversation_id, 'user', question, '[]'),
                (conversation_id, 'assistant', answer, json.dumps(citations)),
            ],
        )
        db.execute('UPDATE conversations SET updated=CURRENT_TIMESTAMP WHERE id=?', (conversation_id,))


@app.get('/api/v1/health')
def health() -> dict:
    try:
        tags = ollama_json('/api/tags', timeout=3)
        models = [item.get('name', '') for item in tags.get('models', [])]
        ollama = 'ok'
    except HTTPException:
        models = []
        ollama = 'offline'
    return {
        'status': 'ok' if ollama == 'ok' else 'degraded',
        'service': 'DocuMind AI Pro',
        'version': '0.3.0',
        'capabilities': {
            'documents': 'Upload, extraction, and local indexing available',
            'chat': 'Local Ollama grounded chat' if ollama == 'ok' else 'Ollama is offline',
            'storage': 'Local files and SQLite',
        },
        'ollama': ollama,
        'model': selected_model(),
        'models': models,
    }


@app.get('/api/v1/documents')
def documents() -> list[dict]:
    with connect() as db:
        return [dict(row) for row in db.execute('SELECT id,name,size,pages,created FROM documents ORDER BY created DESC')]


@app.get('/api/v1/stats')
def stats() -> dict:
    with connect() as db:
        counts = db.execute(
            'SELECT (SELECT COUNT(*) FROM documents) AS documents, '
            '(SELECT COUNT(*) FROM document_chunks) AS chunks, '
            '(SELECT COUNT(*) FROM conversations) AS conversations'
        ).fetchone()
        recent = db.execute(
            'SELECT id,name,size,pages,created FROM documents ORDER BY created DESC LIMIT 4'
        ).fetchall()
    return {'documents': counts['documents'], 'chunks': counts['chunks'], 'conversations': counts['conversations'], 'recent_documents': [dict(row) for row in recent]}


@app.get('/api/v1/documents/{document_id}')
def preview(document_id: str) -> dict:
    with connect() as db:
        row = db.execute('SELECT * FROM documents WHERE id=?', (document_id,)).fetchone()
    if row is None:
        raise HTTPException(404, 'Document not found')
    return dict(row)


@app.post('/api/v1/documents', status_code=201)
async def upload(request: Request, filename: str) -> dict:
    name = filename.replace('\\', '/').split('/')[-1].strip()
    extension = Path(name).suffix.lower()
    if extension not in {'.pdf', '.txt', '.md'} or len(name) > 240:
        raise HTTPException(400, 'Choose a PDF, TXT, or Markdown file with a name under 240 characters.')
    content = bytearray()
    async for block in request.stream():
        content.extend(block)
        if len(content) > LIMIT:
            raise HTTPException(413, 'File exceeds the 20 MB limit.')
    if not content:
        raise HTTPException(400, 'The file is empty.')
    doc_id = uuid4().hex
    path = UPLOADS / doc_id
    path.write_bytes(content)
    try:
        if extension == '.pdf':
            reader = PdfReader(path)
            if reader.is_encrypted:
                raise ValueError('Encrypted PDF')
            pages = len(reader.pages)
            extracted = '\n\n'.join(f'[Page {index + 1}]\n{page.extract_text() or ""}' for index, page in enumerate(reader.pages))
            if not any((page.extract_text() or '').strip() for page in reader.pages):
                raise ValueError('No readable text')
        else:
            extracted = content.decode('utf-8-sig')
            pages = 1
            if not extracted.strip() or '\x00' in extracted:
                raise ValueError('Invalid text')
        with connect() as db:
            db.execute('INSERT INTO documents(id,name,size,pages,text) VALUES(?,?,?,?,?)', (doc_id, name, len(content), pages, extracted))
            save_chunks(db, doc_id, extracted)
    except Exception as error:
        path.unlink(missing_ok=True)
        if isinstance(error, HTTPException):
            raise
        raise HTTPException(422, 'Could not read this file. Use a text-based, unlocked PDF or a UTF-8 text/Markdown file. Scanned PDFs need OCR, which is not available yet.') from error
    return preview(doc_id)


@app.delete('/api/v1/documents/{document_id}', status_code=204)
def delete_document(document_id: str):
    with connect() as db:
        row = db.execute('SELECT id FROM documents WHERE id=?', (document_id,)).fetchone()
        if row is None:
            raise HTTPException(404, 'Document not found')
        (UPLOADS / row['id']).unlink(missing_ok=True)
        db.execute('DELETE FROM document_chunks WHERE document_id=?', (document_id,))
        db.execute('DELETE FROM documents WHERE id=?', (document_id,))


@app.post('/api/v1/search')
def search(body: SearchInput) -> dict:
    query = ensure_question(body.query)
    results = retrieve(query, body.limit)
    return {'query': query, 'results': results, 'count': len(results)}


@app.get('/api/v1/conversations')
def conversations() -> list[dict]:
    with connect() as db:
        return [dict(row) for row in db.execute(
            'SELECT c.id,c.title,c.created,c.updated,COUNT(m.id) AS message_count FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id GROUP BY c.id ORDER BY c.updated DESC'
        )]


@app.get('/api/v1/conversations/{conversation_id}')
def conversation(conversation_id: str) -> dict:
    with connect() as db:
        row = db.execute('SELECT id,title,created,updated FROM conversations WHERE id=?', (conversation_id,)).fetchone()
        if row is None:
            raise HTTPException(404, 'Conversation not found.')
        messages = db.execute('SELECT role,content,citations,created FROM messages WHERE conversation_id=? ORDER BY id', (conversation_id,)).fetchall()
    return {'conversation': dict(row), 'messages': [{**dict(message), 'citations': json.loads(message['citations'])} for message in messages]}


@app.delete('/api/v1/conversations/{conversation_id}', status_code=204)
def delete_conversation(conversation_id: str):
    with connect() as db:
        exists = db.execute('SELECT id FROM conversations WHERE id=?', (conversation_id,)).fetchone()
        if not exists:
            raise HTTPException(404, 'Conversation not found.')
        db.execute('DELETE FROM messages WHERE conversation_id=?', (conversation_id,))
        db.execute('DELETE FROM conversations WHERE id=?', (conversation_id,))


@app.post('/api/v1/chat')
def chat(body: ChatInput) -> dict:
    question = ensure_question(body.question)
    if body.mode not in {'rag', 'chat'}:
        raise HTTPException(400, 'Mode must be "rag" or "chat".')
    history = []
    if body.conversation_id:
        with connect() as db:
            exists = db.execute('SELECT id FROM conversations WHERE id=?', (body.conversation_id,)).fetchone()
            if not exists:
                raise HTTPException(404, 'Conversation not found.')
            prior_messages = db.execute(
                'SELECT role,content FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 8',
                (body.conversation_id,),
            ).fetchall()
        history = [{'role': message['role'], 'content': message['content']} for message in reversed(prior_messages)]
    sources = retrieve(question, 5)
    answer = generate_answer(question, sources, body.mode, history)
    conversation_id = ensure_conversation(body.conversation_id, question)
    citations = [{'index': index, 'document_id': source['document_id'], 'document': source['document'], 'snippet': source['snippet']} for index, source in enumerate(sources, 1)]
    store_message(conversation_id, question, answer, citations)
    return {'conversation_id': conversation_id, 'answer': answer, 'citations': citations, 'retrieved_count': len(sources)}


@app.get('/api/v1/agents')
def agents() -> list[dict]:
    return [
        {'id': 'research', 'name': 'Document researcher', 'description': 'Finds relevant passages and answers with source citations.'},
        {'id': 'summarize', 'name': 'Summarizer', 'description': 'Creates a concise summary grounded in your uploaded documents.'},
    ]


@app.post('/api/v1/agents/run')
def run_agent(body: AgentInput) -> dict:
    task = ensure_question(body.task)
    if body.agent not in {'research', 'summarize'}:
        raise HTTPException(400, 'Choose the document researcher or summarizer agent.')
    sources = retrieve(task, 7)
    prompt = task if body.agent == 'research' else f'Summarize the relevant document content for this request: {task}'
    answer = generate_answer(prompt, sources)
    citations = [{'index': index, 'document_id': source['document_id'], 'document': source['document'], 'snippet': source['snippet']} for index, source in enumerate(sources, 1)]
    return {'agent': body.agent, 'answer': answer, 'citations': citations, 'trace': [
        {'step': 'retrieve', 'status': 'complete', 'detail': f'{len(sources)} matching document passages'},
        {'step': 'generate', 'status': 'complete', 'detail': f'Answered with {selected_model()}'},
    ]}


@app.post('/api/v1/evaluation/run')
def run_evaluation(body: SearchInput) -> dict:
    question = ensure_question(body.query)
    sources = retrieve(question, body.limit)
    answer = generate_answer(question, sources)
    citation_count = len(re.findall(r'\[\d+\]', answer))
    with connect() as db:
        cursor = db.execute(
            'INSERT INTO evaluations(question,answer,retrieved,cited) VALUES(?,?,?,?)',
            (question, answer, len(sources), citation_count),
        )
        evaluation_id = cursor.lastrowid
    return {
        'id': evaluation_id,
        'question': question,
        'answer': answer,
        'retrieved': len(sources),
        'citation_count': citation_count,
        'sources': sources,
        'created': datetime.now(timezone.utc).isoformat(),
    }


@app.get('/api/v1/evaluation/history')
def evaluation_history() -> list[dict]:
    with connect() as db:
        return [dict(row) for row in db.execute(
            'SELECT id,question,answer,retrieved,cited,created FROM evaluations ORDER BY id DESC LIMIT 20'
        )]


@app.get('/api/v1/settings')
def get_settings() -> dict:
    try:
        tags = ollama_json('/api/tags', timeout=3)
        models = [item.get('name', '') for item in tags.get('models', [])]
        ollama = 'connected'
    except HTTPException:
        models = []
        ollama = 'offline'
    return {'ollama': ollama, 'model': selected_model(), 'models': models}


@app.put('/api/v1/settings')
def put_settings(body: SettingsInput) -> dict:
    requested = body.model.strip()
    tags = ollama_json('/api/tags', timeout=3)
    models = [item.get('name', '') for item in tags.get('models', [])]
    if requested not in models:
        raise HTTPException(400, 'Select an installed Ollama model.')
    with connect() as db:
        db.execute('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', ('model', requested))
    return {'ollama': 'connected', 'model': requested, 'models': models}
