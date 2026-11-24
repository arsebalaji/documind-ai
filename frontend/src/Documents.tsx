import { useEffect, useRef, useState } from 'react'
import { FileText, Upload, Trash2, X } from 'lucide-react'

type Document = { id: string; name: string; size: number; pages: number; created: string; text?: string }
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
async function api(path: string, options?: RequestInit) {
  const response = await fetch(`${base}/api/v1/documents${path}`, options)
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.detail || 'The document service could not complete your request.')
  }
  return response.status === 204 ? null : response.json()
}
export default function Documents() {
  const input = useRef<HTMLInputElement>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<Document | null>(null)
  const [notice, setNotice] = useState('')
  const [dragging, setDragging] = useState(false)
  async function refresh() {
    try { setDocuments(await api('')); setError('') }
    catch { setError('Cannot reach the document service. Start the backend and try again.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  async function upload(files: FileList | File[]) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    let saved = 0
    const errors: string[] = []
    for (const file of Array.from(files)) {
      if (!/\.(pdf|txt|md)$/i.test(file.name) || file.size > 20 * 1024 * 1024 || !file.size) {
        errors.push(`${file.name}: choose a nonempty PDF, TXT, or MD file under 20 MB.`); continue
      }
      setProgress(0)
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', `${base}/api/v1/documents?filename=${encodeURIComponent(file.name)}`)
          xhr.setRequestHeader('Content-Type', 'application/octet-stream')
          xhr.timeout = 120000
          xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)) }
          xhr.onload = () => {
            if (xhr.status === 201) resolve()
            else { let message = 'Upload failed.'; try { message = JSON.parse(xhr.responseText).detail || message } catch {} reject(new Error(message)) }
          }
          xhr.onerror = () => reject(new Error('Document service is unavailable. Start the backend and retry.'))
          xhr.ontimeout = () => reject(new Error('Upload timed out. Refresh the library before retrying.'))
          xhr.send(file)
        })
        saved++
      } catch (e) { errors.push(`${file.name}: ${e instanceof Error ? e.message : 'Upload failed'}`) }
    }
    await refresh()
    setError(errors.join('\n')); setNotice(saved ? `${saved} document${saved === 1 ? '' : 's'} saved. Select a document to read its extracted text.` : '')
    setBusy(false)
    if (input.current) input.current.value = ''
  }
  async function remove(doc: Document) {
    if (!window.confirm(`Delete ${doc.name} and its extracted text?`)) return
    try { await api(`/${doc.id}`, { method: 'DELETE' }); if (preview?.id === doc.id) setPreview(null); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Deletion failed') }
  }
  return <section className="document-library">
    <input ref={input} hidden type="file" accept=".pdf,.txt,.md" multiple disabled={busy} onChange={event => { if (event.target.files) void upload(event.target.files) }} />
    <div className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files) }}>
      <Upload size={28}/><h2>Add your documents</h2><p>Drop files here, or choose them from your computer.</p>
      <button className="button button-primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading and extracting…' : 'Choose files'}</button>
      <p>PDF, TXT, Markdown · 20 MB per file · Stored locally</p>
      {busy && <div role="status"><progress value={progress} max={100}/><p>{progress}% transferred{progress === 100 ? ' · Extracting text…' : ''}</p></div>}
    </div>
    {error && <p role="alert" className="upload-error">{error}</p>}
    {notice && <p role="status" className="upload-success">{notice}</p>}
    <div className="panel-heading"><h3>Your documents ({documents.length})</h3><button className="button button-secondary" disabled={busy} onClick={() => void refresh()}>Refresh library</button></div>
    {loading ? <p>Loading library…</p> : documents.length === 0 ? <p className="document-hint">No documents uploaded yet.</p> : documents.map(doc => <div className="document-row" key={doc.id}><FileText size={20}/><button className="document-name" onClick={async () => { try { setPreview(await api(`/${doc.id}`)) } catch { setError('Could not load the document.') } }}><strong>{doc.name}</strong><span>{(doc.size / 1024).toFixed(1)} KB · {doc.pages} page{doc.pages === 1 ? '' : 's'} · Text extracted</span></button><button className="icon-button" aria-label={`Delete ${doc.name}`} onClick={() => void remove(doc)}><Trash2 size={17}/></button></div>)}
    {preview && <article className="document-preview"><div className="panel-heading"><h3>{preview.name}</h3><button className="icon-button" aria-label="Close preview" onClick={() => setPreview(null)}><X size={20}/></button></div><pre>{preview.text}</pre></article>}
    <p className="document-hint">Text extraction is available. AI answers and document indexing are still being built.</p>
  </section>
}
