/** Picture of an achievement: an emoji, or `svg:<name>` for a drawing that has no emoji. */
export function AchIcon({ icon, size = 30 }: { icon: string; size?: number }) {
  if (icon === 'svg:khachapuri') return <Khachapuri size={size} />;
  return (
    <span style={{ fontSize: size, lineHeight: 1 }} aria-hidden="true">
      {icon}
    </span>
  );
}

/** Хачапури по-аджарски: лодочка из теста с закрученными концами, сыр, желток и кусочек масла. */
function Khachapuri({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ display: 'block' }}>
      <g transform="rotate(-22 24 24)">
        {/* boat of dough with twisted tips curling up */}
        <path d="M3 22 C 2 18, 5 16, 7 18 C 14 12, 34 12, 41 18 C 43 16, 46 18, 45 22 C 40 34, 8 34, 3 22 Z" fill="#B8641E" />
        <path d="M5 23 C 10 31, 38 31, 43 23 C 38 27, 10 27, 5 23 Z" fill="#8F4A12" opacity="0.55" />
        <path d="M7.5 18.5 C 14 13.5, 34 13.5, 40.5 18.5" fill="none" stroke="#EDB36A" strokeWidth="2" strokeLinecap="round" />
        <circle cx="5.2" cy="19.4" r="2.2" fill="#D98B3A" />
        <circle cx="42.8" cy="19.4" r="2.2" fill="#D98B3A" />
        {/* melted cheese */}
        <path d="M10 21 C 15 16.5, 33 16.5, 38 21 C 33 26.5, 15 26.5, 10 21 Z" fill="#F6D365" />
        <circle cx="14.5" cy="21.3" r="1.1" fill="#E8B93E" />
        <circle cx="34" cy="20.2" r="0.9" fill="#E8B93E" />
        {/* egg and butter */}
        <ellipse cx="23" cy="21.2" rx="5.6" ry="3.6" fill="#FFFBEF" />
        <circle cx="22.4" cy="21.2" r="2.7" fill="#F28C0F" />
        <circle cx="21.6" cy="20.4" r="0.8" fill="#FFD08A" />
        <rect x="28.4" y="17.8" width="4" height="3.2" rx="0.7" fill="#FFF1B8" stroke="#E9CD72" strokeWidth="0.5" />
      </g>
    </svg>
  );
}
