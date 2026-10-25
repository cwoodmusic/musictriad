"""Run: python tests/arcade-integration-browser.py (requires sibling coda-arcade)."""
import unittest
import sys

sys.dont_write_bytecode = True

from triad_browser_support import TriadBrowserCase, open_destination, talk_to_musician


class ArcadeIntegrationTests(TriadBrowserCase):
    def test_advanced_hard_real_last_move_earns_missions_notes_xp_and_equippable_crown_once(self):
        self.load_world()
        for person in ['bach', 'mozart', 'miles']:
            self.accept_mission(person)
        frame = self.cabinet()
        self.start(frame, advanced=True, difficulty='Hard')
        position = self.position(frame)
        before = self.totals()
        self.last_move(frame, position)
        frame.wait_for_function('window.MusicTriadAnimationQA.state().pending')
        self.assertEqual(self.totals(), before, 'No rewards during capture animation')
        self.assertEqual(frame.evaluate('window.__cues'), [], 'No early victory cue')
        self.settle(frame)
        self.page.wait_for_function('CodaArcadeQA.progression().achievementRewards.some(i=>i.id==="triadchampion")')
        after = self.totals()
        self.assertEqual(after['notes'] - before['notes'], 16)
        self.assertEqual(after['xp'] - before['xp'], 412)
        report = self.reports()[-1]
        self.assertEqual(report['result'], {'mode':'computer','rules':'advanced',
          'difficulty':'hard','won':True,'captures':4,'comeback':True,'score':11})
        self.assertEqual([cue['kind'] for cue in frame.evaluate('window.__cues')], ['win'])
        missions = self.page.evaluate('CodaArcadeQA.missions().missions')
        for person in ['bach', 'mozart', 'miles']:
            mission = next(item for item in missions if item['person'] == person)
            self.assertEqual(mission['status'], 'complete')

        # Re-render, local hook replay, and actual postMessage replay cannot pay twice.
        frame.evaluate('''report=>{
          render();render();CodaBridge.report(report.runId,report.result);
          parent.postMessage(report,location.origin);
        }''', report)
        self.page.wait_for_timeout(150)
        self.assertEqual(self.totals(), after)
        self.assertEqual(len(frame.evaluate('window.__cues')), 1)
        self.page.locator('#returnworld').click()
        talk_to_musician(self.page, 'bach')
        self.page.locator('.musician-choices').get_by_role('button', name='mission', exact=False).click()
        self.page.get_by_role('button', name='Collect reward', exact=True).click()
        paid = self.totals()
        self.assertEqual(paid['notes'] - after['notes'], 90)
        self.assertEqual(paid['xp'] - after['xp'], 100)
        open_destination(self.page, 'boutique')
        self.page.get_by_label('Hats', exact=True).select_option('triadchampion')
        self.page.get_by_role('button', name='Save my look', exact=True).click()
        self.assertEqual(self.page.evaluate('CodaArcadeQA.characters().player.appearance.headwear'), 'triadchampion')
        # Saving the first customized outfit can independently earn Arcade XP.
        if self.page.locator('#panel').is_visible():
            self.page.locator('#panelClose').click()
        self.page.wait_for_function('CodaArcadeQA.progression().recent.some(item=>item.id==="achievement:bowtie")')
        equipped = self.totals()
        self.assertEqual(equipped['notes'], paid['notes'])
        self.load_world()
        self.assertEqual(self.totals(), equipped)
        self.assertEqual(self.page.evaluate('CodaArcadeQA.characters().player.appearance.headwear'), 'triadchampion')
        frame = self.cabinet()
        # Persisted run IDs remain deduplicated after the parent and child reload.
        frame.evaluate('report=>CodaBridge.report(report.runId,report.result)', report)
        self.page.wait_for_timeout(150)
        self.assertEqual(self.totals(), equipped)

    def test_only_correct_iframe_origin_and_token_can_change_arcade_progress(self):
        self.load_world()
        frame = self.cabinet()
        self.start(frame)
        before = self.totals()
        frame.evaluate('''()=>{
          const init=window.__messages.findLast(m=>m.data.type==='init').data;
          const result={mode:'computer',rules:'advanced',difficulty:'hard',won:true,
            captures:4,comeback:true,score:11};
          const envelope={coda:1,type:'result',game:'triad',token:init.token,
            runId:'tampered',result};
          parent.postMessage({...envelope,token:'wrong'},location.origin);
          parent.postMessage({...envelope,game:'pitch'},location.origin);
          parent.postMessage({...envelope,coda:0},location.origin);
          parent.dispatchEvent(new MessageEvent('message',{source:window,
            origin:'https://wrong.example',data:envelope}));
          parent.dispatchEvent(new MessageEvent('message',{source:parent,
            origin:location.origin,data:envelope}));
        }''')
        self.page.wait_for_timeout(150)
        self.assertEqual(self.totals(), before)
        self.assertNotIn('triadchampion', before['rewards'])
        stale = frame.evaluate('window.__messages.findLast(m=>m.data.type==="init").data.token')
        self.page.locator('#returnworld').click()
        frame = self.cabinet()
        frame.evaluate('''token=>parent.postMessage({coda:1,type:'result',game:'triad',token,
          runId:'previous-cabinet-session',result:{mode:'computer',rules:'advanced',
          difficulty:'hard',won:true,captures:4,comeback:true,score:11}},location.origin)''', stale)
        self.page.wait_for_timeout(150)
        self.assertEqual(self.totals(), before, 'A previous cabinet token cannot award progress')

    def test_simple_hard_advanced_normal_losses_and_tutorial_cannot_award_hard_advanced_crown(self):
        self.load_world()
        frame = self.cabinet()
        for advanced, difficulty, won in [(False,'Hard',True),(True,'Normal',True),(True,'Hard',False)]:
            self.start(frame, advanced=advanced, difficulty=difficulty)
            position = self.position(frame, won=won)
            self.last_move(frame, position)
            self.settle(frame)
            self.assertNotIn('triadchampion', self.totals()['rewards'])
            self.assertEqual(self.reports()[-1]['result']['won'], won)
            self.home(frame)
        # Use the real Advanced tutorial launcher; completed scripted boards stay practice.
        if not frame.locator('#homeModeToggle').is_checked():
            frame.locator('label.mode-toggle').click()
        frame.locator('#tutorialMode').click()
        before = self.totals()
        reports = len(self.reports())
        frame.evaluate('''()=>{
          board=Array.from({length:16},()=>({owner:0,e:Array(4).fill('wn'),meter:'4/4'}));
          hands=[[],[]];busy=false;turn=0;render();
        }''')
        self.page.wait_for_timeout(300)
        self.assertEqual(self.totals(), before)
        self.assertEqual(len(self.reports()), reports)

    def test_reset_and_home_cancel_pending_final_moves_without_arcade_rewards(self):
        self.load_world()
        frame = self.cabinet()
        for advanced in [False, True]:
            for action in ['new', 'home']:
                with self.subTest(advanced=advanced,action=action):
                    self.start(frame, advanced=advanced, difficulty='Hard')
                    position = self.position(frame)
                    before = self.totals()
                    reports = len(self.reports())
                    self.last_move(frame, position)
                    frame.wait_for_function('MusicTriadAnimationQA.state().pending')
                    if action == 'new':
                        frame.evaluate('starter=0')
                        frame.locator('#new').click()
                        frame.locator('#exitConfirmYes').click()
                    else:
                        self.home(frame)
                    self.page.wait_for_timeout(2000)
                    self.assertEqual(self.totals(), before)
                    self.assertEqual(len(self.reports()), reports)
                    self.assertEqual(frame.evaluate('window.__cues'), [])
                    if action == 'new':
                        self.home(frame)


if __name__ == '__main__':
    unittest.main(verbosity=2)
