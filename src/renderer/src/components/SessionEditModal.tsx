import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

interface Props {
  labelledBy: string
  onCancel: () => void
  children: ReactNode
}

export function SessionEditModal({ labelledBy, onCancel, children }: Props): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onCancel()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused.current?.focus?.()
    }
  }, [onCancel])

  return (
    <motion.div
      className="session-modal-scrim"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0.1 : 0.15 }}
      onClick={onCancel}
    >
      <motion.div
        className="session-modal"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={
          reduceMotion ? { duration: 0.1 } : { type: 'spring', bounce: 0, duration: 0.35 }
        }
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
