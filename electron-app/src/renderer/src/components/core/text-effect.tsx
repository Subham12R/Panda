import { AnimatePresence, motion, type Variants } from 'framer-motion'

type Preset = 'fade' | 'blur' | 'slide'

interface TextEffectProps {
  children: string
  per?: 'char' | 'word'
  preset?: Preset
  className?: string
  delay?: number
}

const presetVariants: Record<Preset, Variants> = {
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  blur: {
    hidden: { opacity: 0, filter: 'blur(8px)' },
    visible: { opacity: 1, filter: 'blur(0px)' },
  },
  slide: {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0 },
  },
}

export function TextEffect({ children, per = 'word', preset = 'fade', className, delay = 0 }: TextEffectProps) {
  const segments = per === 'char' ? children.split('') : children.split(' ')
  const variants = presetVariants[preset]

  return (
    <AnimatePresence>
      <motion.span
        className={className}
        initial="hidden"
        animate="visible"
        transition={{ staggerChildren: per === 'char' ? 0.03 : 0.06, delayChildren: delay }}
      >
        {segments.map((seg, i) => (
          <motion.span key={i} variants={variants} transition={{ duration: 0.25 }} style={{ display: 'inline' }}>
            {seg}{per === 'word' && i < segments.length - 1 ? ' ' : ''}
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  )
}
