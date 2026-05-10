import { useTheme } from '../contexts/ThemeContext'

type Props = {
  className?: string
  /** Compact icon-only (default shows short label on sm+) */
  variant?: 'default' | 'icon'
}

export function ThemeToggle({ className = '', variant = 'default' }: Props) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition',
        'border-[color:var(--portal-border)] bg-[color:var(--theme-toggle-bg)] text-[var(--portal-muted)]',
        'hover:bg-[color:var(--theme-toggle-hover)] hover:text-[var(--portal-fg)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0dccb0]',
        className,
      ].join(' ')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <span className="relative size-5 shrink-0" aria-hidden>
        {isDark ? (
          <svg className="size-5 text-amber-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
          </svg>
        ) : (
          <svg className="size-5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591z" />
          </svg>
        )}
      </span>
      {variant === 'default' ? (
        <span className="hidden font-(--font-mono) text-[10px] uppercase tracking-wider sm:inline">
          {isDark ? 'Dark' : 'Light'}
        </span>
      ) : null}
    </button>
  )
}
