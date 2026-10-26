export function CheckMark() {
  return (
    <span className="miniMark" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <defs>
          <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#42D77D" />
            <stop offset="1" stopColor="#18874D" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="28" fill="url(#mark)" />
        <path d="M19 33.5 28.5 43 46 23.5" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export function AppIcon() {
  return (
    <span className="appMark" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <defs>
          <linearGradient id="appg" x1="7" y1="7" x2="41" y2="41">
            <stop stopColor="#0aa55d" />
            <stop offset="1" stopColor="#146338" />
          </linearGradient>
        </defs>
        <rect x="3" y="3" width="42" height="42" rx="12" fill="url(#appg)" />
        <path d="M16 13h14l6 6v16H16z" fill="none" stroke="white" strokeWidth="3" strokeLinejoin="round" />
        <path d="M30 13v7h7" fill="none" stroke="white" strokeWidth="3" strokeLinejoin="round" />
        <path d="m19 27 4 4 9-10" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 39h34" stroke="#ff8515" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export function projectLogo(name: string) {
  const normalized = name.toLowerCase()
  if (normalized.includes('ceará credi') || normalized.includes('ceara credi')) {
    return { src: '/ceara-credi.png', alt: 'Ceará Credi' }
  }
  if (normalized.includes('sebrae') && (normalized.includes('qualificação') || normalized.includes('qualificacao'))) {
    return { src: '/qualificacao-sebrae.png', alt: 'Qualificação Sebrae' }
  }
  if (normalized.includes('sine') && normalized.includes('idt')) {
    return { src: '/idt-logo.png', alt: 'Instituto de Desenvolvimento do Trabalho - IDT' }
  }
  return null
}
