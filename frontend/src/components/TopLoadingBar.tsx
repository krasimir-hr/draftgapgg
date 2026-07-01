import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router-dom';

// Progress bar pinned to the top of the viewport while a route loader runs.
export default function TopLoadingBar() {
  const navigation = useNavigation();
  const loading = navigation.state === 'loading';

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      setProgress(12);
      const id = setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + (90 - p) * 0.12 + 0.5));
      }, 220);
      return () => clearInterval(id);
    }
    if (visible) {
      setProgress(100);
      const id = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 320);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent-2) 60%, var(--accent-3) 100%)',
          boxShadow: '0 0 8px var(--accent-2), 0 0 2px var(--accent)',
          borderRadius: '0 2px 2px 0',
          transition: progress === 100 ? 'width 0.2s ease, opacity 0.3s ease 0.1s' : 'width 0.25s ease',
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
