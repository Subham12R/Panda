import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AppSidebar } from '@/components/app-sidebar'
import { type ProviderOption } from '@/components/model-selector'
import { PromptInputBox } from '@/components/ui/ai-prompt-box'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Spinner, type ThinkingStep } from '@renderer/components/spinner'
import { ResearchTrace, type TraceEvent } from '@renderer/components/research-trace'
import { SettingsView } from '@renderer/components/settings-view'
import { Check, ChevronDown, ChevronLeft, Code2, Copy, FileText, FolderOpen, FolderPlus, Globe, MoreHorizontal, MoreVertical, Pencil, Pin, Plus, Search, Server, Share2, Trash2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Message = {
  from: 'user' | 'assistant'
  text: string
  rawText?: string
  requestId?: string
  streaming?: boolean
  stopped?: boolean
  startedAt?: number
  durationMs?: number
  steps?: ThinkingStep[]
  traces?: TraceEvent[]
  mode?: string
  fileAttachment?: { name: string; size: number; mimeType: string }
}

type Session = {
  id: string
  title: string
  pinned?: boolean
  folder_id?: string | null
  created_at?: string
  last_message_at?: string
  message_count?: number
  summary?: string
}

type Folder = {
  id: string
  name: string
  position: number
}

type UserProfile = {
  name: string
  email: string
  avatar: string
}

type Provider = ProviderOption & {
  base_url: string
  api_key_masked: string
  created_at?: string
}

type DbMessage = {
  role: 'user' | 'assistant'
  content: string
}

const WS_URL = import.meta.env.VITE_BACKEND_WS_URL as string
const HTTP_URL = (import.meta.env.VITE_BACKEND_HTTP_URL as string) || 'http://localhost:8000'

const emptyProviderForm = {
  id: '',
  name: '',
  provider_type: 'ollama',
  model: '',
  base_url: 'http://localhost:11434/v1',
  api_key: '',
  is_active: false,
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileTypeBadge(name: string): { label: string; bg: string; text: string } {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return { label: 'PDF', bg: 'bg-purple-950/80', text: 'text-purple-300' }
  if (ext === 'csv') return { label: 'CSV', bg: 'bg-green-950/80', text: 'text-green-300' }
  if (ext === 'docx' || ext === 'doc') return { label: 'DOC', bg: 'bg-blue-950/80', text: 'text-blue-300' }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return { label: 'IMG', bg: 'bg-orange-950/80', text: 'text-orange-300' }
  if (ext === 'txt') return { label: 'TXT', bg: 'bg-zinc-800', text: 'text-zinc-400' }
  if (ext === 'md') return { label: 'MD', bg: 'bg-zinc-800', text: 'text-zinc-400' }
  return { label: ext.toUpperCase().slice(0, 4) || 'FILE', bg: 'bg-zinc-800', text: 'text-zinc-500' }
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'No activity'
  const date = new Date(isoString)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin} min ago`
  if (diffHour < 24) return `${diffHour} hr ago`
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function parseDbMessage(msg: DbMessage): Message {
  return {
    from: msg.role,
    text: msg.content,
    rawText: msg.content,
    streaming: false,
  }
}

const markdownComponents = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-2 last:mb-0 text-zinc-300 leading-relaxed">{children}</p>
  ),
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-zinc-100 font-semibold font-helvetica tracking-tight text-base mb-1 mt-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-zinc-100 font-semibold font-helvetica tracking-tight text-sm mb-1 mt-3 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-zinc-200 font-semibold font-helvetica tracking-tight text-sm mb-1 mt-2 first:mt-0">{children}</h3>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="pl-4 mb-2 space-y-0.5 text-zinc-300 list-disc">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="pl-4 mb-2 space-y-0.5 text-zinc-300 list-decimal">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-zinc-300">{children}</li>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="text-zinc-100 font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="text-zinc-300 italic">{children}</em>
  ),
  code: ({ children, className }: { children?: ReactNode; className?: string }) => {
    const isBlock = className?.startsWith('language-')
    return isBlock ? (
      <code className="block bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs font-mono overflow-x-auto text-zinc-300 my-2">{children}</code>
    ) : (
      <code className="bg-zinc-800 text-zinc-200 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
    )
  },
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="my-2 overflow-x-auto">{children}</pre>
  ),
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} className="text-zinc-400 underline underline-offset-2 hover:text-zinc-200 transition-colors" target="_blank" rel="noreferrer">{children}</a>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-2 border-zinc-700 pl-3 my-2 text-zinc-400 italic">{children}</blockquote>
  ),
  hr: () => <hr className="border-zinc-800 my-3" />,
}

function upsertAssistantMessage(messages: Message[], requestId: string, patch: Partial<Message>): Message[] {
  const existingIndex = messages.findIndex((msg) => msg.from === 'assistant' && msg.requestId === requestId)
  if (existingIndex === -1) {
    return [
      ...messages,
      {
        from: 'assistant',
        text: '',
        rawText: '',
        requestId,
        streaming: true,
        ...patch,
      },
    ]
  }

  const next = [...messages]
  next[existingIndex] = { ...next[existingIndex], ...patch }
  return next
}

function App(): ReactNode {
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesCache, setMessagesCache] = useState<Record<string, Message[]>>({})
  const [sessions, setSessions] = useState<Session[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'chat' | 'chats-list' | 'projects' | 'providers' | 'settings'>('chat')
  const [serperConfigured, setSerperConfigured] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [filterMode, setFilterMode] = useState<'All' | 'Active' | 'Empty'>('All')
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
  const [providerForm, setProviderForm] = useState(emptyProviderForm)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: '', email: '', avatar: '' })
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null)
  const [greetingIndex, setGreetingIndex] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentSessionIdRef = useRef<string | null>(null)
  const activeRequestIdRef = useRef<string | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [backendReady, setBackendReady] = useState(false)
  const providerKeyToastShown = useRef(false)
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? providers[0]

  // Toast: warn when active provider has no API key
  useEffect(() => {
    if (providers.length === 0 || providerKeyToastShown.current) return
    providerKeyToastShown.current = true
    const active = providers.find((p: Provider) => p.is_active) ?? providers[0]
    if (active && active.provider_type !== 'ollama' && !active.api_key_masked) {
      toast.warning(`${active.name} has no API key`, {
        description: 'Add your API key to start chatting.',
        action: { label: 'Manage Providers', onClick: () => setActiveView('providers') },
        duration: Infinity,
      })
    }
  }, [providers])

  useEffect(() => {
    let cancelled = false

    async function poll(): Promise<void> {
      while (!cancelled) {
        try {
          const res = await fetch(`${HTTP_URL}/health`)
          const data = await res.json()
          if (data.ready) {
            setBackendReady(true)
            if (!cancelled) {
              fetchProviders()
              fetchSessions(true)
              fetchFolders()
              fetchUserProfile()
              // Check Serper key — inform user if research web search is unconfigured
              fetch(`${HTTP_URL}/api/settings/integrations`)
                .then((r) => r.json())
                .then((d) => {
                  setSerperConfigured(!!d.serper_configured)
                  if (!d.serper_configured) {
                    toast('Research mode has no web search', {
                      description: 'Add a Serper API key in Settings to enable live results.',
                      action: { label: 'Open Settings', onClick: () => setActiveView('settings') },
                      duration: 7000,
                    })
                  }
                })
                .catch(() => {})
            }
            return
          }
        } catch {
          // backend not up yet
        }
        if (!cancelled) await new Promise<void>((resolve) => setTimeout(resolve, 500))
      }
    }

    poll()
    return () => { cancelled = true }
  }, [])

  async function fetchSessions(autoSelectFirst = false): Promise<void> {
    try {
      const res = await fetch(`${HTTP_URL}/api/sessions`)
      const data = await res.json()
      if (!Array.isArray(data)) return
      setSessions(data)
      if (autoSelectFirst && data.length > 0 && !currentSessionIdRef.current) {
        await handleSelectSession(data[0].id)
      }
    } catch (error) {
      console.error('Error fetching sessions:', error)
    }
  }

 async function fetchProviders(retry = 0): Promise<void> {
  try {
    const res = await fetch(`${HTTP_URL}/api/providers`)

    if (!res.ok) {
      throw new Error("Provider API unavailable")
    }

    const data = await res.json()

    if (!Array.isArray(data)) throw new Error(`Unexpected providers response: ${JSON.stringify(data)}`)

    setProviders(data)

    const active =
      data.find((p: Provider) => p.is_active) ?? data[0]

    if (active) {
      setSelectedProviderId(active.id)
    }
  } catch (err) {
    console.error(err)

    if (retry < 10) {
      setTimeout(() => {
        fetchProviders(retry + 1)
      }, 1000)
    }
  }
}
  async function fetchFolders(): Promise<void> {
    try {
      const res = await fetch(`${HTTP_URL}/api/folders`)
      const data = await res.json()
      if (Array.isArray(data)) setFolders(data)
    } catch {}
  }

  async function fetchUserProfile(): Promise<void> {
    try {
      const res = await fetch(`${HTTP_URL}/api/settings/user`)
      const data = await res.json()
      if (!data.error) setUserProfile(data)
    } catch {}
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const greetings = useMemo(() => {
    const name = userProfile.name?.trim()
    const welcome = name ? `Welcome back, ${name}.` : 'Welcome back.'
    return [
      welcome,
      'What are you up to today?',
      'How can I help you today?',
      'What would you like to build?',
      'What should we research?',
      'What can I do for you?'
    ]
  }, [userProfile.name])

  useEffect(() => {
    if (messages.length > 0) return
    const timer = setInterval(() => {
      setGreetingIndex((prev) => (prev + 1) % greetings.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [messages.length, greetings.length])

  useEffect(() => {
    if (!WS_URL) return
    let cancelled = false

    function connect(): void {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onmessage = (event) => {
        if (cancelled) return
        const data = JSON.parse(event.data)
        const targetId = data.session_id || currentSessionIdRef.current
        const requestId = data.request_id || activeRequestIdRef.current
        if (!targetId || !requestId) return

        if (data.type === 'accepted') {
          currentSessionIdRef.current = targetId
          setCurrentSessionId(targetId)
          if (data.mode) {
            updateAssistant(targetId, requestId, { mode: data.mode })
          }
          fetchSessions(false)
          return
        }

        if (data.type === 'workflow') {
          updateAssistant(targetId, requestId, { steps: data.steps, streaming: true })
          return
        }

        if (data.type === 'trace') {
          setMessagesCache((cache) => {
            const prev = cache[targetId] || []
            const existing = prev.find((msg) => msg.from === 'assistant' && msg.requestId === requestId)
            const prevTraces = existing?.traces || []
            const nextMessages = upsertAssistantMessage(prev, requestId, {
              traces: [...prevTraces, data],
              streaming: true,
            })
            if (targetId === currentSessionIdRef.current) setMessages(nextMessages)
            return { ...cache, [targetId]: nextMessages }
          })
          return
        }

        if (data.type === 'delta') {
          setIsLoading(false)
          setMessagesCache((cache) => {
            const prev = cache[targetId] || []
            const current = prev.find((msg) => msg.from === 'assistant' && msg.requestId === requestId)
            const rawText = `${current?.rawText || ''}${data.text}`
            const nextMessages = upsertAssistantMessage(prev, requestId, {
              text: rawText,
              rawText,
              streaming: true,
            })
            if (targetId === currentSessionIdRef.current) setMessages(nextMessages)
            return { ...cache, [targetId]: nextMessages }
          })
          return
        }

        if (data.type === 'done') {
          finishAssistant(targetId, requestId, false, data.steps)
          fetchSessions(false)
          return
        }

        if (data.type === 'stopped') {
          finishAssistant(targetId, requestId, true)
          return
        }

        if (data.type === 'error') {
          setIsLoading(false)
          updateAssistant(targetId, requestId, {
            text: `Error: ${data.message}`,
            rawText: `Error: ${data.message}`,
            streaming: false,
          })
        }
      }

      ws.onclose = () => {
        if (cancelled) return
        reconnectTimerRef.current = setTimeout(connect, 1200)
      }

      ws.onerror = () => {
        if (cancelled) return
        ws.close()
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (container && container.scrollTop + container.clientHeight >= container.scrollHeight - 60) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

  function updateAssistant(sessionId: string, requestId: string, patch: Partial<Message>): void {
    setMessagesCache((cache) => {
      const prev = cache[sessionId] || []
      const nextMessages = upsertAssistantMessage(prev, requestId, patch)
      if (sessionId === currentSessionIdRef.current) setMessages(nextMessages)
      return { ...cache, [sessionId]: nextMessages }
    })
  }

  function finishAssistant(sessionId: string, requestId: string, stopped: boolean, steps?: ThinkingStep[]): void {
    setIsLoading(false)
    if (activeRequestIdRef.current === requestId) activeRequestIdRef.current = null
    setMessagesCache((cache) => {
      const prev = cache[sessionId] || []
      const existing = prev.find((msg) => msg.from === 'assistant' && msg.requestId === requestId)
      const text = stopped && !existing?.text ? 'Stopped.' : existing?.text || ''
      const durationMs = existing?.startedAt ? Date.now() - existing.startedAt : undefined
      const nextMessages = upsertAssistantMessage(prev, requestId, {
        text,
        rawText: text,
        streaming: false,
        stopped,
        durationMs,
        steps: steps ?? existing?.steps,
      })
      if (sessionId === currentSessionIdRef.current) setMessages(nextMessages)
      return { ...cache, [sessionId]: nextMessages }
    })
  }

  async function handleSelectSession(sessionId: string): Promise<void> {
    setActiveView('chat')
    currentSessionIdRef.current = sessionId
    setCurrentSessionId(sessionId)

    const cached = messagesCache[sessionId]
    if (cached) {
      setMessages(cached)
      setIsLoading(cached.some((msg) => msg.streaming))
    }

    try {
      const res = await fetch(`${HTTP_URL}/api/sessions/${sessionId}/messages`)
      const data = await res.json()
      if (!Array.isArray(data)) return
      const fetched = data.map(parseDbMessage)
      setMessagesCache((cache) => ({ ...cache, [sessionId]: fetched }))
      if (currentSessionIdRef.current === sessionId) {
        setMessages(fetched)
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Error loading session messages:', error)
      setIsLoading(false)
    }
  }

  async function handleCreateSession(): Promise<void> {
    const newId = crypto.randomUUID()
    const newSession = { id: newId, title: 'New Chat', message_count: 0 }
    setSessions((prev) => [newSession, ...prev])
    setMessagesCache((prev) => ({ ...prev, [newId]: [] }))
    currentSessionIdRef.current = newId
    setCurrentSessionId(newId)
    setMessages([])
    setIsLoading(false)
    setActiveView('chat')

    try {
      await fetch(`${HTTP_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newId, title: 'New Chat' }),
      })
      fetchSessions(false)
    } catch (error) {
      console.error('Error creating session:', error)
    }
  }

  async function handleRenameSession(sessionId: string, newTitle: string): Promise<void> {
    const title = newTitle.trim()
    if (!title) return
    setSessions((prev) => prev.map((session) => (session.id === sessionId ? { ...session, title } : session)))
    await fetch(`${HTTP_URL}/api/sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    fetchSessions(false)
  }

  async function handleDeleteSession(sessionId: string): Promise<void> {
    setSessions((prev) => prev.filter((session) => session.id !== sessionId))
    setMessagesCache((prev) => {
      const next = { ...prev }
      delete next[sessionId]
      return next
    })
    if (currentSessionIdRef.current === sessionId) {
      currentSessionIdRef.current = null
      setCurrentSessionId(null)
      setMessages([])
    }
    await fetch(`${HTTP_URL}/api/sessions/${sessionId}`, { method: 'DELETE' })
    fetchSessions(false)
  }

  async function handleDeleteSelected(): Promise<void> {
    const ids = Array.from(selectedSessions)
    if (ids.length === 0) return
    await Promise.all(ids.map((id) => handleDeleteSession(id)))
    setSelectedSessions(new Set())
    setIsSelectionMode(false)
  }

  async function handlePinSession(sessionId: string): Promise<void> {
    const res = await fetch(`${HTTP_URL}/api/sessions/${sessionId}/pin`, { method: 'PUT' })
    const data = await res.json()
    setSessions((prev) =>
      prev
        .map((s) => (s.id === sessionId ? { ...s, pinned: data.pinned } : s))
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
    )
  }

  async function handleSetSessionFolder(sessionId: string, folderId: string | null): Promise<void> {
    await fetch(`${HTTP_URL}/api/sessions/${sessionId}/folder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folderId }),
    })
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, folder_id: folderId } : s)))
  }

  async function handleCreateFolder(name: string): Promise<void> {
    const res = await fetch(`${HTTP_URL}/api/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    if (!data.error) setFolders((prev) => [...prev, { id: data.id, name: data.name, position: prev.length }])
  }

  async function handleDeleteFolder(folderId: string): Promise<void> {
    await fetch(`${HTTP_URL}/api/folders/${folderId}`, { method: 'DELETE' })
    setFolders((prev) => prev.filter((f) => f.id !== folderId))
    setSessions((prev) => prev.map((s) => (s.folder_id === folderId ? { ...s, folder_id: null } : s)))
  }

  async function handleRenameFolder(folderId: string, name: string): Promise<void> {
    await fetch(`${HTTP_URL}/api/folders/${folderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)))
  }

  async function handleUploadDoc(file: File): Promise<{ chunks: number; filename: string }> {
    let sessionId = currentSessionIdRef.current
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      currentSessionIdRef.current = sessionId
      setCurrentSessionId(sessionId)
      await fetch(`${HTTP_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, title: file.name.replace(/\.[^.]+$/, '') }),
      })
      fetchSessions(false)
    }
    const form = new FormData()
    form.append('file', file)
    const resp = await fetch(`${HTTP_URL}/api/sessions/${sessionId}/upload`, { method: 'POST', body: form })
    const data = await resp.json()
    if (data.error) throw new Error(data.error)
    return { chunks: data.chunks, filename: data.filename }
  }

  function handleSend(text: string, _files?: File[], docInfo?: { name: string; chunks: number; size: number; mimeType: string }): void {
    const trimmed = text.trim()
    if (!trimmed || !selectedProvider) return

    const sessionId = currentSessionIdRef.current || crypto.randomUUID()
    const requestId = crypto.randomUUID()
    activeRequestIdRef.current = requestId
    currentSessionIdRef.current = sessionId
    setCurrentSessionId(sessionId)
    setIsLoading(true)

    let nextMessages = [...messages]

    const detectedMode = trimmed.startsWith('[Plan:') ? 'plan'
      : trimmed.startsWith('[Search:') ? 'research'
      : trimmed.startsWith('[Think:') ? 'think'
      : 'chat'
    const isResearchMode = detectedMode === 'plan' || detectedMode === 'research'

    const displayText = trimmed.startsWith('[Plan:') ? trimmed.slice(6, -1).trim()
      : trimmed.startsWith('[Search:') ? trimmed.slice(8, -1).trim()
      : trimmed.startsWith('[Think:') ? trimmed.slice(7, -1).trim()
      : trimmed

    const userMessage: Message = {
      from: 'user',
      text: displayText,
      fileAttachment: docInfo ? { name: docInfo.name, size: docInfo.size, mimeType: docInfo.mimeType } : undefined,
    }
    const assistantMessage: Message = {
      from: 'assistant',
      text: '',
      rawText: '',
      requestId,
      startedAt: Date.now(),
      streaming: true,
      mode: detectedMode,
      steps: !isResearchMode ? [] : undefined,
      traces: isResearchMode ? [] : undefined,
    }
    nextMessages.push(userMessage, assistantMessage)
    setMessages(nextMessages)
    setMessagesCache((cache) => ({ ...cache, [sessionId]: nextMessages }))

    if (!currentSessionId) {
      fetch(`${HTTP_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, title: displayText.slice(0, 40) || 'New Chat' }),
      }).then(() => fetchSessions(false))
    }

    const activeSession = sessions.find((session) => session.id === sessionId)
    if (activeSession?.title === 'New Chat') {
      handleRenameSession(sessionId, displayText.slice(0, 40))
    }

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      updateAssistant(sessionId, requestId, {
        text: 'Try again in a moment.',
        streaming: false,
      })
      setIsLoading(false)
      return
    }

    wsRef.current.send(
      JSON.stringify({
        type: 'chat',
        text: trimmed,
        session_id: sessionId,
        request_id: requestId,
        provider_id: selectedProvider.id,
        model: selectedProvider.model,
      }),
    )
  }

  function handleStop(): void {
    const requestId = activeRequestIdRef.current
    if (!requestId || wsRef.current?.readyState !== WebSocket.OPEN) {
      setIsLoading(false)
      return
    }
    wsRef.current.send(JSON.stringify({ type: 'stop', request_id: requestId }))
  }

  function toggleSessionSelection(id: string): void {
    setSelectedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startProviderEdit(provider: Provider): void {
    setEditingProviderId(provider.id)
    setProviderForm({
      id: provider.id,
      name: provider.name,
      provider_type: provider.provider_type,
      model: provider.model,
      base_url: provider.base_url || '',
      api_key: '',
      is_active: provider.is_active,
    })
  }

  async function saveProvider(): Promise<void> {
    if (!providerForm.name.trim() || !providerForm.model.trim()) return
    const method = editingProviderId ? 'PUT' : 'POST'
    const url = editingProviderId
      ? `${HTTP_URL}/api/providers/${editingProviderId}`
      : `${HTTP_URL}/api/providers`

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(providerForm),
    })
    setProviderForm(emptyProviderForm)
    setEditingProviderId(null)
    await fetchProviders()
  }

  async function removeProvider(providerId: string): Promise<void> {
    await fetch(`${HTTP_URL}/api/providers/${providerId}`, { method: 'DELETE' })
    await fetchProviders()
  }

  const streamingSessionIds = useMemo(
    () =>
      Object.entries(messagesCache)
        .filter(([, msgs]) => msgs.some((msg) => msg.streaming))
        .map(([id]) => id),
    [messagesCache],
  )

  const filteredSessions = sessions.filter((session) => {
    const query = searchQuery.toLowerCase()
    const matchesSearch = session.title.toLowerCase().includes(query) || session.summary?.toLowerCase().includes(query)
    if (!matchesSearch) return false
    if (filterMode === 'Active') return (session.message_count || 0) > 0
    if (filterMode === 'Empty') return (session.message_count || 0) === 0
    return true
  })

  const isEmpty = messages.length === 0

  if (!backendReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#1a1a1a] text-zinc-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">Starting Pandas...</p>
        </div>
      </div>
    )
  }



  return (
    <SidebarProvider className="dark:bg-[#1a1a1a] bg-zinc-100 dark:text-zinc-100 text-zinc-900 h-screen overflow-hidden">
      <AppSidebar
        variant="floating"
        sessions={sessions}
        currentSessionId={currentSessionId}
        activeView={activeView}
        streamingSessionIds={streamingSessionIds}
        userProfile={userProfile}
        onSelectSession={handleSelectSession}
        onCreateSession={handleCreateSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        onPinSession={handlePinSession}
        onShowChatsList={() => {
          setActiveView('chats-list')
          setIsSelectionMode(false)
          setSelectedSessions(new Set())
        }}
        onShowProjects={() => setActiveView('projects')}
        onShowProviders={() => setActiveView('providers')}
        onShowSettings={() => setActiveView('settings')}
      />

      <SidebarInset className="dark:bg-[#1a1a1a] bg-zinc-100 dark:text-zinc-100 text-zinc-900 h-screen overflow-hidden flex flex-col relative">
        <header className="absolute top-0 left-0 right-0 z-50 flex h-14 items-center justify-between px-4 dark:bg-gradient-to-b dark:from-[#1a1a1a] dark:via-[#1a1a1a]/85 dark:to-transparent bg-gradient-to-b from-zinc-100 via-zinc-100/85 to-transparent backdrop-blur-md">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            {(activeView === 'chats-list' || activeView === 'projects' || activeView === 'providers') && (
              <span className="text-sm font-semibold font-helvetica tracking-tight dark:text-zinc-200 text-zinc-800">
                {activeView === 'chats-list' ? 'Chats' : activeView === 'projects' ? 'Projects' : 'Providers'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeView === 'chat' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => {
                    const text = messages.map(m => `${m.from === 'user' ? 'You' : 'Assistant'}: ${m.text}`).join('\n\n')
                    navigator.clipboard.writeText(text)
                  }}>
                    <Copy className="w-4 h-4" />
                    Copy whole chat
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    const text = messages.map(m => `${m.from === 'user' ? 'You' : 'Assistant'}: ${m.text}`).join('\n\n')
                    if (navigator.share) {
                      await navigator.share({ title: 'Pandas Chat', text })
                    } else {
                      navigator.clipboard.writeText(text)
                    }
                  }}>
                    <Share2 className="w-4 h-4" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveView('providers')}>
                    <Server className="w-4 h-4" />
                    Manage provider
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {activeView === 'chats-list' && (
              <>
                <div className="relative" ref={filterRef}>
                  <button
                    onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
                    className="flex items-center gap-1.5 border-2 border-zinc-800/60 bg-zinc-900/40 shadow-md rounded-lg px-3 py-1.5 text-xs text-zinc-300 hover:text-zinc-100 hover:border-zinc-700/80 transition-all font-helvetica "
                  >
                    <span>{filterMode}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {filterDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-28 rounded-xl bg-[#1a1a1a] border-2 border-zinc-800/60 shadow-2xl z-50 p-1">
                      {(['All', 'Active', 'Empty'] as const).map((option) => (
                        <button
                          key={option}
                          onClick={() => { setFilterMode(option); setFilterDropdownOpen(false) }}
                          className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors font-helvetica ${filterMode === option ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/60'}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {isSelectionMode ? (
                  <>
                    <button
                      onClick={handleDeleteSelected}
                      disabled={selectedSessions.size === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-950/60 text-red-200 border-2 border-red-900/50 disabled:opacity-40 shadow-md transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete ({selectedSessions.size})
                    </button>
                    <button
                      onClick={() => { setIsSelectionMode(false); setSelectedSessions(new Set()) }}
                      className="px-3 py-1.5 text-xs rounded-lg border-2 border-zinc-800/60 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 shadow-md transition-all"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsSelectionMode(true)}
                    className="px-3 py-1.5 text-xs rounded-lg border-2 border-zinc-800/60 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 shadow-md transition-all font-helvetica "
                  >
                    Select
                  </button>
                )}
              </>
            )}
            {activeView === 'providers' && (
              <button
                onClick={() => setActiveView('chat')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border-2 border-zinc-800/60 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 shadow-md transition-all font-helvetica "
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
          </div>
        </header>

        {activeView === 'projects' ? (
          <ProjectsView
            folders={folders}
            sessions={sessions}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onRenameFolder={handleRenameFolder}
            onOpenFolder={() => {
              setActiveView('chats-list')
              setSearchQuery('')
            }}
          />
        ) : activeView === 'providers' ? (
          <ProvidersView
            providers={providers}
            providerForm={providerForm}
            editingProviderId={editingProviderId}
            onFormChange={setProviderForm}
            onSave={saveProvider}
            onCancel={() => {
              setProviderForm(emptyProviderForm)
              setEditingProviderId(null)
            }}
            onEdit={startProviderEdit}
            onDelete={removeProvider}
          />
        ) : activeView === 'settings' ? (
          <SettingsView onProfileChange={setUserProfile} />
        ) : activeView === 'chats-list' ? (
          <ChatsView
            filteredSessions={filteredSessions}
            folders={folders}
            selectedSessions={selectedSessions}
            isSelectionMode={isSelectionMode}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectionModeChange={setIsSelectionMode}
            onDeleteSelected={handleDeleteSelected}
            onCreateSession={handleCreateSession}
            onSelectSession={handleSelectSession}
            onToggleSessionSelection={toggleSessionSelection}
            onRenameSession={handleRenameSession}
            onDeleteSession={handleDeleteSession}
            onPinSession={handlePinSession}
            onSetSessionFolder={handleSetSessionFolder}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onRenameFolder={handleRenameFolder}
          />
        ) : isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 pt-14">
            <div className="h-10 flex items-center justify-center overflow-hidden w-full select-none">
              <AnimatePresence mode="wait">
                <motion.p
                  key={greetingIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="font-helvetica text-2xl font-medium text-zinc-300 text-center"
                >
                  {greetings[greetingIndex]}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="w-full max-w-3xl flex flex-col gap-3">
              <PromptInputBox
                onSend={handleSend}
                placeholder={selectedProvider ? 'Message Pandas...' : 'Add a provider first...'}
                isLoading={isLoading}
                onStop={handleStop}
                onUploadDoc={handleUploadDoc}
                onOpenSettings={() => setActiveView('settings')}
                serperConfigured={serperConfigured}
                providers={providers}
                selectedProviderId={selectedProviderId}
                onChangeProviderId={setSelectedProviderId}
              />
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {[
                  { label: 'Code', icon: <Code2 className="w-3.5 h-3.5" />, prompt: 'Help me write code for ' },
                  { label: 'Write', icon: <FileText className="w-3.5 h-3.5" />, prompt: 'Help me write ' },
                  { label: 'Search', icon: <Globe className="w-3.5 h-3.5" />, prompt: '[Search: ' },
                  { label: 'Research', icon: <Search className="w-3.5 h-3.5" />, prompt: '[Plan: ' },
                ].map(({ label, icon, prompt }) => (
                  <button
                    key={label}
                    onClick={() => handleSend(prompt, [], undefined)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border-2 border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all font-helvetica tracking-tight"
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              ref={messagesContainerRef}
              onScroll={() => {
                const el = messagesContainerRef.current
                if (!el) return
                const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60
                setShowScrollButton(!atBottom)
              }}
              className="flex flex-1 flex-col overflow-y-auto no-scrollbar gap-3 px-4 pt-16 pb-4 mx-auto w-full max-w-3xl"
            >
              {messages.map((msg, index) => {
                const isAssistant = msg.from === 'assistant'
                return (
                  <div
                    key={`${msg.requestId || index}-${msg.from}`}
                    className={
                      msg.from === 'user'
                        ? 'max-w-xl rounded-xl px-4 py-2.5 text-sm leading-relaxed font-helvetica ml-auto text-zinc-100 bg-zinc-800/40'
                        : 'w-full py-3 text-sm leading-relaxed font-helvetica text-zinc-300'
                    }
                  >
                    {!isAssistant && msg.fileAttachment && (() => {
                      const badge = fileTypeBadge(msg.fileAttachment.name)
                      return (
                        <div className="inline-flex items-center gap-2.5 mb-2 bg-zinc-900/80 border-2 border-zinc-700/50 rounded-xl px-3 py-2 max-w-[220px]">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${badge.bg}`}>
                            <span className={`text-[10px] font-bold font-mono leading-none ${badge.text}`}>{badge.label}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-zinc-200 font-helvetica tracking-tight truncate leading-snug">{msg.fileAttachment.name}</p>
                            <p className="text-[11px] text-zinc-500 font-helvetica mt-0.5">{formatFileSize(msg.fileAttachment.size)}</p>
                          </div>
                        </div>
                      )
                    })()}
                    {isAssistant && (msg.mode === 'plan' || msg.mode === 'research') && msg.traces && (
                      <div className="mb-2">
                        <ResearchTrace traces={msg.traces} isStreaming={!!msg.streaming} />
                      </div>
                    )}
                    {isAssistant && msg.mode !== 'plan' && msg.mode !== 'research' && msg.steps && (
                      <div className="mb-1 pb-2">
                        <Spinner steps={msg.steps} isCollapsedByDefault={!msg.streaming} />
                      </div>
                    )}
                    {msg.text ? (
                      isAssistant ? (
                        <div className="markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {msg.text}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-zinc-100">{msg.text}</p>
                      )
                    ) : (
                      <span className="text-md text-zinc-600"></span>
                    )}
                    {isAssistant && !msg.streaming && msg.text && (
                      <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-500 font-helvetica">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(msg.text)
                            const key = msg.requestId || String(index)
                            setCopiedMessageKey(key)
                            setTimeout(() => setCopiedMessageKey(null), 2000)
                          }}
                          className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-all flex items-center gap-1.5"
                          title="Copy response"
                        >
                          {copiedMessageKey === (msg.requestId || String(index)) ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-emerald-500">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        {msg.durationMs != null && (
                          <span className="text-zinc-600">
                            {msg.durationMs < 60000
                              ? `${(msg.durationMs / 1000).toFixed(1)}s`
                              : `${Math.floor(msg.durationMs / 60000)}m ${Math.round((msg.durationMs % 60000) / 1000)}s`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {showScrollButton && (
              <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                <button
                  onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="pointer-events-auto flex items-center gap-1.5 px-2 py-2 text-xs cursor-pointer dark:bg-zinc-900/90 bg-white/90 dark:text-zinc-400 text-zinc-600 dark:hover:text-zinc-200 hover:text-zinc-900 rounded-full border-2 dark:border-zinc-700 border-zinc-300 shadow-lg backdrop-blur-sm transition-all"
                >
                  <ChevronDown className="w-3 h-3" />
                  
                </button>
              </div>
            )}
            <div className="shrink-0 px-4 pb-4">
              <div className="mx-auto w-full max-w-3xl">
                <PromptInputBox
                  onSend={handleSend}
                  placeholder={selectedProvider ? 'Message Pandas...' : 'Add a provider first...'}
                  isLoading={isLoading}
                  onStop={handleStop}
                  onUploadDoc={handleUploadDoc}
                  onOpenSettings={() => setActiveView('settings')}
                  serperConfigured={serperConfigured}
                  providers={providers}
                  selectedProviderId={selectedProviderId}
                  onChangeProviderId={setSelectedProviderId}
                />
              </div>
            </div>
          </>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}

function groupSessionsByTime(sessions: Session[]): Array<{ label: string; items: Session[] }> {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const week = new Date(today.getTime() - 6 * 86400000)
  const month = new Date(today.getTime() - 29 * 86400000)

  const buckets: Record<string, Session[]> = {
    Today: [], Yesterday: [], 'Previous 7 days': [], 'Previous 30 days': [], Older: [],
  }
  for (const s of sessions) {
    const d = new Date(s.last_message_at ?? s.created_at ?? '')
    if (d >= today) buckets['Today'].push(s)
    else if (d >= yesterday) buckets['Yesterday'].push(s)
    else if (d >= week) buckets['Previous 7 days'].push(s)
    else if (d >= month) buckets['Previous 30 days'].push(s)
    else buckets['Older'].push(s)
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

function ChatsView({
  filteredSessions,
  folders,
  selectedSessions,
  isSelectionMode,
  searchQuery,
  onSearchChange,
  onSelectionModeChange,
  onDeleteSelected,
  onCreateSession,
  onSelectSession,
  onToggleSessionSelection,
  onRenameSession,
  onDeleteSession,
  onPinSession,
  onSetSessionFolder,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
}: {
  filteredSessions: Session[]
  folders: Folder[]
  selectedSessions: Set<string>
  isSelectionMode: boolean
  searchQuery: string
  onSearchChange: (value: string) => void
  onSelectionModeChange: (value: boolean) => void
  onDeleteSelected: () => void
  onCreateSession: () => void
  onSelectSession: (id: string) => void
  onToggleSessionSelection: (id: string) => void
  onRenameSession: (id: string, title: string) => void
  onDeleteSession: (id: string) => void
  onPinSession: (id: string) => void
  onSetSessionFolder: (id: string, folderId: string | null) => void
  onCreateFolder: (name: string) => void
  onDeleteFolder: (id: string) => void
  onRenameFolder: (id: string, name: string) => void
}) {
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const displayed = activeFolderId === null
    ? filteredSessions
    : filteredSessions.filter((s) => s.folder_id === activeFolderId)

  const pinned = displayed.filter((s) => s.pinned)
  const unpinned = displayed.filter((s) => !s.pinned)
  const groups = groupSessionsByTime(unpinned)

  function SessionRow({ session }: { session: Session }) {
    const isChecked = selectedSessions.has(session.id)
    const folder = folders.find((f) => f.id === session.folder_id)
    const [menuOpen, setMenuOpen] = useState(false)

    if (renamingId === session.id) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/60">
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameValue.trim()) { onRenameSession(session.id, renameValue.trim()); setRenamingId(null) }
              if (e.key === 'Escape') setRenamingId(null)
            }}
            onBlur={() => { if (renameValue.trim()) onRenameSession(session.id, renameValue.trim()); setRenamingId(null) }}
            className="flex-1 bg-zinc-800 border-2 border-zinc-700 rounded px-2 py-0.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 font-helvetica"
          />
        </div>
      )
    }

    return (
      <motion.div
        layout
        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
          isChecked ? 'bg-zinc-800/80' : 'hover:bg-zinc-900/60'
        }`}
        onClick={() => isSelectionMode ? onToggleSessionSelection(session.id) : onSelectSession(session.id)}
      >
        {isSelectionMode && (
          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isChecked ? 'bg-zinc-100 border-zinc-100 text-zinc-900' : 'border-zinc-650'}`}>
            {isChecked && <Check className="w-3 h-3" />}
          </span>
        )}
        {session.pinned && !isSelectionMode && (
          <Pin className="w-3 h-3 text-zinc-600 shrink-0" />
        )}
        <span className="flex-1 text-sm text-zinc-200 truncate font-helvetica tracking-tight">
          {session.title}
        </span>
        {folder && (
          <span className="text-[10px] text-zinc-600 bg-zinc-800/60 border-2 border-zinc-800 rounded px-1.5 py-0.5 font-helvetica hidden group-hover:inline shrink-0">
            {folder.name}
          </span>
        )}
        <span className="text-xs text-zinc-600 font-helvetica group-hover:opacity-0 transition-opacity shrink-0">
          {formatRelativeTime(session.last_message_at ?? session.created_at)}
        </span>
        {!isSelectionMode && (
          <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded hover:bg-zinc-700/60 text-zinc-500 hover:text-zinc-300 transition-colors">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => onPinSession(session.id)}>
                  <Pin className="w-3.5 h-3.5" />{session.pinned ? 'Unpin' : 'Pin'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setRenamingId(session.id); setRenameValue(session.title) }}>
                  <Pencil className="w-3.5 h-3.5" />Rename
                </DropdownMenuItem>
                {folders.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {session.folder_id && (
                      <DropdownMenuItem onClick={() => onSetSessionFolder(session.id, null)}>
                        <FolderOpen className="w-3.5 h-3.5" />Remove from folder
                      </DropdownMenuItem>
                    )}
                    {folders.filter(f => f.id !== session.folder_id).map(f => (
                      <DropdownMenuItem key={f.id} onClick={() => onSetSessionFolder(session.id, f.id)}>
                        <FolderOpen className="w-3.5 h-3.5" />{f.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-400 focus:text-red-300" onClick={() => onDeleteSession(session.id)}>
                  <Trash2 className="w-3.5 h-3.5" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden pt-14">
      {/* Sticky header — search and folder tabs stay fixed while list scrolls */}
      <div className="shrink-0 w-full max-w-2xl mx-auto px-4 pt-6 pb-3 flex flex-col gap-3 dark:bg-[#1a1a1a] bg-white border-b-2 dark:border-zinc-900/60 border-zinc-100/60">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold font-helvetica  text-zinc-100">Chats</h1>
          <div className="flex items-center gap-2">
            {isSelectionMode ? (
               <>
                <button onClick={onDeleteSelected} disabled={selectedSessions.size === 0} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-950/60 text-red-200 border-2 border-red-900/60 disabled:opacity-40">
                  <Trash2 className="w-3 h-3" />Delete ({selectedSessions.size})
                </button>
                <button onClick={() => onSelectionModeChange(false)} className="px-3 py-1.5 text-xs rounded-lg border-2 border-zinc-800 text-zinc-400 hover:text-zinc-200">Cancel</button>
              </>
            ) : (
              <button onClick={() => onSelectionModeChange(true)} className="px-3 py-1.5 text-xs rounded-lg border-2 border-zinc-800 text-zinc-400 hover:text-zinc-200 font-helvetica">Select chats</button>
            )}
            <button onClick={onCreateSession} className="flex items-center gap-1.5 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 rounded-lg px-3 py-1.5 text-xs font-semibold">
              <Plus className="w-3.5 h-3.5" />New chat
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input type="text" placeholder="Search chats..." className="w-full bg-zinc-900/60 border-2 border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 font-helvetica" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} />
        </div>

        {folders.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => setActiveFolderId(null)} className={`px-2.5 py-1 rounded-md text-xs font-helvetica transition-colors ${activeFolderId === null ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}>All</button>
            {folders.map((folder) => (
              <div key={folder.id} className="relative group/folder flex items-center">
                <button onClick={() => setActiveFolderId(folder.id === activeFolderId ? null : folder.id)} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-helvetica transition-colors ${activeFolderId === folder.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}>
                  <FolderOpen className="w-3 h-3" />{folder.name}
                </button>
                <div className="absolute -top-1 -right-1 hidden group-hover/folder:flex items-center gap-0.5 z-10">
                  <button onClick={(e) => { e.stopPropagation(); const n = window.prompt('Rename folder', folder.name); if (n) onRenameFolder(folder.id, n) }} className="w-4 h-4 rounded bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center hover:bg-zinc-700"><Pencil className="w-2.5 h-2.5 text-zinc-400" /></button>
                  <button onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); if (activeFolderId === folder.id) setActiveFolderId(null) }} className="w-4 h-4 rounded bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center hover:bg-red-900"><X className="w-2.5 h-2.5 text-zinc-400" /></button>
                </div>
              </div>
            ))}
            {addingFolder ? (
              <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newFolderName.trim()) { onCreateFolder(newFolderName.trim()); setNewFolderName(''); setAddingFolder(false) } if (e.key === 'Escape') { setNewFolderName(''); setAddingFolder(false) } }}
                onBlur={() => { if (newFolderName.trim()) onCreateFolder(newFolderName.trim()); setNewFolderName(''); setAddingFolder(false) }}
                placeholder="Folder name" className="bg-zinc-900 border-2 border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 font-helvetica w-24" />
            ) : (
              <button onClick={() => setAddingFolder(true)} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900 transition-colors font-helvetica">
                <FolderPlus className="w-3 h-3" />New folder
              </button>
            )}
          </div>
        )}
        {folders.length === 0 && !addingFolder && (
          <button onClick={() => setAddingFolder(true)} className="self-start flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900 transition-colors font-helvetica border-2 border-dashed border-zinc-800">
            <FolderPlus className="w-3 h-3" />New folder
          </button>
        )}
        {addingFolder && folders.length === 0 && (
          <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newFolderName.trim()) { onCreateFolder(newFolderName.trim()); setNewFolderName(''); setAddingFolder(false) } if (e.key === 'Escape') { setNewFolderName(''); setAddingFolder(false) } }}
            onBlur={() => { if (newFolderName.trim()) onCreateFolder(newFolderName.trim()); setNewFolderName(''); setAddingFolder(false) }}
            placeholder="Folder name" className="bg-zinc-900 border-2 border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 font-helvetica w-32" />
        )}
      </div>

      {/* Scrollable session list */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 pb-4 w-full max-w-2xl mx-auto">
        {displayed.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm font-helvetica">{activeFolderId ? 'No chats in this folder' : 'No chats found'}</div>
        ) : (
          <div className="flex flex-col">
            {pinned.length > 0 && (
              <div className="mb-2">
                <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest px-3 py-1.5 font-helvetica">Pinned</p>
                {pinned.map((session) => <SessionRow key={session.id} session={session} />)}
              </div>
            )}
            {groups.map(({ label, items }) => (
              <div key={label} className="mb-2">
                <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest px-3 py-1.5 font-helvetica">{label}</p>
                {items.map((session) => <SessionRow key={session.id} session={session} />)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectsView({
  folders,
  sessions,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onOpenFolder,
}: {
  folders: Folder[]
  sessions: Session[]
  onCreateFolder: (name: string) => void
  onDeleteFolder: (id: string) => void
  onRenameFolder: (id: string, name: string) => void
  onOpenFolder: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  function chatCount(folderId: string) {
    return sessions.filter((s) => s.folder_id === folderId).length
  }

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar pt-16 pb-6 px-4 mx-auto w-full max-w-2xl flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-helvetica  text-zinc-100">Projects</h1>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 rounded-lg px-3 py-1.5 text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" />New project
        </button>
      </div>

      {adding && (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) { onCreateFolder(newName.trim()); setNewName(''); setAdding(false) }
            if (e.key === 'Escape') { setNewName(''); setAdding(false) }
          }}
          onBlur={() => { if (newName.trim()) onCreateFolder(newName.trim()); setNewName(''); setAdding(false) }}
          placeholder="Project name"
          className="bg-zinc-900 border-2 border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 font-helvetica w-full"
        />
      )}

      {folders.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <FolderOpen className="w-10 h-10 text-zinc-700" />
          <p className="text-sm text-zinc-500 font-helvetica">No projects yet</p>
          <p className="text-xs text-zinc-600 font-helvetica">Create a project to group your chats</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="group relative flex flex-col gap-2 p-4 rounded-xl border-2 border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all cursor-pointer"
              onClick={() => onOpenFolder(folder.id)}
            >
              <div className="flex items-start justify-between">
                {renamingId === folder.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && renameValue.trim()) { onRenameFolder(folder.id, renameValue.trim()); setRenamingId(null) }
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onBlur={() => { if (renameValue.trim()) onRenameFolder(folder.id, renameValue.trim()); setRenamingId(null) }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-zinc-800 border-2 border-zinc-700 rounded px-2 py-0.5 text-sm text-zinc-100 focus:outline-none font-helvetica"
                  />
                ) : (
                  <span className="text-sm font-semibold text-zinc-100 font-helvetica tracking-tight truncate flex-1">{folder.name}</span>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { setRenamingId(folder.id); setRenameValue(folder.name) }} className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => onDeleteFolder(folder.id)} className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-zinc-600 font-helvetica">{chatCount(folder.id)} chat{chatCount(folder.id) !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProvidersView({
  providers,
  providerForm,
  editingProviderId,
  onFormChange,
  onSave,
  onCancel,
  onEdit,
  onDelete,
}: {
  providers: Provider[]
  providerForm: typeof emptyProviderForm
  editingProviderId: string | null
  onFormChange: (value: typeof emptyProviderForm) => void
  onSave: () => void
  onCancel: () => void
  onEdit: (provider: Provider) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex-1 overflow-y-auto no-scrollbar pt-16 pb-8 px-6 mx-auto w-full max-w-5xl flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="flex flex-col gap-3">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className={`flex items-center justify-between px-4 py-3 rounded-xl bg-[#1b1b1b]/60 border-l-2 ${
                provider.is_active ? 'border-l-emerald-500' : 'border-l-zinc-800'
              } border-2 border-zinc-800/60 shadow-md`}
            >
              <span className="font-semibold text-zinc-100 font-helvetica tracking-tight truncate">{provider.name}</span>
              <div className="flex items-center gap-0.5 shrink-0 ml-3">
                <button onClick={() => onEdit(provider)} className="p-1.5 rounded-lg hover:bg-zinc-800/60 text-zinc-600 hover:text-zinc-200 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onDelete(provider.id)} className="p-1.5 rounded-lg hover:bg-zinc-800/60 text-zinc-600 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-2 border-zinc-800/60 bg-[#1b1b1b]/60 rounded-xl p-4 h-fit shadow-md">
          <h2 className="font-semibold text-zinc-100 mb-4 font-helvetica tracking-tight">{editingProviderId ? 'Edit provider' : 'Add provider'}</h2>
          <div className="flex flex-col gap-3">
            <input
              value={providerForm.name}
              onChange={(event) => onFormChange({ ...providerForm, name: event.target.value })}
              placeholder="Name"
              className="bg-zinc-900/60 border-2 border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700/80 shadow-sm transition-all"
            />
            <select
              value={providerForm.provider_type}
              onChange={(event) => {
                const type = event.target.value
                const base_url = type === 'ollama' ? (providerForm.base_url || 'http://localhost:11434/v1') : ''
                onFormChange({ ...providerForm, provider_type: type, base_url })
              }}
              className="bg-zinc-900/60 border-2 border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700/80 shadow-sm transition-all"
            >
              <option value="ollama">Ollama local</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai_compatible">OpenAI compatible</option>
            </select>
            <input
              value={providerForm.model}
              onChange={(event) => onFormChange({ ...providerForm, model: event.target.value })}
              placeholder="Model"
              className="bg-zinc-900/60 border-2 border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700/80 shadow-sm transition-all"
            />
            {(providerForm.provider_type === 'ollama' || providerForm.provider_type === 'openai_compatible') && (
              <input
                value={providerForm.base_url}
                onChange={(event) => onFormChange({ ...providerForm, base_url: event.target.value })}
                placeholder={providerForm.provider_type === 'ollama' ? 'http://localhost:11434/v1' : 'Base URL'}
                className="bg-zinc-900/60 border-2 border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700/80 shadow-sm transition-all"
              />
            )}
            {providerForm.provider_type !== 'ollama' && (
              <input
                value={providerForm.api_key}
                onChange={(event) => onFormChange({ ...providerForm, api_key: event.target.value })}
                placeholder={editingProviderId ? 'New API key (leave blank to keep)' : 'API key'}
                type="password"
                className="bg-zinc-900/60 border-2 border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700/80 shadow-sm transition-all"
              />
            )}
            <label className="flex items-center gap-2 text-sm text-zinc-500">
              <input
                type="checkbox"
                checked={providerForm.is_active}
                onChange={(event) => onFormChange({ ...providerForm, is_active: event.target.checked })}
              />
              Make active
            </label>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={onSave} className="bg-zinc-100 text-zinc-900 hover:bg-white rounded-lg px-4 py-2 text-xs font-semibold shadow-md transition-colors">
                Save
              </button>
              <button onClick={onCancel} className="border-2 border-zinc-800/60 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 rounded-lg px-4 py-2 text-xs shadow-md transition-all">
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
