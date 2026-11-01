import type { RiderType } from '../domain/hobby';

/**
 * Solid silhouettes for the hobby choice. `--art-cut` is the colour of the thin gaps that separate overlapping parts
 * (the card background), so the drawings stay readable on light, lime and dark cards.
 */
const CUT = 'var(--art-cut, #fbfbfc)';

const ski = (x: number) => `M${x - 5} 104 Q${x - 5} 110 ${x} 110 Q${x + 5} 110 ${x + 5} 104 L${x + 5} 27 Q${x + 5} 11 ${x + 1.5} 5 Q${x - 5} 12 ${x - 5} 25 Z`;

/** Two alpine skis with bindings and two crossed poles with grips and baskets. */
export function SkiArt({ size = 120 }: { size?: number }) {
  const pole = (x1: number, x2: number) => {
    const dx = x2 - x1;
    const len = Math.hypot(dx, 98);
    const ux = dx / len;
    const uy = 98 / len;
    const bx = x1 + ux * len * 0.86;
    const by = 10 + uy * len * 0.86;
    return (
      <g>
        <line x1={x1} y1={10} x2={x2} y2={108} stroke="currentColor" strokeWidth={3.6} strokeLinecap="round" />
        <line x1={x1} y1={10} x2={x1 + ux * 15} y2={10 + uy * 15} stroke="currentColor" strokeWidth={8} strokeLinecap="round" />
        <line x1={bx - uy * 6.5} y1={by + ux * 6.5} x2={bx + uy * 6.5} y2={by - ux * 6.5} stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" />
      </g>
    );
  };
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="hobby-art">
      {pole(22, 84)}
      {pole(98, 36)}
      {[49, 71].map((x) => (
        <g key={x}>
          <path d={ski(x)} fill="currentColor" stroke={CUT} strokeWidth={3} strokeLinejoin="round" paintOrder="stroke" />
          <rect x={x - 7.5} y={60} width={15} height={13} rx={3} fill="currentColor" stroke={CUT} strokeWidth={2.4} />
          <line x1={x - 4} y1={66.5} x2={x + 4} y2={66.5} stroke={CUT} strokeWidth={2} strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

/** A twin-tip snowboard with two bindings (base plates, straps and high-backs) — not to be confused with a skate or a surfboard. */
export function SnowboardArt({ size = 120 }: { size?: number }) {
  const board = 'M-18 -38 Q-18 -54 0 -54 Q18 -54 18 -38 Q14.5 0 18 38 Q18 54 0 54 Q-18 54 -18 38 Q-14.5 0 -18 -38 Z';
  const binding = (y: number) => (
    <g key={y}>
      <rect x={-26} y={y - 7} width={9} height={14} rx={3.5} fill="currentColor" stroke={CUT} strokeWidth={2.6} />
      <rect x={-13} y={y - 6.5} width={26} height={13} rx={4.5} fill="none" stroke={CUT} strokeWidth={2.6} />
      <line x1={-5} y1={y - 6.5} x2={-5} y2={y + 6.5} stroke={CUT} strokeWidth={2.4} />
      <line x1={5} y1={y - 6.5} x2={5} y2={y + 6.5} stroke={CUT} strokeWidth={2.4} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="hobby-art">
      <g transform="translate(60 60) rotate(-38)">
        <path d={board} fill="currentColor" stroke={CUT} strokeWidth={2} paintOrder="stroke" />
        <path d="M0 -47 Q8 -47 10 -40 M0 47 Q-8 47 -10 40" fill="none" stroke={CUT} strokeWidth={1.8} strokeLinecap="round" opacity={0.7} />
        {binding(-19)}
        {binding(19)}
      </g>
    </svg>
  );
}

/** Surfboard with a stringer and a fin. */
export function SurfArt({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="hobby-art">
      <g transform="translate(60 60) rotate(35)">
        <path d="M0 -56 C13 -40 16 -10 15 18 C14 40 9 52 0 54 C-9 52 -14 40 -15 18 C-16 -10 -13 -40 0 -56 Z" fill="currentColor" />
        <line x1={0} y1={-50} x2={0} y2={50} stroke={CUT} strokeWidth={2} strokeLinecap="round" />
        <path d="M-2 34 L-2 46 L-12 52 Q-11 40 -2 34 Z" fill={CUT} />
      </g>
    </svg>
  );
}

export const RiderArt = ({ type, size }: { type: RiderType; size?: number }) => (type === 'ski' ? <SkiArt size={size} /> : <SnowboardArt size={size} />);
