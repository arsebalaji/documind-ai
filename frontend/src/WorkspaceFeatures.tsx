import { useEffect, useState, type FormEvent } from 'react'

type Section = 'AI conversations' | 'Search' | 'Agents' | 'Evaluation' | 'Settings'
type Citation = { index: number; document_id: string; document: string; snippet: string; score?: number }
type SearchResult = { id: number; document_id: string; document: string; snippet: string; score: number }
type Message = { role: 'user' | 'assistant'; content: string; citations: Citation[] }
type Conversation = { id: string; title: string; message_count: number; updated: string }
type ApiError = { detail?: string }

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch((): ApiError => ({}))
    throw new Error(body.detail || `Request failed (${response.status}).`)
  }
  return response.status === 204 ? null as T : response.json() as Promise<T>
}

function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return <p className="feature-muted">No matching passages were found in your documents.</p>
  return <div className="feature-citations">{citations.map((citation, index) => (
    <article key={`${citation.document_id}-${citation.index}`} className="feature-citation">
      <strong>[{citation.index || index + 1}] {citation.document}</strong>
      <p>{citation.snippet}</p>
    </article>
  ))}</div>
}

function ChatFeature() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationId, setConversationId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function loadConversations() {
    try { setConversations(await api<Conversation[]>('/conversations')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load conversations.') }
  }

  useEffect(() => { void loadConversations() }, [])

  async function selectConversation(id: string) {
    setError('')
    try {
      const result = await api<{ messages: Message[] }>(`/conversations/${id}`)
      setConversationId(id)
      setMessages(result.messages)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this conversation.') }
  }

  async function removeConversation(item: Conversation) {
    if (!window.confirm(`Delete the conversation "${item.title}"?`)) return
    setError('')
    try {
      await api<void>(`/conversations/${item.id}`, { method: 'DELETE' })
      if (conversationId === item.id) newConversation()
      await loadConversations()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete this conversation.') }
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    const value = question.trim()
    if (!value || busy) return
    setBusy(true); setError(''); setQuestion('')
    setMessages(previous => [...previous, { role: 'user', content: value, citations: [] }])
    try {
      const result = await api<{ conversation_id: string; answer: string; citations: Citation[] }>('/chat', {
        method: 'POST', body: JSON.stringify({ question: value, conversation_id: conversationId || null }),
      })
      setConversationId(result.conversation_id)
      setMessages(previous => [...previous, { role: 'assistant', content: result.answer, citations: result.citations }])
      await loadConversations()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send this message.')
      setMessages(previous => previous.filter((message, index) => !(index === previous.length - 1 && message.role === 'user' && message.content === value)))
      setQuestion(value)
    } finally { setBusy(false) }
  }

  function newConversation() { setConversationId(''); setMessages([]); setError('') }

  return <section className="feature-page">
    <div className="feature-heading"><div><span className="feature-kicker">GROUNDED IN YOUR LIBRARY</span><h2>AI conversations</h2><p>Ask questions and get answers with passages from your documents.</p></div><button className="button button-secondary" onClick={newConversation}>New conversation</button></div>
    <div className="chat-layout">
      <aside className="feature-card conversation-list"><h3>Your conversations</h3>{conversations.length ? conversations.map(item => <div key={item.id} className="conversation-entry"><button className={`conversation-item ${conversationId === item.id ? 'selected' : ''}`} onClick={() => void selectConversation(item.id)}><strong>{item.title}</strong><span>{item.message_count} messages</span></button><button className="conversation-delete" aria-label={`Delete ${item.title}`} onClick={() => void removeConversation(item)}>Delete</button></div>) : <p className="feature-muted">Your saved conversations will appear here.</p>}</aside>
      <div className="feature-card chat-panel">
        <div className="chat-messages">{messages.length === 0 && <div className="feature-empty"><strong>Start with a question</strong><p>Answers are based on the documents in your library. Upload documents first if the library is empty.</p></div>}
          {messages.map((message, index) => <article key={`${index}-${message.role}`} className={`chat-message ${message.role}`}><span className="message-role">{message.role === 'user' ? 'You' : 'DocuMind'}</span><p>{message.content}</p>{message.role === 'assistant' && <CitationList citations={message.citations || []} />}</article>)}
          {busy && <p className="feature-muted" role="status">Thinking with your documents…</p>}
        </div>
        {error && <p className="feature-error" role="alert">{error}</p>}
        <form className="feature-form chat-form" onSubmit={send}><label className="visually-hidden" htmlFor="chat-question">Ask a question</label><textarea id="chat-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask a question about your documents…" rows={2} maxLength={2000} /><button className="button button-primary" disabled={busy || !question.trim()}>{busy ? 'Working…' : 'Send'}</button></form>
      </div>
    </div>
  </section>
}

function SearchFeature() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function search(event: FormEvent) {
    event.preventDefault()
    if (!query.trim() || busy) return
    setBusy(true); setError('')
    try { setResults((await api<{ results: SearchResult[] }>('/search', { method: 'POST', body: JSON.stringify({ query, limit: 10 }) })).results) }
    catch (e) { setError(e instanceof Error ? e.message : 'Search failed.') }
    finally { setBusy(false) }
  }
  return <section className="feature-page">
    <div className="feature-heading"><div><span className="feature-kicker">LOCAL FULL-TEXT RETRIEVAL</span><h2>Search your knowledge</h2><p>Find relevant passages in extracted document text.</p></div></div>
    <div className="feature-card"><form className="feature-form search-form" onSubmit={search}><label className="visually-hidden" htmlFor="search-query">Search documents</label><input id="search-query" value={query} onChange={event => setQuery(event.target.value)} maxLength={500} placeholder="Search for a topic, phrase, or question…" /><button className="button button-primary" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search'}</button></form>
      {error && <p className="feature-error" role="alert">{error}</p>}
      {results.length > 0 && <div className="feature-results" aria-live="polite"><h3>{results.length} matching passage{results.length === 1 ? '' : 's'}</h3>{results.map(result => <article className="feature-result" key={result.id}><div className="result-meta"><strong>{result.document}</strong><span>Relevance {result.score.toFixed(2)}</span></div><p>{result.snippet}</p></article>)}</div>}
      {!results.length && !busy && !error && <p className="feature-muted">Enter a search to find matching passages in uploaded documents.</p>}
    </div>
  </section>
}

function AgentsFeature() {
  const [agent, setAgent] = useState<'research' | 'summarize'>('research')
  const [task, setTask] = useState('')
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<Citation[]>([])
  const [trace, setTrace] = useState<{ step: string; status: string; detail: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(event: FormEvent) {
    event.preventDefault()
    if (!task.trim() || busy) return
    setBusy(true); setError(''); setAnswer(''); setTrace([])
    try {
      const result = await api<{ answer: string; citations: Citation[]; trace: typeof trace }>('/agents/run', {
        method: 'POST', body: JSON.stringify({ agent, task }),
      })
      setAnswer(result.answer); setCitations(result.citations); setTrace(result.trace)
    } catch (e) { setError(e instanceof Error ? e.message : 'Agent run failed.') }
    finally { setBusy(false) }
  }
  return <section className="feature-page">
    <div className="feature-heading"><div><span className="feature-kicker">BOUNDED, LOCAL WORKFLOWS</span><h2>Research agents</h2><p>Choose a task-focused workflow; it only searches your local documents.</p></div></div>
    <div className="feature-card">
      <form className="feature-form agent-form" onSubmit={run}><label htmlFor="agent-type">Workflow</label><select id="agent-type" value={agent} onChange={event => setAgent(event.target.value as 'research' | 'summarize')}><option value="research">Document researcher</option><option value="summarize">Summarizer</option></select><label htmlFor="agent-task">Your task</label><textarea id="agent-task" value={task} onChange={event => setTask(event.target.value)} rows={4} maxLength={2000} placeholder="What should the agent find or summarize?" /><button className="button button-primary" disabled={busy || !task.trim()}>{busy ? 'Running…' : 'Run workflow'}</button></form>
      {error && <p className="feature-error" role="alert">{error}</p>}
      {trace.length > 0 && <div className="agent-trace"><h3>Workflow trace</h3>{trace.map(item => <div key={item.step}><strong>{item.step}</strong><span>{item.status} · {item.detail}</span></div>)}</div>}
      {answer && <article className="feature-answer"><h3>Result</h3><p>{answer}</p><CitationList citations={citations} /></article>}
    </div>
  </section>
}

type Evaluation = { id: number; question: string; answer: string; retrieved: number; cited: number; created: string }
function EvaluationFeature() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<Evaluation | null>(null)
  const [history, setHistory] = useState<Evaluation[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function loadHistory() {
    try { setHistory(await api<Evaluation[]>('/evaluation/history')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load evaluation history.') }
  }
  useEffect(() => { void loadHistory() }, [])
  async function run(event: FormEvent) {
    event.preventDefault()
    if (!query.trim() || busy) return
    setBusy(true); setError('')
    try {
      const data = await api<Evaluation & { sources: Citation[]; citation_count: number }>('/evaluation/run', { method: 'POST', body: JSON.stringify({ query, limit: 5 }) })
      setResult({ ...data, cited: data.citation_count }); await loadHistory()
    } catch (e) { setError(e instanceof Error ? e.message : 'Evaluation failed.') }
    finally { setBusy(false) }
  }
  return <section className="feature-page">
    <div className="feature-heading"><div><span className="feature-kicker">LIVE RETRIEVAL CHECK</span><h2>RAG evaluation</h2><p>Run a real question and inspect retrieval and citation signals. These are diagnostics, not a factuality guarantee.</p></div></div>
    <div className="feature-card"><form className="feature-form search-form" onSubmit={run}><label className="visually-hidden" htmlFor="evaluation-query">Evaluation question</label><input id="evaluation-query" value={query} onChange={event => setQuery(event.target.value)} maxLength={500} placeholder="Enter a question to evaluate…" /><button className="button button-primary" disabled={busy || !query.trim()}>{busy ? 'Evaluating…' : 'Run check'}</button></form>
      {error && <p className="feature-error" role="alert">{error}</p>}
      {result && <article className="evaluation-result"><h3>Latest run</h3><p><strong>Retrieved passages:</strong> {result.retrieved} · <strong>Citation markers:</strong> {result.cited}</p><p>{result.answer}</p></article>}
      <div className="feature-results"><h3>Recent runs</h3>{history.length ? history.map(item => <article className="feature-result" key={item.id}><div className="result-meta"><strong>{item.question}</strong><span>{item.retrieved} passages · {item.cited} citation markers</span></div><p>{item.answer}</p></article>) : <p className="feature-muted">No evaluation runs yet.</p>}</div>
    </div>
  </section>
}

type Settings = { ollama: string; model: string; models: string[] }
function SettingsFeature() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [model, setModel] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api<Settings>('/settings').then(data => { setSettings(data); setModel(data.model) }).catch(e => setError(e instanceof Error ? e.message : 'Could not load settings.'))
  }, [])
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try { const data = await api<Settings>('/settings', { method: 'PUT', body: JSON.stringify({ model }) }); setSettings(data); setNotice(`Using ${data.model}.`) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update settings.') }
    finally { setBusy(false) }
  }
  return <section className="feature-page">
    <div className="feature-heading"><div><span className="feature-kicker">LOCAL CONNECTION & PRIVACY</span><h2>Workspace settings</h2><p>Check your local Ollama connection and choose an installed model.</p></div></div>
    <div className="feature-card settings-card">
      <div className="settings-status"><span className={`status-dot ${settings?.ollama === 'connected' ? 'online' : ''}`} /><strong>Ollama</strong><span>{settings?.ollama || 'Checking connection…'}</span></div>
      {settings?.ollama === 'connected' ? <form className="feature-form agent-form" onSubmit={save}><label htmlFor="model-select">Chat model</label><select id="model-select" value={model} onChange={event => setModel(event.target.value)}>{settings.models.map(item => <option key={item} value={item}>{item}</option>)}</select><p className="feature-muted">Models are served by Ollama on this computer; your documents and prompts remain local.</p><button className="button button-primary" disabled={busy || !model}>{busy ? 'Saving…' : 'Save model'}</button></form> : <p className="feature-muted">Start Ollama to enable chat and agent workflows. Document upload and search continue to work without it.</p>}
      {notice && <p role="status" className="feature-success">{notice}</p>}
      {error && <p role="alert" className="feature-error">{error}</p>}
    </div>
  </section>
}

export default function WorkspaceFeatures({ section }: { section: Section }) {
  if (section === 'AI conversations') return <ChatFeature />
  if (section === 'Search') return <SearchFeature />
  if (section === 'Agents') return <AgentsFeature />
  if (section === 'Evaluation') return <EvaluationFeature />
  return <SettingsFeature />
}
