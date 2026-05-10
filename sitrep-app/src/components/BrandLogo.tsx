type Props = {
  /** Path under public/ — default NPF crest */
  src?: string
  className?: string
  /** Max height in pixels (width auto) */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Show text lockup beside mark */
  withWordmark?: boolean
}

const sizeClass = {
  sm: 'h-9 w-auto',
  md: 'h-11 w-auto',
  lg: 'h-14 w-auto',
  xl: 'h-20 w-auto md:h-24',
} as const

/**
 * Nigeria Police Force crest — place `public/police.png` (copy from project root `Police.png` if needed).
 */
export function BrandLogo({ src = '/police.png', className = '', size = 'md', withWordmark = false }: Props) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <img
        src={src}
        alt="Nigeria Police Force"
        className={`${sizeClass[size]} object-contain object-left drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]`}
        loading="eager"
        decoding="async"
      />
      {withWordmark ? (
        <div className="min-w-0 text-left leading-tight">
          <div className="font-(--font-display) text-xs font-bold uppercase tracking-[0.2em] text-[var(--portal-muted)]">
            Nigeria Police Force
          </div>
          <div className="font-(--font-display) text-sm font-extrabold tracking-tight text-[var(--sr-heading)] md:text-base">
            Election SitRep
          </div>
        </div>
      ) : null}
    </div>
  )
}
