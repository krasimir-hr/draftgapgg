
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase, override_settings

from core.models import League, Event, Player, RosterPlayer


@override_settings(LEAGUEPEDIA_USERNAME='test', LEAGUEPEDIA_PASSWORD='test')
class EventImportTests(TestCase):
    @patch('core.management.commands.sync_events.EsportsClient')
    def test_missing_flags_and_future_dates_do_not_drop_players(self, client):
        page = '2026 Season World Championship/Play-In'
        client.return_value.cargo_client.query.side_effect = [
            [{'Name': 'Worlds Play-In', 'OverviewPage': page, 'League': 'World Championship',
              'DateStart': '2026-10-15', 'Date': None}],
            [{'OverviewPage': page, 'Team': 'Example', 'TeamOverviewPage': 'Example', 'Short': 'EX', 'Region': 'Europe'}],
            [{'OverviewPage': page, 'Team': 'Example', 'RosterLinks': 'Alpha;;Beta', 'Roles': 'Top;;Mid', 'Flags': ''}],
        ]
        call_command('sync_events', year=2026, stdout=StringIO())
        self.assertEqual(Player.objects.count(), 2)
        self.assertEqual(RosterPlayer.objects.count(), 2)
        self.assertEqual(League.objects.get().short_name, 'Worlds')
        self.assertIsNone(Event.objects.get().end_date)
        # Let mwrogue paginate, instead of silently truncating at 500 rows.
        for query in client.return_value.cargo_client.query.call_args_list:
            self.assertNotIn('limit', query.kwargs)

    @patch('core.management.commands.sync_events.EsportsClient')
    def test_stage_rosters_resolve_to_parent_and_reruns_update_roles(self, client):
        parent = 'LPL/2026 Season/Split 1'
        child = parent + ' Playoffs'
        rows = [dict(Name=page, OverviewPage=page, League='Tencent LoL Pro League',
                     DateStart=start, Date='2026-03-01') for page, start in
                [(parent, '2026-01-01'), (child, '2026-02-01')]]
        team = {'OverviewPage': child, 'Team': 'Example', 'TeamOverviewPage': 'Example', 'Short': 'EX'}
        roster = {'OverviewPage': child, 'Team': 'Example', 'RosterLinks': 'Alpha', 'Roles': 'Top', 'Flags': ''}
        client.return_value.cargo_client.query.side_effect = [rows, [team], [roster], rows, [team], [{**roster, 'Roles': 'Jungle'}]]
        for _ in range(2):
            call_command('sync_events', year=2026, stdout=StringIO())
        self.assertEqual(Event.objects.count(), 1)
        self.assertEqual(RosterPlayer.objects.count(), 1)
        self.assertEqual(RosterPlayer.objects.get().role, 'Jungle')
        self.assertEqual(RosterPlayer.objects.get().roster.event.leaguepedia_page, parent)

    @patch('core.management.commands.sync_matches.EsportsClient')
    def test_future_fixtures_sync_and_empty_past_events_are_preserved(self, client):
        league = League.objects.create(name='World Championship', short_name='Worlds')
        future = Event.objects.create(name='Future Worlds', league=league, start_date='2099-10-01', leaguepedia_page='Future')
        old = Event.objects.create(name='Past event', league=league, end_date='2000-01-01', leaguepedia_page='Past')
        client.return_value.cargo_client.query.return_value = []
        with patch('core.management.commands.sync_matches.time.sleep'):
            call_command('sync_matches', all=True, stdout=StringIO())
        wheres = [call.kwargs['where'] for call in client.return_value.cargo_client.query.call_args_list]
        self.assertIn("OverviewPage='Future'", wheres)
        self.assertTrue(Event.objects.filter(pk=old.pk).exists())
        self.assertTrue(Event.objects.filter(pk=future.pk).exists())

    @patch('core.management.commands.sync_events.EsportsClient')
    def test_regional_qualifier_does_not_rename_worlds_league(self, client):
        regional = League.objects.create(name='Tencent LoL Pro League', short_name='LPL')
        worlds = League.objects.create(name='World Championship', short_name='Worlds')
        page = 'LPL/2026 Season/Regional Finals'
        client.return_value.cargo_client.query.side_effect = [
            [{'Name': 'LPL Regional Finals', 'OverviewPage': page, 'League': 'World Championship',
              'DateStart': '2026-09-01', 'Date': '2026-09-07'}], [], [],
        ]
        call_command('sync_events', year=2026, stdout=StringIO())
        worlds.refresh_from_db()
        self.assertEqual(worlds.short_name, 'Worlds')
        self.assertEqual(Event.objects.get().league, regional)


class BracketLayoutTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient
        from core.models import Match
        self.client = APIClient()
        self.staff = get_user_model().objects.create_user(username='editor', is_staff=True)
        league = League.objects.create(name='Test league')
        self.event = Event.objects.create(name='Test playoffs', league=league)
        self.a = Match.objects.create(event=self.event, match_id='a', team1='A', team2='B', bracket_col=1, bracket_order=1)
        self.b = Match.objects.create(event=self.event, match_id='b', team1='C', team2='D', bracket_col=1, bracket_order=2)
        self.url = '/api/matches/bracket-layout/'

    def layout(self, entries):
        return {'event': self.event.pk, 'matches': [dict(id=m.pk, bracket_col=col, bracket_order=slot, is_lower_bracket=lower, is_final=final, next_match=nxt) for m, col, slot, lower, final, nxt in entries]}

    def test_writes_require_staff_and_public_read_remains_available(self):
        from django.contrib.auth import get_user_model
        data = self.layout([(self.a, 1, 2, False, False, None), (self.b, 1, 1, False, False, None)])
        self.assertEqual(self.client.post(self.url, data, format='json').status_code, 401)
        self.assertEqual(self.client.patch(f'/api/matches/{self.a.pk}/bracket/', {'bracket_col': 2}, format='json').status_code, 401)
        self.assertEqual(self.client.post('/api/matches/rename-column/', {'event': self.event.pk, 'bracket_col': 1}, format='json').status_code, 401)
        self.assertEqual(self.client.get('/api/matches/').status_code, 200)
        self.assertFalse(self.client.get('/api/matches/bracket-access/').data['can_edit'])
        self.client.force_authenticate(get_user_model().objects.create_user(username='viewer'))
        self.assertEqual(self.client.post(self.url, data, format='json').status_code, 403)
        self.client.force_authenticate(self.staff)
        self.assertTrue(self.client.get('/api/matches/bracket-access/').data['can_edit'])

    def test_swap_saves_without_unique_position_collision(self):
        self.client.force_authenticate(self.staff)
        data = self.layout([(self.a, 1, 2, False, False, None), (self.b, 1, 1, False, False, None)])
        response = self.client.post(self.url, data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.a.refresh_from_db(); self.b.refresh_from_db()
        self.assertEqual((self.a.bracket_order, self.b.bracket_order), (2, 1))
        self.assertEqual(len(response.data['matches']), 2)

    def test_invalid_layouts_leave_saved_positions_unchanged(self):
        self.client.force_authenticate(self.staff)
        cases = [
            [(self.a, 1, 1, False, False, None), (self.b, 1, 1, False, False, None)],
            [(self.a, 2, 1, False, False, self.b.pk), (self.b, 1, 1, False, False, None)],
            [(self.a, 1, 1, False, False, self.a.pk), (self.b, 2, 1, False, False, None)],
            [(self.a, 1, 1, True, True, None), (self.b, 2, 1, False, False, None)],
        ]
        for entries in cases:
            self.assertEqual(self.client.post(self.url, self.layout(entries), format='json').status_code, 400)
            self.a.refresh_from_db(); self.b.refresh_from_db()
            self.assertEqual((self.a.bracket_col, self.a.bracket_order, self.b.bracket_order), (1, 1, 2))

    def test_occupied_unedited_slot_rolls_back_all_changes(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(self.url, self.layout([(self.a, 1, 2, False, False, None)]), format='json')
        self.assertEqual(response.status_code, 400)
        self.a.refresh_from_db()
        self.assertEqual(self.a.bracket_order, 1)

    def test_cross_event_matches_and_connections_are_rejected(self):
        from core.models import Match
        other = Event.objects.create(name='Other', league=self.event.league)
        foreign = Match.objects.create(event=other, match_id='foreign', team1='X', team2='Y')
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.post(self.url, self.layout([(foreign, 1, 1, False, False, None)]), format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url, self.layout([(self.a, 1, 1, False, False, foreign.pk)]), format='json').status_code, 400)

    def test_staff_can_move_to_lower_path_and_connect_winner(self):
        self.client.force_authenticate(self.staff)
        data = self.layout([(self.a, 1, 1, True, False, self.b.pk), (self.b, 2, 1, False, True, None)])
        self.assertEqual(self.client.post(self.url, data, format='json').status_code, 200)
        self.a.refresh_from_db(); self.b.refresh_from_db()
        self.assertTrue(self.a.is_lower_bracket)
        self.assertEqual(self.a.next_match_id, self.b.pk)
        self.assertTrue(self.b.is_final)
