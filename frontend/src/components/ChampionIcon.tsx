export function ChampionIcon({
  src,
  alt,
  size = 32,
  style: extraStyle,
}: {
  src: string;
  alt: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const radius = size <= 36 ? 6 : size <= 56 ? 10 : 14;
  return (
    <div
      style={{
        width: size,
        height: size,
        boxSizing: 'border-box',
        borderRadius: radius,
        overflow: 'hidden',
        flexShrink: 0,
        border: '1px solid var(--accent-border)',
        boxShadow: 'var(--shadow-md)',
        ...extraStyle,
      }}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scale(1.14)',
        }}
      />
    </div>
  );
}
