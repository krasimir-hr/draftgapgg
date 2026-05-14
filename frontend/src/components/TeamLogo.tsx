interface TeamLogoProps {
  name: string;
  logo?: string | null;
  className?: string;
}

export default function TeamLogo({ name, logo, className = 'w-9 h-9' }: TeamLogoProps) {
  if (logo) {
    return (
      <div className={`${className} shrink-0 flex items-center justify-center overflow-hidden`}>
        <img src={logo} alt={name} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className={`${className} rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0`}
      style={{ background: 'var(--accent)' }}
    >
      {name.charAt(0)}
    </div>
  );
}
