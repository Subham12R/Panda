import { useEffect, useRef, useState } from 'react'
import { Globe, BrainCog, Paperclip, X, Server, ExternalLink } from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Telescope01Icon } from '@hugeicons/core-free-icons'

const HTTP_URL = (import.meta.env.VITE_BACKEND_HTTP_URL as string) || 'http://localhost:8000'

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ')

interface McpConnection {
  id: string
  name: string
  connection_type: 'sse' | 'http' | 'stdio'
  url: string
  command: string
  api_key_masked: string
  is_enabled: boolean
}

interface ConnectionsPopoverProps {
  showSearch: boolean
  showThink: boolean
  showPlan: boolean
  onToggleSearch: () => void
  onToggleThink: () => void
  onTogglePlan: () => void
  serperConfigured: boolean
  onClose: () => void
  onOpenSettings: () => void
}

const TYPE_BADGE: Record<string, string> = {
  sse: 'bg-cyan-950 text-cyan-400 border-2 border-cyan-900',
  http: 'bg-indigo-950 text-indigo-400 border-2 border-indigo-900',
  stdio: 'bg-amber-950 text-amber-400 border-2 border-amber-900',
}

export function ConnectionsPopover({
  showSearch,
  showThink,
  showPlan,
  onToggleSearch,
  onToggleThink,
  onTogglePlan,
  serperConfigured,
  onClose,
  onOpenSettings,
}: ConnectionsPopoverProps) {
  const [connections, setConnections] = useState<McpConnection[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${HTTP_URL}/api/mcp-connections`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setConnections(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  async function handleToggleMcp(id: string) {
    const res = await fetch(`${HTTP_URL}/api/mcp-connections/${id}/toggle`, { method: 'PUT' })
    const data = await res.json()
    setConnections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_enabled: data.is_enabled } : c))
    )
  }

  const skills = [
    {
      id: 'search',
      label: 'Web Search',
      icon: <Globe className="w-4 h-4" />,
      color: '#1EAEDB',
      active: showSearch,
      onToggle: onToggleSearch,
      badge: !serperConfigured ? 'Needs API key' : null,
      alwaysOn: false,
    },
    {
      id: 'think',
      label: 'Deep Think',
      icon: <BrainCog className="w-4 h-4" />,
      color: '#8B5CF6',
      active: showThink,
      onToggle: onToggleThink,
      badge: null,
      alwaysOn: false,
    },
    {
      id: 'plan',
      label: 'Research',
      icon: <HugeiconsIcon icon={Telescope01Icon} className="w-4 h-4" />,
      color: '#F97316',
      active: showPlan,
      onToggle: onTogglePlan,
      badge: null,
      alwaysOn: false,
    },
    {
      id: 'rag',
      label: 'File Upload',
      icon: <Paperclip className="w-4 h-4" />,
      color: '#6B7280',
      active: true,
      onToggle: null,
      badge: 'Always on',
      alwaysOn: true,
    },
  ]

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full mb-3 left-0 w-72 bg-white/75 dark:bg-zinc-950/60 backdrop-blur-md border-2 border-zinc-200 dark:border-zinc-800/80 rounded-xl shadow-xl shadow-black/10 dark:shadow-black/40 z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 tracking-tight">Connections</span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Skills */}
      <div className="px-4 py-2">
        <p className="text-[9px] font-mono tracking-wider text-zinc-500 uppercase font-semibold mb-2">Skills</p>
        <div className="flex flex-col gap-1.5">
          {skills.map((skill) => (
            <div key={skill.id} className="flex items-center justify-between">
              <button
                onClick={skill.alwaysOn ? undefined : skill.onToggle ?? undefined}
                disabled={skill.alwaysOn}
                className={cn(
                  'flex items-center gap-2 text-xs tracking-tight transition-colors',
                  skill.alwaysOn ? 'cursor-default' : 'cursor-pointer hover:opacity-80',
                  !skill.active && 'text-zinc-500 dark:text-zinc-400'
                )}
                style={skill.active ? { color: skill.color } : {}}
              >
                <span className={cn('flex items-center', !skill.active && 'text-zinc-400 dark:text-zinc-500')} style={skill.active ? { color: skill.color } : {}}>{skill.icon}</span>
                {skill.label}
              </button>
              <div className="flex items-center gap-2">
                {skill.badge && (
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded border-2 font-mono font-medium',
                    skill.alwaysOn
                      ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60'
                  )}>
                    {skill.badge}
                  </span>
                )}
                {!skill.alwaysOn && (
                  <button
                    onClick={skill.onToggle ?? undefined}
                    className={cn(
                      'w-7 h-4 rounded-full transition-colors flex-shrink-0 relative outline-none',
                      skill.active
                        ? 'border-transparent'
                        : 'bg-zinc-200 dark:bg-zinc-800'
                    )}
                    style={skill.active ? { backgroundColor: skill.color } : {}}
                  >
                    <span
                      className={cn(
                        'absolute top-[2px] left-0 w-3 h-3 rounded-full transition-transform bg-white shadow-sm',
                        skill.active ? 'translate-x-[14px]' : 'translate-x-[2px]'
                      )}
                    />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MCP Servers */}
      <div className="px-4 pt-2 pb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-mono tracking-wider text-zinc-500 uppercase font-semibold">MCP Servers</p>
          <button
            onClick={() => { onOpenSettings(); onClose() }}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors"
          >
            Manage <ExternalLink className="w-2.5 h-2.5" />
          </button>
        </div>

        {connections.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-3">
            <Server className="w-5 h-5 text-zinc-300 dark:text-zinc-700" />
            <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">No MCP servers configured</p>
            <button
              onClick={() => { onOpenSettings(); onClose() }}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 underline transition-colors"
            >
              Add a server in Settings
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {connections.map((conn) => (
              <div key={conn.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    conn.is_enabled ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'
                  )} />
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{conn.name}</span>
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded border-2 font-mono flex-shrink-0',
                    TYPE_BADGE[conn.connection_type] ?? 'bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                  )}>
                    {conn.connection_type}
                  </span>
                </div>
                <button
                  onClick={() => handleToggleMcp(conn.id)}
                  className={cn(
                    'w-7 h-4 rounded-full transition-colors flex-shrink-0 relative ml-2 outline-none',
                    conn.is_enabled
                      ? 'bg-emerald-500'
                      : 'bg-zinc-200 dark:bg-zinc-800'
                  )}
                >
                  <span className={cn(
                    'absolute top-[2px] left-0 w-3 h-3 rounded-full transition-transform bg-white shadow-sm',
                    conn.is_enabled ? 'translate-x-[14px]' : 'translate-x-[2px]'
                  )} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
