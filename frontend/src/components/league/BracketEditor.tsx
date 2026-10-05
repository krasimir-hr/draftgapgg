import { useEffect, useState } from 'react';
import axios from 'axios';
import { adminLogin, getBracketAccess, saveBracketLayout, type BracketPlacement } from '../../api/core';
import type { Match } from '../../types/models';
import { orderPlayoffRounds, type PlayoffRound } from '../../lib/playoffStructure';
import { Select } from '../ui/Select';

type Lane = 'upper' | 'lower' | 'final';
interface DraftRound { label: string; upper: number[]; lower: number[]; final: number[] }
const lanes: Lane[] = ['upper', 'lower', 'final'];
const labels = { upper: 'Upper bracket', lower: 'Lower bracket', final: 'Final' };

export default function BracketEditor({ eventId, rounds, matches, onSaved }: {
  eventId: number; rounds: PlayoffRound[]; matches: Match[]; onSaved: (matches: Match[]) => void;
}) {
  const [canEdit, setCanEdit] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<DraftRound[]>([]);
  const [unplaced, setUnplaced] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [target, setTarget] = useState('0:upper');
  const [nextMatches, setNextMatches] = useState<Record<number, number | null>>({});
  useEffect(() => {
    let cancelled = false;
    getBracketAccess().then(r => { if (!cancelled) setCanEdit(r.data.can_edit); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const begin = () => {
    const ordered = orderPlayoffRounds(rounds);
    setUnplaced(matches.filter(m => m.bracket_hidden).map(m => m.id));
    setDraft((ordered.length ? ordered : [{ key: 'empty', label: 'Round 1', matches: [] }]).map(r => ({ label: r.label, ...Object.fromEntries(lanes.map(lane => [lane, r.matches.filter(e => e.lane === lane).map(e => e.match.id)])) } as DraftRound)));
    setNextMatches(Object.fromEntries(ordered.flatMap(r => r.matches.filter(e => e.lane !== 'placement').map(e => [e.match.id, e.winnerNext?.matchId ?? null]))));
    setSelected(null); setMessage(''); setEditing(true);
  };
  const move = (id: number, col: number, lane: Lane, before?: number) => {
    const copy = draft.map(r => ({ ...r, upper: r.upper.filter(n => n !== id), lower: r.lower.filter(n => n !== id), final: r.final.filter(n => n !== id) }));
    const list = copy[col][lane];
    const index = before != null ? list.indexOf(before) : -1;
    list.splice(index < 0 ? list.length : index, 0, id);
    setDraft(copy);
    setUnplaced(prev => prev.filter(n => n !== id));
    // Moving a series can invalidate a link. Clear it rather than create a backwards path.
    const columns = new Map(copy.flatMap((r, i) => lanes.flatMap(l => r[l].map(n => [n, i] as const))));
    setNextMatches(prev => Object.fromEntries(Object.entries(prev).map(([key, next]) => [key, next != null && (columns.get(next) ?? -1) > (columns.get(Number(key)) ?? -1) ? next : null])));
    setSelected(id); setDragging(null); setMessage('Unsaved changes');
  };
  const remove = (id: number) => {
    setDraft(prev => prev.map(r => ({ ...r, upper: r.upper.filter(n => n !== id), lower: r.lower.filter(n => n !== id), final: r.final.filter(n => n !== id) })));
    setUnplaced(prev => [...prev.filter(n => n !== id), id]);
    setNextMatches(prev => Object.fromEntries(Object.entries(prev).map(([key, next]) => [key, Number(key) === id || next === id ? null : next])));
    if (selected === id) setSelected(null);
    setDragging(null); setMessage('Unsaved changes');
  };
  const selectedCol = draft.findIndex(r => lanes.some(lane => selected != null && r[lane].includes(selected)));
  const byId = new Map(matches.map(m => [m.id, m]));
  const name = (id: number) => { const m = byId.get(id); return `${m?.team1 || 'TBD'} vs ${m?.team2 || 'TBD'}`; };
  const info = (id: number) => {
    const m = byId.get(id);
    const date = m?.datetime_utc ? new Date(m.datetime_utc) : null;
    const schedule = date ? `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Date pending';
    return <small className="po-editor-match-info"><span>{schedule}</span><strong>{m?.winner != null ? `${m.team1_score} – ${m.team2_score} · Final` : 'Scheduled'}</strong></small>;
  };
  const errorMessage = (error: unknown) => axios.isAxiosError(error) ? error.response?.status === 401 || error.response?.status === 403 ? 'Your admin session expired. Sign in again to save.' : error.response?.data?.error || 'Could not save the layout. Your changes are still here; try again.' : 'Could not save the layout.';
  const save = async () => {
    setBusy(true); setMessage('');
    const placements: BracketPlacement[] = draft.flatMap((r, col) => lanes.flatMap(lane => r[lane].map((id, index) => ({ id, bracket_col: col + 1, bracket_order: index + 1 + (lane === 'final' ? r.upper.length : 0), is_lower_bracket: lane === 'lower', is_final: lane === 'final', next_match: nextMatches[id] ?? null }))));
    try {
      const response = await saveBracketLayout(eventId, placements, unplaced);
      onSaved(response.data.matches); setEditing(false); setMessage('Bracket saved');
    } catch (error) {
      setMessage(errorMessage(error));
      if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
        setCanEdit(false); setLoginOpen(true);
      }
    }
    finally { setBusy(false); }
  };
  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await adminLogin(username, password);
      localStorage.setItem('access_token', response.data.access);
      const access = await getBracketAccess();
      if (!access.data.can_edit) { localStorage.removeItem('access_token'); setMessage('This account does not have admin access.'); return; }
      setCanEdit(true); setLoginOpen(false); setPassword('');
      if (!editing) begin(); else setMessage('Signed in. You can save your changes now.');
    } catch { setMessage('Sign-in failed. Check your admin username and password.'); }
    finally { setBusy(false); }
  };
  return <div className={`po-admin${editing ? ' is-editing' : ''}`}>
    <div className="po-admin-bar"><span>{editing ? 'Arrange the bracket' : message || ''}</span><div>
      {canEdit && !editing && <button type="button" onClick={begin}>Edit bracket</button>}
      {!canEdit && <button type="button" onClick={() => { setLoginOpen(!loginOpen); setMessage(''); }}>Admin sign in</button>}
      {canEdit && !editing && <button type="button" onClick={() => { localStorage.removeItem('access_token'); setCanEdit(false); setMessage('Signed out'); }}>Sign out</button>}
      {editing && <><button type="button" disabled={busy} onClick={() => { setEditing(false); setMessage(''); }}>Cancel</button><button className="po-admin-save" type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save layout'}</button></>}
    </div></div>
    {loginOpen && <form className="po-admin-login" onSubmit={login}><label>Admin username<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></label><button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><button type="button" onClick={() => { setLoginOpen(false); setPassword(''); }}>Cancel</button></form>}
    {message && (editing || loginOpen) && <p className="po-admin-status" role="status">{message}</p>}
    {editing && <>
      <p className="po-admin-help">Drag a series into a round or path. Drop it above another series to change their order. You can also select a series and use Move below. Changes appear publicly after saving.</p>
      <fieldset disabled={busy} className="po-admin-fields">
        <div className="po-editor-scroll"><div className="po-editor-columns" style={{ gridTemplateColumns: `repeat(${draft.length}, minmax(184px, 1fr))`, minWidth: draft.length * 184 + (draft.length - 1) * 16 }}>
          {draft.map((r, col) => <section key={col}><h4>{r.label}</h4>{lanes.map(lane => <div key={lane} className={`po-drop-zone${dragging != null ? ' is-ready' : ''}`} onDragOver={e => { if (dragging != null) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (dragging != null) move(dragging, col, lane); }}>
            <h5>{labels[lane]}</h5>{r[lane].map(id => <div key={id} className="po-editor-match" draggable={!busy} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id)); setDragging(id); }} onDragEnd={() => setDragging(null)} onDragOver={e => { if (dragging != null) e.preventDefault(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragging != null && dragging !== id) move(dragging, col, lane, id); }}>
              <button type="button" className="po-editor-select" aria-pressed={selected === id} onClick={() => setSelected(id)}><span aria-hidden="true">⠿</span><span>{name(id)}{info(id)}</span></button>
              <button type="button" className="po-editor-remove" aria-label={`Remove ${name(id)} from bracket`} title="Remove from bracket" onClick={() => remove(id)}>×</button>
            </div>)}<span className="po-drop-placeholder">Drop a series here</span>
          </div>)}</section>)}
        </div></div>
        {unplaced.length > 0 && <section className="po-unplaced"><h4>Unplaced matches <span>{unplaced.length}</span></h4><p>These matches keep their results. Drag one into a round, or choose Restore.</p><div>{unplaced.map(id => <div key={id} className="po-unplaced-match" draggable={!busy} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id)); setDragging(id); }} onDragEnd={() => setDragging(null)}><span>{name(id)}{info(id)}</span><button type="button" aria-label={`Restore ${name(id)} to bracket`} onClick={() => move(id, 0, 'upper')}>Restore</button></div>)}</div></section>}
        <div className="po-move-controls"><span>{selected ? name(selected) : 'Select a series to move it or connect its winner.'}</span>
          {selected != null && <><Select ariaLabel="Move selected series to" value={target} onChange={value => setTarget(String(value))} options={draft.flatMap((r, i) => lanes.map(lane => ({ value: `${i}:${lane}`, label: `${r.label} · ${labels[lane]}` })))}/><button type="button" onClick={() => { const [col, lane] = target.split(':'); move(selected, Number(col), lane as Lane); }}>Move</button><Select ariaLabel="Winner advances to" value={String(nextMatches[selected] ?? '')} onChange={value => { setNextMatches(prev => ({ ...prev, [selected]: value ? Number(value) : null })); setMessage('Unsaved changes'); }} options={[{ value: '', label: 'No winner connection' }, ...draft.slice(selectedCol + 1).flatMap(r => lanes.flatMap(lane => r[lane].map(id => ({ value: String(id), label: `${r.label} · ${name(id)}` }))))]}/></>}
        </div>
      </fieldset>
    </>}
  </div>;
}
