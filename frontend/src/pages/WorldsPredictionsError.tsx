import { useRevalidator } from 'react-router-dom';
import './WorldsPredictionsPage.css';

export default function WorldsPredictionsError() {
  const { revalidate, state } = useRevalidator();
  return (
    <div className="wp-page es-scroll">
      <div className="wp-container wp-panel wp-empty" role="alert">
        <h1>We couldn’t load the Worlds schedule</h1>
        <p>The connection is temporarily unavailable. Try again in a moment.</p>
        <button type="button" className="wp-button" disabled={state === 'loading'} onClick={() => void revalidate()}>
          {state === 'loading' ? 'Retrying…' : 'Try again'}
        </button>
      </div>
    </div>
  );
}
