import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Run the pure view resolver using the project's existing TypeScript compiler.
// Data URLs resolve its local import without requiring a browser or test bundler.
function moduleUrl(path, imports = {}) {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [name, url] of Object.entries(imports)) code = code.replaceAll(`'${name}'`, JSON.stringify(url));
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const { resolveLeagueView, bracketNeeds } = await import(moduleUrl('../src/lib/leagueView.ts', {
  '../utils/slugs': moduleUrl('../src/utils/slugs.ts'),
}));
const { orderedBracketTabs } = await import(moduleUrl('../src/lib/bracketRounds.ts'));
const { buildPlayoffs, orderPlayoffRounds } = await import(moduleUrl('../src/lib/playoffStructure.ts', {
  './bracketRounds': moduleUrl('../src/lib/bracketRounds.ts'),
}));
const league = { id: 1, name: 'LoL Champions Korea', short_name: 'LCK' };
const event = (name, stages = []) => ({ id: 28, name, league, year: 2026, start_date: '2026-01-01', is_active: true, stages });
const resolve = (e) => resolveLeagueView(e.league, [e], e.league.short_name.toLowerCase(), undefined);
const stage = (id, name, type) => ({ id, name, type, order: id, has_lower_bracket: false });

test('standalone LCK playoffs preload a bracket rather than a standings stage', () => {
  const view = resolve(event('LCK 2026 Season Playoffs'));
  assert.equal(view.subStages.length, 1);
  assert.equal(view.subStages[0].isStandings, undefined);
  assert.deepEqual(bracketNeeds(view), [{ eventId: 28, stageId: undefined }]);
});

test('a playoff-only event with explicit stage metadata has no regular-season stage', () => {
  const view = resolve(event('LCK Invitational', [stage(9, 'Knockout', 'playoff')]));
  assert.deepEqual(view.subStages.map(s => s.label), ['Knockout']);
  assert.deepEqual(bracketNeeds(view), [{ eventId: 28, stageId: 9 }]);
});

test('a mixed event preserves both standings and the filtered playoff bracket', () => {
  const view = resolve(event('LCK 2026 Rounds 1-2', [stage(1, 'Regular Season', 'league'), stage(2, 'Road to MSI', 'playoff')]));
  assert.deepEqual(view.subStages.map(s => [s.label, !!s.isStandings]), [['Regular Season', true], ['Road to MSI', false]]);
  assert.deepEqual(bracketNeeds(view), [{ eventId: 28, stageId: 2 }]);
});

test('regular-season events continue to use standings without loading bracket matches', () => {
  for (const stages of [[], [stage(1, 'Regular Season', 'league')]]) {
    const view = resolve(event('LCK 2026 Rounds 3-4', stages));
    assert.deepEqual(view.subStages, []);
    assert.deepEqual(bracketNeeds(view), []);
  }
});

test('explicit league metadata takes precedence over a playoff-like event name', () => {
  assert.deepEqual(resolve(event('LCK Playoffs Qualification', [stage(1, 'Regular Season', 'league')])).subStages, []);
});

test('Worlds keeps its Swiss and knockout stages without adding league standings', () => {
  const view = resolve({ ...event('Worlds 2026 Main Event'), league: { ...league, short_name: 'Worlds' } });
  assert.deepEqual(view.subStages.map(s => s.label), ['Swiss Stage', 'Knockout']);
  assert.ok(view.subStages.every(s => !s.isStandings));
  assert.deepEqual(bracketNeeds(view), [{ eventId: 28, stageId: undefined }]);
});

