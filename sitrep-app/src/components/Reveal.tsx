import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Stagger delay in ms */
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'span'
}

/**
 * Fades/slides content in the first time it scrolls into view.
 * Respects prefers-reduced-motion via CSS.
 */
export function Reveal({ children, delay = 0, className = '', as = 'div' }: Props) {
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            io.disconnect()
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const Tag = as as 'div'
  const style = { '--sr-reveal-delay': `${delay}ms` } as CSSProperties

  return (
    <Tag
      ref={ref as never}
      style={style}
      className={`sr-reveal ${visible ? 'sr-reveal-visible' : ''} ${className}`.trim()}
    >
      {children}
    </Tag>
  )
}
