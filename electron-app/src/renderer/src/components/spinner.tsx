import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { TextShimmer } from '@renderer/components/core/text-shimmer'

export interface ThinkingStep {
  id: string
  text: string
  status: 'pending' | 'running' | 'completed' | 'failed'
}

interface SpinnerProps {
  steps: ThinkingStep[]
  isCollapsedByDefault?: boolean
}

export function Spinner({ steps, isCollapsedByDefault = true }: SpinnerProps) {
  const [expanded, setExpanded] = useState(false)

  const completedCount = steps.filter((s) => s.status === 'completed' || s.status === 'failed').length
  const allDone = steps.length > 0 && steps.every((s) => s.status === 'completed' || s.status === 'failed')

  if (isCollapsedByDefault && allDone) {
    return (
      <div className="mb-1">
        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1 text-[11px] dark:text-zinc-700 text-zinc-500 dark:hover:text-zinc-500 hover:text-zinc-700 transition-colors font-helvetica  select-none bg-transparent border-none p-0 cursor-pointer"
        >
          <span>{completedCount} steps</span>
          <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden mt-1.5"
            >
              <div className="flex flex-col gap-1">
                {steps.filter((s) => s.status !== 'pending').map((step) => (
                  <span key={step.id} className="text-xs font-helvetica  dark:text-zinc-600 text-zinc-500">
                    {step.text}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="mb-2">
      <TextShimmer className="text-md font-helvetica tracking-tighter" duration={1.4}>Generating response...</TextShimmer>
    </div>
  )
}
