import { useState } from 'react';
import type { Match } from '../../types/models';
import type { SubStage } from '../../lib/leagueView';
import BracketTab from './BracketTab';
import SwissStage from './SwissStage';

interface Props {
  subStages: SubStage[];
  fallbackEventId: number;
  fallbackEventName?: string;
  bm: (eventId: number, stageId?: number) => Match[] | undefined;
  teamLogos: Record<string, string | null>;
  teamShortNames?: Record<string, string>;
  onMatchSelect: (id: number) => void;
}

export default function StagesPicker({
  subStages, fallbackEventId, fallbackEventName, bm, teamLogos, teamShortNames, onMatchSelect,
}: Props) {
  const [idx, setIdx] = useState(0);

  if (subStages.length === 0) {
    return (
      <BracketTab
        eventId={fallbackEventId}
        preloadedMatches={bm(fallbackEventId)}
        eventName={fallbackEventName}
        teamLogos={teamLogos}
        teamShortNames={teamShortNames}
        onMatchSelect={onMatchSelect}
      />
    );
  }

  const ss = subStages[Math.min(idx, subStages.length - 1)];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {subStages.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setIdx(i)}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: idx === i ? 'var(--accent-muted)' : 'var(--surface)',
              color: idx === i ? 'var(--accent-2)' : 'var(--text-dim)',
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '0.01em',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {ss.swiss ? (
        <SwissStage
          key={ss.event.id}
          eventId={ss.event.id}
          preloadedMatches={bm(ss.event.id)}
          teamLogos={teamLogos}
          teamShortNames={teamShortNames}
          onMatchSelect={onMatchSelect}
        />
      ) : (
        <BracketTab
          key={ss.event.id + (ss.tabFilter?.join(',') ?? '') + (ss.tabPrefix ?? '')}
          eventId={ss.event.id}
          tabFilter={ss.tabFilter}
          tabPrefix={ss.tabPrefix}
          preloadedMatches={bm(ss.event.id, ss.stageId)}
          eventName={ss.event.name}
          teamLogos={teamLogos}
          teamShortNames={teamShortNames}
          onMatchSelect={onMatchSelect}
        />
      )}
    </div>
  );
}
