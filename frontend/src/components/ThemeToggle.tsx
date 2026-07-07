import { useTheme, type Theme } from '../contexts/ThemeContext';

const SunIcon = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <circle cx="8" cy="8" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M12.6 3.4l-1.06 1.06M4.46 11.54 3.4 12.6"
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
    />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <path
      d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z"
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
    />
  </svg>
);

const MonitorIcon = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5.5 13.75h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
const ICON: Record<Theme, () => React.JSX.Element> = { light: SunIcon, dark: MoonIcon, system: MonitorIcon };
const LABEL: Record<Theme, string> = { light: 'Light theme', dark: 'Dark theme', system: 'System theme' };

/** Icon button cycling light → dark → system. */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = ICON[theme];
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(NEXT[theme])}
      title={`${LABEL[theme]} — click to switch`}
      aria-label={`${LABEL[theme]} active, switch to ${LABEL[NEXT[theme]].toLowerCase()}`}
    >
      <Icon />
    </button>
  );
}
