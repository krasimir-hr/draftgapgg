import { useTheme } from '../contexts/ThemeContext';

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

/** Segmented light | dark toggle: both icons shown, the active mode raised. */
export default function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      <button
        type="button"
        className={`theme-toggle-opt${resolved === 'light' ? ' active' : ''}`}
        onClick={() => setTheme('light')}
        aria-pressed={resolved === 'light'}
        aria-label="Light theme"
        title="Light theme"
      >
        <SunIcon />
      </button>
      <button
        type="button"
        className={`theme-toggle-opt${resolved === 'dark' ? ' active' : ''}`}
        onClick={() => setTheme('dark')}
        aria-pressed={resolved === 'dark'}
        aria-label="Dark theme"
        title="Dark theme"
      >
        <MoonIcon />
      </button>
    </div>
  );
}
