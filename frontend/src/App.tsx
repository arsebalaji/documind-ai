import Documents from './Documents'
import WorkspaceFeatures from './WorkspaceFeatures'
import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, Bell, BookOpen, Bot, Check, ChevronDown,
  CircleHelp, Command, FileText, FolderOpen, Gauge, LayoutDashboard, Menu, MessageSquareText,
  MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Sparkles, Upload, X,
} from 'lucide-react'
import { getHealth, type HealthStatus } from './services/api'

type NavKey = 'Overview' | 'Documents' | 'AI conversations' | 'Search' | 'Agents' | 'Evaluation' | 'Settings'
type DashboardStats = { documents: number; chunks: number; conversations: number; recent_documents: { id: string; name: string; size: number; pages: number; created: string }[] }
const navItems: { label: NavKey; icon: typeof LayoutDashboard; badge?: string }[] = [
  { label: 'Overview', icon: LayoutDashboard }, { label: 'Documents', icon: FolderOpen, badge: '0' },
  { label: 'AI conversations', icon: MessageSquareText }, { label: 'Search', icon: Search },
  { label: 'Agents', icon: Bot }, { label: 'Evaluation', icon: Gauge },
]

function App() {
  const [active, setActive] = useState<NavKey>('Overview')
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null)
  const [dashboardError, setDashboardError] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [apiReachable, setApiReachable] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal).then((data) => { setHealth(data); setApiReachable(true) }).catch(() => setApiReachable(false))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/,'')
    let activeRequest = true
    fetch(base + '/api/v1/stats')
      .then(response => { if (!response.ok) throw new Error(`Workspace stats failed (${response.status}).`); return response.json() as Promise<DashboardStats> })
      .then(data => { if (activeRequest) { setDashboard(data); setDashboardError('') } })
      .catch(error => { if (activeRequest) setDashboardError(error instanceof Error ? error.message : 'Could not load workspace stats.') })
    return () => { activeRequest = false }
  }, [active])

  const openSection = (label: NavKey) => { setActive(label); setMobileOpen(false) }
  const isOverview = active === 'Overview'

  return (
    <div className="app-shell">
      {mobileOpen && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Sparkles size={18} strokeWidth={2.1} /></div><span>docu<span className="brand-light">mind</span><sup>AI</sup></span><button className="icon-button close-nav" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
        <button className="workspace-switch"><div className="workspace-avatar">N</div><span className="workspace-copy"><strong>Northstar Studio</strong><small>Personal workspace</small></span><ChevronDown size={15} /></button>
        <div className="side-label">WORKSPACE</div>
        <nav aria-label="Main navigation" className="nav-list">{navItems.map(({ label, icon: Icon, badge }) => <button key={label} className={`nav-item ${active === label ? 'nav-active' : ''}`} onClick={() => openSection(label)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{badge && <small className="nav-badge">{dashboard?.documents ?? 0}</small>}</button>)}</nav>
        <div className="side-label tools-label">PREFERENCES</div>
        <button className={`nav-item ${active === 'Settings' ? 'nav-active' : ''}`} onClick={() => openSection('Settings')}><Settings2 size={17} strokeWidth={1.8} /><span>Settings</span></button>
        <div className="sidebar-bottom">
          <div className="privacy-card"><div className="privacy-icon"><ShieldCheck size={16} /></div><div><strong>Your data stays yours</strong><p>Private by design. Built for local AI.</p></div><ArrowUpRight size={14} className="privacy-arrow" /></div>
          <button className="profile"><div className="profile-avatar">B</div><span><strong>Balaji</strong><small>Free plan</small></span><MoreHorizontal size={17} className="profile-more" /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="topbar-left"><button className="icon-button menu-toggle" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{active}</strong></div></div><div className="topbar-actions"><div className={`connection-pill ${apiReachable ? 'connected' : ''}`}><span className="status-dot" />{apiReachable ? 'API connected' : 'API offline'}</div><button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><i /></button><div className="top-avatar">B</div></div></header>

        <div className="page-content">
          <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" />YOUR PRIVATE KNOWLEDGE SPACE</div><h1>{isOverview ? <>Good morning, Balaji<span className="wave">✳</span></> : active}</h1><p className="page-subtitle">{isOverview ? 'Bring your documents together. Find the answers that matter.' : sectionDescription(active)}</p></div><div className="header-cta"><button className="button button-secondary" onClick={() => openSection('Documents')}><Upload size={15} /> Add documents</button><button className="button button-primary" onClick={() => openSection('AI conversations')}><Plus size={16} /> New conversation</button></div></div>

          {!isOverview ? (active === 'Documents' ? <Documents /> : <WorkspaceFeatures section={active} />) : <>
            <section className="metrics-grid" aria-label="Workspace overview">
              <MetricCard icon={<FileText size={16} />} label="Documents" value={String(dashboard?.documents ?? 0)} helper="Your library" accent="purple" />
              <MetricCard icon={<BookOpen size={16} />} label="Knowledge chunks" value={String(dashboard?.chunks ?? 0)} helper="Indexed for local search" accent="blue" />
              <MetricCard icon={<MessageSquareText size={16} />} label="Conversations" value={String(dashboard?.conversations ?? 0)} helper="Your saved research" accent="cyan" />
              <MetricCard icon={<Activity size={16} />} label="AI model" value={health?.model ?? '—'} helper={health?.ollama === 'ok' ? 'Ollama connected' : apiReachable ? 'Ollama is offline' : 'Waiting for local setup'} accent="green" status />
            </section>

            <section className="hero-card"><div className="hero-content"><div className="hero-kicker"><span className="hero-kicker-icon"><Sparkles size={13} /></span> A CLEARER WAY TO THINK WITH YOUR FILES</div><h2>Your documents have<br />more to say.</h2><p>Build a private knowledge base, then ask questions and get answers grounded in your own sources.</p><button className="hero-button" onClick={() => openSection('Documents')}>Build your knowledge base <ArrowRight size={16} /></button><div className="hero-footnote"><ShieldCheck size={13} /> Your files stay in your workspace</div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><div className="glow-core"><div className="core-icon"><Sparkles size={30} strokeWidth={1.4} /></div></div><div className="float-card float-doc"><span className="mini-doc"><FileText size={14} /></span><span><b>Research brief.pdf</b><small>12 pages · ready to explore</small></span><span className="float-dot" /></div><div className="float-card float-answer"><span className="answer-spark"><Sparkles size={14} /></span><span><b>Answer, with sources</b><small>Grounded in your documents</small></span></div><div className="art-stars"><i>✦</i><i>·</i><i>✧</i><i>·</i></div></div><div className="hero-index">01 <span>/</span> YOUR KNOWLEDGE, IN FOCUS</div></section>

            <div className="content-grid"><section className="panel library-panel"><div className="panel-heading"><div><div className="section-eyebrow">YOUR LIBRARY</div><h3>Recent documents</h3></div><button className="text-button" onClick={() => openSection('Documents')}>View library <ArrowUpRight size={14} /></button></div>{dashboardError && <p className="upload-error" role="alert">{dashboardError}</p>}{dashboard?.recent_documents.length ? <div className="recent-documents">{dashboard.recent_documents.map(doc => <button className="recent-document-row" key={doc.id} onClick={() => openSection('Documents')}><FileText size={17} /><span><strong>{doc.name}</strong><small>{(doc.size / 1024).toFixed(1)} KB · {doc.pages} page{doc.pages === 1 ? '' : 's'}</small></span><ArrowUpRight size={14} /></button>)}</div> : <div className="empty-library"><div className="empty-illustration"><div className="empty-file file-back"><FileText size={19} /></div><div className="empty-file file-front"><FileText size={20} /><span>+</span></div><div className="empty-spark">✦</div></div><strong>A fresh page starts here</strong><p>Upload a PDF, text file, or Markdown doc<br className="desktop-break" /> to make it part of your knowledge base.</p><button className="button button-upload" onClick={() => openSection('Documents')}><Upload size={15} /> Upload your first document</button><span className="file-hint">PDF, TXT, MD <i>·</i> UP TO 20 MB</span></div>}</section>

              <section className="panel activity-panel"><div className="panel-heading"><div><div className="section-eyebrow">AT A GLANCE</div><h3>Workspace status</h3></div><button className="icon-button more-button" aria-label="More workspace status options"><MoreHorizontal size={18} /></button></div><div className="status-list"><StatusRow icon={<Bot size={16} />} label="Local AI backend" detail={apiReachable ? 'API is responding' : 'Start the FastAPI server'} good={apiReachable} /><StatusRow icon={<Sparkles size={15} />} label="Language model" detail={health?.capabilities.chat ?? 'Check local model settings'} good={health?.ollama === 'ok'} /><StatusRow icon={<FolderOpen size={15} />} label="Document indexing" detail={health?.capabilities.documents ?? 'Upload and indexing unavailable'} good={apiReachable} /></div><div className="status-note"><div className="note-icon"><CircleHelp size={15} /></div><div><strong>{apiReachable ? 'Ready to explore' : 'Getting started'}</strong><p>{apiReachable ? 'Upload documents to search and chat with their content.' : 'Start the local backend to bring your workspace online.'}</p></div><ArrowUpRight size={14} /></div><button className="text-button status-link" onClick={() => openSection('Settings')}>Connection settings <ArrowRight size={14} /></button></section></div>

            <section className="bottom-banner"><div className="banner-icon"><Command size={18} /></div><div><strong>Thoughtful by default.</strong><span>Private local AI is the foundation. Your documents are never used to train a model.</span></div><button aria-label="Learn about privacy" className="icon-button banner-link" onClick={() => openSection('Settings')}><ArrowUpRight size={16} /></button></section>
            <footer className="page-footer"><span>DOCUMIND AI <i>·</i> PRIVATE KNOWLEDGE, CLEAR THINKING</span><span className="footer-right"><span className="footer-status" />{apiReachable ? 'Backend connected' : 'Local-first workspace'} <span className="footer-divider">/</span> v0.1.0</span></footer>
          </>}
        </div>
      </main>
    </div>
  )
}

function MetricCard({ icon, label, value, helper, accent, status = false }: { icon: ReactNode; label: string; value: string; helper: string; accent: string; status?: boolean }) {
  return <article className="metric-card"><div className={`metric-icon ${accent}`}>{icon}</div><div className="metric-label">{label}</div><div className={`metric-value ${status ? 'metric-status' : ''}`}>{status && <span className="status-dot" />}{value}</div><div className="metric-helper">{helper}</div><div className={`metric-corner ${accent}`} /></article>
}

function StatusRow({ icon, label, detail, good = false }: { icon: ReactNode; label: string; detail: string; good?: boolean }) {
  return <div className="status-row"><div className="status-row-icon">{icon}</div><div className="status-row-copy"><strong>{label}</strong><span>{detail}</span></div><span className={`status-indicator ${good ? 'indicator-good' : ''}`}>{good ? <Check size={11} /> : <ArrowUpRight size={11} />}</span></div>
}

function sectionDescription(active: NavKey) {
  const descriptions: Record<NavKey, string> = {
    Overview: '', Documents: 'A focused home for the files behind your next breakthrough.',
    'AI conversations': 'Your conversations will stay grounded in your own sources.',
    Search: 'Surface the right information from your private library.', Agents: 'A coordinated research team, designed around your documents.',
    Evaluation: 'Trust is measured. Track quality with transparent evaluation.', Settings: 'Your local AI workspace, configured your way.',
  }
  return descriptions[active]
}

export default App