test('imported playoff rounds run forward despite newest-first API order and overlapping dates', () => {
  const matches = [
    { tab: 'Finals', datetime_utc: '2026-09-13' },
    { tab: 'Round 4', datetime_utc: '2026-09-12' },
    { tab: 'Round 3', datetime_utc: '2026-09-06' },
    { tab: 'Round 4', datetime_utc: '2026-09-05' },
    { tab: 'Round 2', datetime_utc: '2026-09-01' },
    { tab: 'Round 1', datetime_utc: '2026-08-29' },
  ];
  assert.deepEqual(orderedBracketTabs(matches), ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Finals']);
});

test('named knockout rounds sort correctly and explicit bracket columns are not regrouped', () => {
  assert.deepEqual(orderedBracketTabs([
    { tab: 'Finals' }, { tab: 'Semifinals' }, { tab: 'Quarterfinals' }, { tab: 'Wired round', bracket_col: 1 },
  ]), ['Quarterfinals', 'Semifinals', 'Finals']);
});

const fixture = (id, tab, day, team1, team2, winner) => ({
  id, tab, datetime_utc: day ? `2026-${day}T08:00:00Z` : null, team1, team2, winner,
  bracket_col: null, is_lower_bracket: false, is_final: false, next_match: null,
});
const lckPlayoffs = [
  fixture(884, 'Finals', '09-13', 'GEN', 'HLE', 1),
  fixture(893, 'Round 4', '09-12', 'HLE', 'T1', 1),
  fixture(891, 'Round 3', '09-06', 'T1', 'DK', 1),
  fixture(892, 'Round 4', '09-05', 'GEN', 'HLE', 1),
  fixture(890, 'Round 2', '09-04', 'KT', 'DK', 2),
  fixture(887, 'Round 1', '09-03', 'BFX', 'DK', 2),
  fixture(889, 'Round 2', '09-02', 'HLE', 'T1', 1),
  fixture(888, 'Round 2', '09-01', 'GEN', 'KT', 1),
  fixture(886, 'Round 1', '08-30', 'DK', 'KT', 2),
  fixture(885, 'Round 1', '08-29', 'T1', 'BFX', 1),
];
test('LCK matches separate into upper, lower and final paths in chronological order', () => {
  const model = buildPlayoffs(lckPlayoffs);
  assert.equal(model.doubleElimination, true);
  assert.equal(model.champion, 'GEN');
  assert.equal(model.teams.length, 6);
  assert.deepEqual(model.rounds[0].matches.map(e => [e.match.id, e.lane]), [[885, 'upper'], [886, 'upper'], [887, 'lower']]);
  assert.deepEqual(model.rounds[3].matches.map(e => [e.match.id, e.lane]), [[892, 'upper'], [893, 'lower']]);
  assert.equal(model.rounds.at(-1).matches[0].lane, 'final');
});
test('recorded team progression follows both winners and losers to their actual next series', () => {
  const first = buildPlayoffs(lckPlayoffs).rounds[0].matches[0];
  assert.deepEqual(first.winnerNext, { matchId: 889, round: 'Round 2', lane: 'upper' });
  assert.deepEqual(first.loserNext, { matchId: 887, round: 'Round 1', lane: 'lower' });
});
test('a third-place match does not turn single elimination into a lower bracket', () => {
  const model = buildPlayoffs([
    fixture(1, 'Semifinals', '09-01', 'A', 'B', 1), fixture(2, 'Semifinals', '09-02', 'C', 'D', 1),
    fixture(3, 'Finals', '09-03', 'A', 'C', null), fixture(4, 'Third place', '09-03', 'B', 'D', 1),
  ]);
  assert.equal(model.doubleElimination, false);
  assert.equal(model.champion, null);
  assert.ok(model.rounds.every(r => r.matches.every(e => e.lane !== 'lower')));
  assert.equal(model.rounds.find(r => r.label === 'Third place').matches[0].lane, 'placement');
});

test('pending fixtures preserve explicit wiring without inventing champions or TBD team paths', () => {
  const first = { ...fixture(1, 'Round 1', null, 'TBD', 'TBD', null), next_match: 2 };
  const model = buildPlayoffs([first, fixture(2, 'Finals', null, 'TBD', 'TBD', null)]);
  assert.equal(model.champion, null);
  assert.deepEqual(model.teams, []);
  assert.deepEqual(model.rounds[0].matches[0].winnerNext, { matchId: 2, round: 'Finals', lane: 'final' });
  assert.equal(model.rounds[0].matches[0].loserNext, undefined);
});


test('whole bracket aligns feeders with destinations without changing chronological round details', () => {
  const model = buildPlayoffs(lckPlayoffs);
  const arranged = orderPlayoffRounds(model.rounds);
  assert.deepEqual(arranged[0].matches.filter(e => e.lane === 'upper').map(e => e.match.id), [886, 885]);
  assert.deepEqual(arranged[1].matches.filter(e => e.lane === 'upper').map(e => e.match.id), [888, 889]);
  assert.deepEqual(model.rounds[0].matches.map(e => e.match.id), [885, 886, 887]);
  assert.equal(arranged.flatMap(r => r.matches).length, 10);
  assert.deepEqual(arranged.map(r => r.key), model.rounds.map(r => r.key));
});


test('saved admin positions override inferred lanes, feeder sorting and cleared winner links', () => {
  const model = buildPlayoffs([
    { ...fixture(1, 'Finals', '09-01', 'A', 'B', 1), bracket_col: 1, bracket_order: 2 },
    { ...fixture(2, 'Round 1', '09-02', 'C', 'D', 1), bracket_col: 1, bracket_order: 1 },
    { ...fixture(3, 'Round 2', '09-03', 'A', 'C', 1), bracket_col: 2, bracket_order: 1, is_final: true },
  ]);
  assert.deepEqual(orderPlayoffRounds(model.rounds)[0].matches.map(e => e.match.id), [2, 1]);
  assert.equal(model.rounds[0].matches.find(e => e.match.id === 1).lane, 'upper');
  assert.equal(model.rounds[0].matches.find(e => e.match.id === 1).winnerNext, undefined);
  assert.equal(model.rounds[1].matches[0].lane, 'final');
});


test('removed matches disappear from every bracket path, champion and team calculations', () => {
  const hidden = lckPlayoffs.map(m => ({ ...m, bracket_hidden: true }));
  const model = buildPlayoffs(hidden);
  assert.deepEqual(model.rounds, []);
  assert.deepEqual(model.teams, []);
  assert.equal(model.champion, null);
  const partial = buildPlayoffs(lckPlayoffs.map(m => ({ ...m, bracket_hidden: m.id === 884 })));
  assert.equal(partial.champion, null);
  assert.ok(partial.rounds.flatMap(r => r.matches).every(e => e.match.id !== 884 && e.winnerNext?.matchId !== 884));
});
