export const ROLE_ABBR: Record<string, string> = {
  Top: 'TOP', Jungle: 'JGL', Mid: 'MID', Bot: 'BOT', Support: 'SUP',
};

export const ROLE_OPTIONS = [
  { key: 'All',     label: 'All' },
  { key: 'Top',     label: 'TOP' },
  { key: 'Jungle',  label: 'JGL' },
  { key: 'Mid',     label: 'MID' },
  { key: 'Bot',     label: 'BOT' },
  { key: 'Support', label: 'SUP' },
] as const;

export type RoleFilter = typeof ROLE_OPTIONS[number]['key'];

export function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-0.5 ${active ? 'text-(--accent-2)' : 'opacity-25'}`}>
      {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );
}

export function RoleFilterBar({
  selected,
  onChange,
}: {
  selected: RoleFilter;
  onChange: (r: RoleFilter) => void;
}) {
  return (
    <div className="flex items-center gap-1 px-5 py-3 border-b border-(--border)">
      {ROLE_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide transition-colors ${
            selected === key
              ? 'bg-(--accent-muted) text-(--accent-2)'
              : 'text-(--text-dim) hover:text-(--text-h) hover:bg-(--surface-sub)'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
