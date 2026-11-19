export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs><linearGradient id="osg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="#ff3d6e" /></linearGradient></defs>
      <path d="M256 96a160 160 0 1 0 160 160" fill="none" stroke="url(#osg)" strokeWidth="40" strokeLinecap="round" />
      <g fill="currentColor"><rect x="196" y="216" width="28" height="80" rx="14" /><rect x="242" y="176" width="28" height="160" rx="14" /><rect x="288" y="236" width="28" height="40" rx="14" /></g>
      <circle cx="400" cy="112" r="22" fill="url(#osg)" />
    </svg>
  )
}
