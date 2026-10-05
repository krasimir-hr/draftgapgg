
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
