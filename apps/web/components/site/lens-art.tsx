/** Decorative IOL illustration (optic + haptics) in brand colours. */
export function LensArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden>
      <defs>
        <radialGradient id="optic" cx="42%" cy="38%" r="65%"><stop offset="0" stopColor="#ffffff" /><stop offset="0.55" stopColor="#d9f0ee" /><stop offset="1" stopColor="#a9ddda" /></radialGradient>
        <linearGradient id="hap" x1="0" x2="1"><stop offset="0" stopColor="#1a9e9a" /><stop offset="1" stopColor="#147c79" /></linearGradient>
      </defs>
      <circle cx="200" cy="200" r="190" fill="#eef8f7" />
      <circle cx="200" cy="200" r="150" fill="none" stroke="#d9f0ee" strokeWidth="2" />
      <path d="M262 150 C 330 120, 360 60, 330 30" fill="none" stroke="url(#hap)" strokeWidth="9" strokeLinecap="round" />
      <path d="M138 250 C 70 280, 40 340, 70 370" fill="none" stroke="url(#hap)" strokeWidth="9" strokeLinecap="round" />
      <circle cx="200" cy="200" r="92" fill="url(#optic)" stroke="#1b3a5c" strokeWidth="3" />
      <circle cx="200" cy="200" r="70" fill="none" stroke="#1a9e9a" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="46" fill="none" stroke="#1a9e9a" strokeOpacity="0.25" strokeWidth="1.5" />
      <ellipse cx="172" cy="168" rx="26" ry="14" fill="#ffffff" opacity="0.85" transform="rotate(-30 172 168)" />
    </svg>
  );
}
