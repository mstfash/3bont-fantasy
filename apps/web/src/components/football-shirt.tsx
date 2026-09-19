/** Inline kit artwork uses catalogue colors; numbers are never guessed. */
export function FootballShirt({
  color,
  number,
}: {
  readonly color: string;
  readonly number: number | null;
}) {
  const rgb =
    color
      .slice(1)
      .match(/.{2}/gu)
      ?.map((v) => parseInt(v, 16)) ?? [];
  const light =
    (rgb[0] ?? 0) * 0.299 + (rgb[1] ?? 0) * 0.587 + (rgb[2] ?? 0) * 0.114 > 155;
  return (
    <svg viewBox="0 0 76 72" className="football-shirt" aria-hidden="true">
      <path
        d="M23 5 9 12 2 29 16 36 21 27 21 67 55 67 55 27 60 36 74 29 67 12 53 5 46 10 30 10Z"
        fill={color}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M30 8 Q38 22 46 8"
        fill="none"
        stroke={light ? '#111827' : '#ffffff'}
        strokeWidth="3"
      />
      <path
        d="M24 23H52"
        stroke={light ? '#111827' : '#ffffff'}
        strokeOpacity=".18"
        strokeWidth="2"
      />
      <text
        x="38"
        y="50"
        textAnchor="middle"
        fill={light ? '#111827' : '#ffffff'}
        fontSize="23"
        fontWeight="800"
      >
        {number ?? '—'}
      </text>
    </svg>
  );
}
