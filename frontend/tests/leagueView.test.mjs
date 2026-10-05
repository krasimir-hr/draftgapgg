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
