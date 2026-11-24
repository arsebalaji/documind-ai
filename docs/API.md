# API reference

Base URL: `http://127.0.0.1:8000/api/v1`. Interactive API documentation is at `http://127.0.0.1:8000/docs`. All endpoints are local and currently do not require authentication.

## Status and documents

- `GET /health`: service, Ollama, model, and capability status.
- `GET /stats`: document, indexed chunk, and conversation counts with recent document metadata.
- `GET /documents`: list uploaded documents.
- `POST /documents?filename=<name>`: upload PDF, TXT, or Markdown bytes. Maximum size is 20 MB.
- `GET /documents/{id}`: return document metadata and extracted text.
- `DELETE /documents/{id}`: remove the document and its indexed chunks.

## Retrieval and AI

- `POST /search`: JSON `{"query":"...","limit":5}`; returns locally ranked passages.
- `GET /conversations`: list saved conversations.
- `GET /conversations/{id}`: load messages and citations.
- `DELETE /conversations/{id}`: delete a conversation.
- `POST /chat`: JSON `{"question":"...","conversation_id":null,"mode":"rag"}`; returns a locally generated answer and passage citations. `mode` accepts `rag` or `chat`.
- `GET /agents`: list available bounded workflows.
- `POST /agents/run`: JSON `{"task":"...","agent":"research"}`; `agent` accepts `research` or `summarize`.

## Evaluation and settings

- `POST /evaluation/run`: JSON `{"query":"...","limit":5}`; runs retrieval and generation, returning passage and citation-marker counts.
- `GET /evaluation/history`: list recent runs.
- `GET /settings`: current Ollama connection and installed models.
- `PUT /settings`: JSON `{"model":"<installed model name>"}`; select an installed local Ollama model.

Search works without Ollama. Chat, agents, and evaluation require Ollama to be running with an installed chat model. Retrieval is lexical over locally stored text chunks; it is not vector search. Citation counts and retrieved passages are diagnostic signals, not factuality guarantees.
