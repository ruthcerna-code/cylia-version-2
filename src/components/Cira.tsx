import { useEffect, useRef, useState } from 'react';

/**
 * Cira, como en la maqueta: cinta en C abierta a la derecha,
 * exterior turquesa, pliegue coral, cara fija y sol amarillo.
 */
export default function Cira({
  size = 48,
  bounceKey,
  decorative = true,
}: {
  size?: number;
  bounceKey?: string;
  decorative?: boolean;
}) {
  const [play, setPlay] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (bounceKey === undefined) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setPlay(true);
    const timer = window.setTimeout(() => setPlay(false), 400);
    return () => window.clearTimeout(timer);
  }, [bounceKey]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      className="shrink-0"
    >
      <g stroke="#F6C445" strokeWidth="3" strokeLinecap="round">
        <path d="M58 14l6-7" />
        <path d="M68 24l8-1" />
        <path d="M66 36l8 6" />
      </g>
      <path
        d="M52 12c-14-8-34-2-40 14-7 18 4 36 22 40 9 2 16-1 20-6"
        fill="none"
        stroke="#1AA8A4"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M46 24c-8-3-16 1-18 10-2 10 5 18 14 18"
        fill="none"
        stroke="#FF8A4C"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <circle cx="30" cy="38" r="1.7" fill="#153E40" />
      <circle cx="38" cy="36.5" r="1.7" fill="#153E40" />
      <path d="M29 44c2.4 3 7 3.2 10-.2" fill="none" stroke="#153E40" strokeWidth="1.7" strokeLinecap="round" />
      <circle className={play ? 'cira-orb cira-orb-play' : 'cira-orb'} cx="60" cy="28" r="8" fill="#F6D34A" />
    </svg>
  );
}
