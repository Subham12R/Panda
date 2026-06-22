import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Loader2, X, Plug, Pencil, Trash2, Plus, Globe, BrainCog, Paperclip, Server } from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Settings01Icon,
  UserIcon,
  Telescope01Icon,
} from '@hugeicons/core-free-icons'

const HTTP_URL = (import.meta.env.VITE_BACKEND_HTTP_URL as string) || 'http://localhost:8000'

interface UsageStat {
  model: string
  provider_type: string
  requests: number
  total_input_chars: number
  total_output_chars: number
  last_used: string
}

interface UserProfile {
  name: string
  email: string
  avatar: string
}

interface SettingsViewProps {
  onProfileChange?: (profile: UserProfile) => void
}

function estimateTokens(chars: number): string {
  const tokens = Math.round(chars / 4)
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}


// ── Profile section ────────────────────────────────────────────────────────────

function ProfileSection({ onProfileChange }: { onProfileChange?: (p: UserProfile) => void }) {
  const [profile, setProfile] = useState<UserProfile>({ name: '', email: '', avatar: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${HTTP_URL}/api/settings/user`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setProfile(d) })
      .catch(() => {})
  }, [])

  async function save(updated: UserProfile) {
    setSaving(true)
    setSaved(false)
    try {
      await fetch(`${HTTP_URL}/api/settings/user`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
      setSaved(true)
      onProfileChange?.(updated)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const updated = { ...profile, avatar: reader.result as string }
      setProfile(updated)
      save(updated)
    }
    reader.readAsDataURL(file)
  }

  const initials = profile.name ? profile.name.slice(0, 2).toUpperCase() : 'U'

  return (
    <div className="border-2 border-zinc-800 bg-[#1b1b1b]/40 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-5">
        <HugeiconsIcon icon={UserIcon} size={16} className="text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-100 font-helvetica ">Profile</h2>
      </div>

      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-zinc-700 overflow-hidden flex items-center justify-center">
            {profile.avatar ? (
              <img src={profile.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-zinc-400 text-lg font-semibold font-helvetica">{initials}</span>
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-zinc-700 border-2 border-zinc-600 flex items-center justify-center hover:bg-zinc-600 transition-colors"
            title="Upload photo"
          >
            <Camera className="w-3 h-3 text-zinc-300" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFile}
          />
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-3 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500 font-helvetica ">Display name</label>
              <input
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                onBlur={() => save(profile)}
                placeholder="Your name"
                className="bg-[#1a1a1a] border-2 border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 font-helvetica"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500 font-helvetica ">Email</label>
              <input
                value={profile.email}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                onBlur={() => save(profile)}
                placeholder="you@example.com"
                className="bg-[#1a1a1a] border-2 border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 font-helvetica"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 h-5">
            {saving && <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />}
            {saved && <span className="text-xs text-zinc-500 font-helvetica">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Usage stats section ────────────────────────────────────────────────────────

function UsageSection() {
  const [stats, setStats] = useState<UsageStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${HTTP_URL}/api/stats/usage`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setStats(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totalRequests = stats.reduce((s, r) => s + r.requests, 0)
  const totalInputChars = stats.reduce((s, r) => s + r.total_input_chars, 0)
  const totalOutputChars = stats.reduce((s, r) => s + r.total_output_chars, 0)

  return (
    <div className="border-2 border-zinc-800 bg-[#1b1b1b]/40 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-5">
        
        <h2 className="text-sm font-semibold text-zinc-100 font-helvetica ">Model usage</h2>
        <span className="text-xs text-zinc-600 font-helvetica">tokens estimated at 4 chars each</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Loading stats...</span>
        </div>
      ) : stats.length === 0 ? (
        <p className="text-xs text-zinc-600 font-helvetica">No usage data yet. Send a few messages to see stats here.</p>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Total requests', value: totalRequests.toLocaleString() },
              { label: 'Est. input tokens', value: estimateTokens(totalInputChars) },
              { label: 'Est. output tokens', value: estimateTokens(totalOutputChars) },
            ].map((item) => (
              <div key={item.label} className="bg-zinc-900/40 border-2 border-zinc-800/60 rounded-lg p-3">
                <p className="text-xs text-zinc-500 font-helvetica  mb-1">{item.label}</p>
                <p className="text-lg font-semibold text-zinc-100 font-helvetica tracking-tight">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Per-model table */}
          <table className="w-full text-xs font-helvetica ">
            <thead>
              <tr className="border-b-2 border-zinc-800">
                {['Model', 'Type', 'Requests', 'Input tokens', 'Output tokens', 'Last used'].map((h) => (
                  <th key={h} className="text-left text-zinc-500 pb-2 pr-4 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((row, i) => (
                <tr key={i} className="border-b-2 border-zinc-800/40 last:border-0">
                  <td className="py-2.5 pr-4 text-zinc-200 truncate max-w-[180px]">{row.model}</td>
                  <td className="py-2.5 pr-4 text-zinc-500">{row.provider_type}</td>
                  <td className="py-2.5 pr-4 text-zinc-300">{row.requests.toLocaleString()}</td>
                  <td className="py-2.5 pr-4 text-zinc-300">{estimateTokens(row.total_input_chars)}</td>
                  <td className="py-2.5 pr-4 text-zinc-300">{estimateTokens(row.total_output_chars)}</td>
                  <td className="py-2.5 text-zinc-600">{formatDate(row.last_used)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

// ── Base URL guide section ─────────────────────────────────────────────────────

function BaseUrlGuideSection() {
  return (
    <div className=" rounded-lg p-6">
      {/* <div className="flex items-center gap-2 mb-5">
        <HugeiconsIcon icon={InformationCircleIcon} size={16} className="text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-100 font-helvetica ">Provider base URL guide</h2>
      </div>

      <div className="flex flex-col gap-4">
        {Object.entries(BASE_URL_GUIDE).map(([key, info]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-3">
              <span className="text-xs font-semibold text-zinc-300 font-helvetica  w-36 shrink-0">{info.label}</span>
              <code className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 font-mono">{info.example}</code>
            </div>
            <p className="text-xs text-zinc-600 font-helvetica  pl-[9.5rem]">{info.note}</p>
          </div>
        ))}

        <div className="mt-2 p-3 bg-zinc-900/40 border border-zinc-800/60 rounded-lg">
          <p className="text-xs text-zinc-500 font-helvetica  leading-relaxed">
            API keys are stored in the local app database on your device and never transmitted to any server other than the provider you configure.
          </p>
        </div>
      </div> */}
    </div>
  )
}

// ── Skills & Connections section ───────────────────────────────────────────────

interface McpConnection {
  id: string
  name: string
  connection_type: 'sse' | 'http' | 'stdio'
  url: string
  command: string
  api_key_masked: string
  is_enabled: boolean
}

const emptyForm = { name: '', connection_type: 'sse' as 'sse' | 'http' | 'stdio', url: '', command: '', api_key: '' }
const TYPE_BADGE: Record<string, string> = {
  sse: 'bg-cyan-950 text-cyan-400 border-2 border-cyan-900',
  http: 'bg-indigo-950 text-indigo-400 border-2 border-indigo-900',
  stdio: 'bg-amber-950 text-amber-400 border-2 border-amber-900',
}

function SkillsAndConnectionsSection() {
  const [connections, setConnections] = useState<McpConnection[]>([])
  const [serperOk, setSerperOk] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${HTTP_URL}/api/mcp-connections`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setConnections(d) })
      .catch(() => {})
    fetch(`${HTTP_URL}/api/settings/integrations`)
      .then((r) => r.json())
      .then((d) => setSerperOk(!!d.serper_configured))
      .catch(() => {})
  }, [])

  async function handleToggle(id: string) {
    const res = await fetch(`${HTTP_URL}/api/mcp-connections/${id}/toggle`, { method: 'PUT' })
    const data = await res.json()
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, is_enabled: data.is_enabled } : c)))
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await fetch(`${HTTP_URL}/api/mcp-connections/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        setConnections((prev) => prev.map((c) => c.id === editingId ? { ...c, ...form, api_key_masked: form.api_key ? form.api_key.slice(0, 4) + '...' : c.api_key_masked } : c))
      } else {
        const res = await fetch(`${HTTP_URL}/api/mcp-connections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = await res.json()
        setConnections((prev) => [...prev, { ...form, id: data.id, api_key_masked: form.api_key ? form.api_key.slice(0, 4) + '...' : '', is_enabled: true, created_at: '' } as McpConnection])
      }
      setShowForm(false)
      setEditingId(null)
      setForm({ ...emptyForm })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`${HTTP_URL}/api/mcp-connections/${id}`, { method: 'DELETE' })
    setConnections((prev) => prev.filter((c) => c.id !== id))
    setConfirmDelete(null)
  }

  function startEdit(conn: McpConnection) {
    setEditingId(conn.id)
    setForm({ name: conn.name, connection_type: conn.connection_type, url: conn.url, command: conn.command, api_key: '' })
    setShowForm(true)
  }

  const skills = [
    { label: 'Web Search', icon: <Globe className="w-4 h-4" />, color: '#1EAEDB', ok: serperOk, note: serperOk ? 'Active' : 'Needs Serper API key' },
    { label: 'Deep Think', icon: <BrainCog className="w-4 h-4" />, color: '#8B5CF6', ok: true, note: 'Always available' },
    { label: 'Research / Plan', icon: <HugeiconsIcon icon={Telescope01Icon} className="w-4 h-4" />, color: '#F97316', ok: true, note: 'Always available' },
    { label: 'File Upload / RAG', icon: <Paperclip className="w-4 h-4" />, color: '#6B7280', ok: true, note: 'Always available' },
  ]

  return (
    <div className="border-2 border-zinc-800 bg-[#1b1b1b]/40 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-5">
        <Plug className="w-4 h-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-100 font-helvetica ">Skills & Connections</h2>
      </div>

      {/* Built-in Skills */}
      <div className="mb-5">
        <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-3 font-helvetica">Built-in Skills</p>
        <div className="flex flex-col gap-2">
          {skills.map((skill) => (
            <div key={skill.label} className="flex items-center justify-between py-1.5 px-3 bg-[#1a1a1a] border-2 border-zinc-800 rounded-lg">
              <div className="flex items-center gap-2.5">
                <span style={{ color: skill.ok ? skill.color : '#4B5563' }}>{skill.icon}</span>
                <span className="text-xs text-zinc-300 font-helvetica tracking-tight">{skill.label}</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border-2 font-helvetica ${skill.ok ? 'bg-emerald-950 text-emerald-400 border-2 border-emerald-900' : 'bg-red-950 text-red-400 border-2 border-red-900'}`}>
                {skill.note}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* MCP Servers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest font-helvetica">MCP Servers</p>
          <button
            onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setShowForm(true) }}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-helvetica"
          >
            <Plus className="w-3.5 h-3.5" /> Add server
          </button>
        </div>

        {/* Add / Edit form */}
        {showForm && (
          <div className="mb-3 p-4 bg-[#1a1a1a] border-2 border-zinc-700 rounded-lg flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400 font-helvetica tracking-tight">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. GitHub, Filesystem..."
                className="bg-[#1b1b1b] border-2 border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-helvetica"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400 font-helvetica tracking-tight">Transport</label>
              <div className="flex gap-2">
                {(['sse', 'http', 'stdio'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, connection_type: t }))}
                    className={`px-3 py-1.5 rounded-lg text-xs border-2 font-mono transition-colors ${form.connection_type === t ? TYPE_BADGE[t] + ' font-semibold' : 'bg-zinc-900 text-zinc-500 border-2 border-zinc-800 hover:border-zinc-600'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {form.connection_type !== 'stdio' ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400 font-helvetica tracking-tight">Server URL</label>
                <input
                  type="text"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://mcp.example.com/sse"
                  className="bg-[#1b1b1b] border-2 border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400 font-helvetica tracking-tight">Command</label>
                <input
                  type="text"
                  value={form.command}
                  onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
                  placeholder="npx -y @modelcontextprotocol/server-filesystem /path"
                  className="bg-[#1b1b1b] border-2 border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400 font-helvetica tracking-tight">API Key <span className="text-zinc-600">(optional)</span></label>
              <input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                placeholder={editingId ? 'Leave blank to keep existing' : 'Bearer token or API key'}
                className="bg-[#1b1b1b] border-2 border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs text-zinc-100 font-helvetica transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingId ? 'Update' : 'Add'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...emptyForm }) }}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-lg text-xs text-zinc-400 font-helvetica transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {connections.length === 0 && !showForm ? (
          <div className="flex flex-col items-center gap-2 py-6 border-2 border-dashed border-zinc-800 rounded-lg">
            <Server className="w-6 h-6 text-zinc-700" />
            <p className="text-xs text-zinc-600 font-helvetica">No MCP servers configured</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {connections.map((conn) => (
              <div key={conn.id} className="flex items-center justify-between py-2 px-3 bg-[#1a1a1a] border-2 border-zinc-800 rounded-lg group">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${conn.is_enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                  <span className="text-xs text-zinc-300 font-helvetica truncate">{conn.name}</span>
                  <span className={`text-[10px] px-1 py-0.5 rounded border-2 font-mono flex-shrink-0 ${TYPE_BADGE[conn.connection_type] ?? 'bg-zinc-900 text-zinc-500 border-2 border-zinc-800'}`}>
                    {conn.connection_type}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <button
                    onClick={() => startEdit(conn)}
                    className="text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {confirmDelete === conn.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(conn.id)} className="text-red-400 hover:text-red-300 text-[10px] font-helvetica transition-colors">Delete</button>
                      <button onClick={() => setConfirmDelete(null)} className="text-zinc-500 hover:text-zinc-300 text-[10px] font-helvetica transition-colors">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(conn.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleToggle(conn.id)}
                    className={`w-7 h-4 rounded-full border-2 transition-all flex-shrink-0 relative ${conn.is_enabled ? 'bg-emerald-500/20 border-emerald-600' : 'bg-zinc-800 border-zinc-700'}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${conn.is_enabled ? 'left-3.5 bg-emerald-500' : 'left-0.5 bg-zinc-600'}`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Integrations section ───────────────────────────────────────────────────────

function IntegrationsSection() {
  const [serperKey, setSerperKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [maskedKey, setMaskedKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${HTTP_URL}/api/settings/integrations`)
      .then((r) => r.json())
      .then((d) => {
        setConfigured(d.serper_configured)
        setMaskedKey(d.serper_api_key_masked || '')
      })
      .catch(() => {})
  }, [])

  async function save() {
    const key = serperKey.trim()
    if (!key) return
    setSaving(true)
    try {
      await fetch(`${HTTP_URL}/api/settings/integrations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serper_api_key: key }),
      })
      setConfigured(true)
      setMaskedKey(key.slice(0, 4) + '...' + key.slice(-4))
      setSerperKey('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    await fetch(`${HTTP_URL}/api/settings/integrations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serper_api_key: '__clear__' }),
    })
    setConfigured(false)
    setMaskedKey('')
    setSerperKey('')
  }

  return (
    <div className="border-2 border-zinc-800 bg-[#1b1b1b]/40 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-sm font-semibold text-zinc-100 font-helvetica ">Integrations</h2>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400 font-helvetica ">Serper API Key</label>
          {configured && (
            <span className="flex items-center gap-1 text-xs text-emerald-500 font-helvetica">
              <Check className="w-3 h-3" />
              {maskedKey}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-600 font-helvetica  mb-2">
          Powers live web search in Research mode ([Search: topic]). Free tier at serper.dev — 2,500 searches/month.
        </p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="password"
            value={serperKey}
            onChange={(e) => setSerperKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={configured ? 'Paste new key to replace...' : 'Paste your Serper API key'}
            className="flex-1 bg-[#1a1a1a] border-2 border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
          />
          <button
            onClick={save}
            disabled={saving || !serperKey.trim()}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs text-zinc-100 font-helvetica transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? 'Saved' : 'Save'}
          </button>
          {configured && (
            <button
              onClick={clear}
              title="Remove key"
              className="px-3 py-2 bg-zinc-900 hover:bg-red-950 border-2 border-zinc-800 hover:border-red-900 rounded-lg text-zinc-500 hover:text-red-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export interface UserProfile_ {
  name: string
  email: string
  avatar: string
}

export function SettingsView({ onProfileChange }: SettingsViewProps) {
  return (
    <div className="flex-1 overflow-y-auto no-scrollbar pt-16 pb-8 px-6 mx-auto w-full max-w-3xl flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={Settings01Icon} size={20} className="text-zinc-400" />
        <h1 className="text-3xl font-bold font-helvetica  text-zinc-100">Settings</h1>
      </div>

      <ProfileSection onProfileChange={onProfileChange} />
      <SkillsAndConnectionsSection />
      <IntegrationsSection />
      <UsageSection />
      <BaseUrlGuideSection />
    </div>
  )
}
