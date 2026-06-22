interface TextShimmerProps {
  children: string
  className?: string
  duration?: number
}

export function TextShimmer({ children, className = '', duration = 1.5 }: TextShimmerProps) {
  return (
    <span
      className={`inline-block bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage: 'linear-gradient(90deg, #71717a 0%, #e4e4e7 40%, #71717a 60%, #52525b 100%)',
        backgroundSize: '200% 100%',
        animation: `shimmer ${duration}s linear infinite`,
      }}
    >
      {children}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
    </span>
  )
}
