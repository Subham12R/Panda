import { useEffect, useRef, useState } from 'react'

export type ProviderOption = {
  id: string
  name: string
  provider_type: string
  model: string
  is_active: boolean
}

interface Props {
  providers: ProviderOption[]
  value: string | null
  onChange: (providerId: string) => void
}

function shortName(provider: ProviderOption | undefined): string {
  if (!provider) return 'Provider'
  return provider.model || provider.name
}

export function ModelSelector({ providers, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const current = providers.find((provider) => provider.id === value) ?? providers[0]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((next) => !next)}
        className="flex items-center gap-1.5 px-2.5 h-8 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-full transition-colors font-helvetica border border-transparent hover:border-zinc-800/80"
      >
        <span>{shortName(current)}</span>
        <svg
          className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-2 w-64 rounded-xl bg-white/75 dark:bg-zinc-950/60 backdrop-blur-md border-2 border-zinc-200 dark:border-zinc-800/80 shadow-2xl z-50 overflow-hidden p-1">
          {providers.length === 0 ? (
            <div className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 font-helvetica ">
              No providers configured
            </div>
          ) : (
            providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => {
                  onChange(provider.id)
                  setOpen(false)
                }}
                className={`w-full text-left px-4 py-2.5 text-sm font-helvetica transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md ${
                  provider.id === current?.id
                    ? 'text-zinc-950 dark:text-zinc-50'
                    : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                <span className="block truncate">{provider.name}</span>
                <span className="block truncate text-xs text-zinc-400 dark:text-zinc-500">{provider.model}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
