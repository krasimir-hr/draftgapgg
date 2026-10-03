import { useRevalidator } from 'react-router-dom';
import EsportsLayout from '../components/EsportsLayout';

export default function WorldsPredictionsError() {
  const { revalidate, state } = useRevalidator();
  return (
    <EsportsLayout>
      <div className="wp-awaiting" role="alert">
        <h1>Worlds data is unavailable</h1>
        <p>We couldn’t load Worlds 2026 from the DraftGap API. Please try again.</p>
        <button type="button" className="wp-reset" disabled={state === 'loading'} onClick={() => void revalidate()}>
          {state === 'loading' ? 'Retrying…' : 'Try again'}
        </button>
      </div>
    </EsportsLayout>
  );
}
