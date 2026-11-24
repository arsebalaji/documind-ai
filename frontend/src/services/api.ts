export type HealthStatus = {
  status: 'ok' | 'degraded'
  service: string
  version: string
  capabilities: { documents: string; chat: string; storage: string }
  ollama?: 'ok' | 'offline'
  model?: string
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export async function getHealth(signal?: AbortSignal): Promise<HealthStatus> {
  const response = await fetch(`${baseUrl}/api/v1/health`, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`API responded with ${response.status}`)
  return response.json() as Promise<HealthStatus>
}

