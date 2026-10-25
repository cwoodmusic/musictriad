"""Advanced ties redeal within one real Arcade match, without early results.

Run: python3 tests/advanced-tiebreak-browser.py
Reuse the existing public-origin fixture; only near-final cards are arranged.
All finishing moves, animations, sounds, reports and rewards run production code.
"""
import sys
import unittest

sys.dont_write_bytecode=True
from triad_browser_support import TriadBrowserCase

class AdvancedTiebreakTests(TriadBrowserCase):
    def game(self, difficulty='Hard', advanced=True):
        self.load_world();frame=self.cabinet();self.start(frame,advanced=advanced,difficulty=difficulty)
        self.match_cue_count=frame.evaluate('MusicTriadAudioQA.snapshot().cueStarts')
        return frame

    def near_final(self,frame,outcome='tie',capture=False,computer=False):
        # No codaTriadReset: successive boards must remain one tracked match.
        return frame.evaluate('''({outcome,capture,computer})=>{
          window.cancelTriadAnimations();
          const own=computer?[0,1,2,3,4,5,6,7]:outcome==='tie'?(capture?[0,1,2,3,4,14]:[0,1,2,3,4,11,14]):
                    outcome==='win'?[0,1,2,3,4,5,11,14]:[0,1,2,3,11,14];
          board=Array.from({length:16},(_,index)=>index===15?null:{owner:own.includes(index)?0:1,e:Array(4).fill('sn'),meter:'4/4'});
          hands=[[{owner:0,e:Array(4).fill(capture?'wn':'sn'),meter:'4/4'}],
                 [{owner:1,e:Array(4).fill('sn'),meter:'4/4'}]];
          selected=null;turn=computer?1:0;busy=false;endSoundPlayed=false;
          window.__oldTieHands=hands;render();
          return {empty:15,size:16};
        }''',{'outcome':outcome,'capture':capture,'computer':computer})

    def state(self,frame):
        return frame.evaluate('''()=>({board:board.map(card=>card?card.owner:null),
          handSizes:hands.map(hand=>hand.length),fresh:hands!==window.__oldTieHands,
          turn,busy,endSoundPlayed,tracker:window.codaTriadState,
          audio:MusicTriadAudioQA.snapshot(),status:document.querySelector('#status').textContent})''')

    def wait_redeal(self,frame):
        frame.wait_for_function('''()=>board.length===16&&board.every(card=>!card)&&
          hands[0].length===5&&hands[1].length===5&&!busy&&turn===0''',timeout=30000)
        self.assertEqual(frame.locator('#board .slot.empty').count(),16)
        self.assertEqual(frame.locator('#hand .pick:not(:disabled)').count(),5)
        state=self.state(frame)
        self.assertTrue(state['fresh']);self.assertFalse(state['endSoundPlayed'])
        self.assertFalse(state['tracker']['done']);self.assertIn('Tie',state['status'])
        self.assertIn('8',state['status']);self.assertIn('choose a card',state['status'].lower())
        self.assertEqual(state['audio']['cueStarts'],self.match_cue_count);self.assertEqual(state['audio']['mode'],'music')
        self.assertEqual(frame.evaluate('window.__cues'),[])
        return state

    def test_repeated_full_ties_keep_music_run_and_capture_history_until_one_victory_reward(self):
        frame=self.game();before=self.totals()
        frame.evaluate('''()=>{window.__tieMusicStops=0;const original=stopMusic;stopMusic=function(...args){__tieMusicStops++;return original(...args);};}''')
        position=self.near_final(frame,capture=True);run=self.state(frame)['tracker']['id']
        self.last_move(frame,position)
        frame.locator('.notation-clash-layer').wait_for(state='visible')
        # The full tied board cannot pay while its last capture is still being taught.
        self.assertEqual(frame.locator('#board .card').count(),16)
        self.assertEqual(self.reports(),[]);self.assertEqual(self.totals(),before)
        self.assertEqual(frame.evaluate('window.__cues'),[])
        first=self.wait_redeal(frame)
        self.assertEqual(first['tracker']['id'],run);self.assertEqual(first['tracker']['captures'],1)
        self.assertEqual(frame.evaluate('window.__tieMusicStops'),0)
        self.assertEqual(self.reports(),[]);self.assertEqual(self.totals(),before)
        frame.evaluate('render();render()')
        self.assertIn('Tie',frame.locator('#status').inner_text())
        frame.locator('#hand .pick').first.click()
        self.assertNotIn('Tie',frame.locator('#status').inner_text(),'A card selection returns to its normal rule prompt')

        self.near_final(frame,computer=True)
        frame.evaluate('void cpuMove()')
        second=self.wait_redeal(frame)
        self.assertEqual(second['tracker']['id'],run);self.assertEqual(second['tracker']['captures'],1)
        self.assertEqual(frame.evaluate('window.__tieMusicStops'),0)
        self.assertEqual(self.reports(),[]);self.assertEqual(self.totals(),before)
        self.last_move(frame,self.near_final(frame,'win'))
        self.settle(frame)
        self.page.wait_for_function('CodaArcadeQA.progression().achievementRewards.some(item=>item.id==="triadchampion")')
        self.assertEqual(len(self.reports()),1)
        report=self.reports()[0];self.assertEqual(report['runId'],run)
        self.assertEqual(report['result'],{'mode':'computer','rules':'advanced','difficulty':'hard','won':True,'captures':1,'comeback':True,'score':9})
        self.assertEqual(frame.locator('#board .card').count(),16)
        self.assertEqual(frame.locator('#board .slot.empty').count(),0)
        self.assertEqual([cue['kind'] for cue in frame.evaluate('window.__cues')],['win'])
        after=self.totals();self.assertEqual(after['notes']-before['notes'],16);self.assertGreater(after['xp'],before['xp'])
        frame.evaluate('''report=>{render();render();CodaBridge.report(report.runId,report.result);parent.postMessage(report,location.origin);}''',report)
        self.page.wait_for_timeout(100)
        self.assertEqual(self.totals(),after);self.assertEqual(len(self.reports()),2,'Only the deliberately replayed raw envelope is additional')
        self.assertEqual(frame.evaluate('MusicTriadAudioQA.snapshot().cueStarts'),1)

    def test_redeals_preserve_the_lowest_difficulty_for_eventual_win_and_loss(self):
        frame=self.game(difficulty='Normal')
        for won in [True,False]:
            if not won:
                self.start(frame,advanced=True,difficulty='Normal')
                self.match_cue_count=frame.evaluate('MusicTriadAudioQA.snapshot().cueStarts')
            before=self.totals();reports=len(self.reports())
            position=self.near_final(frame);run=self.state(frame)['tracker']['id']
            self.last_move(frame,position);self.wait_redeal(frame)
            frame.locator('#level').select_option('Hard')
            self.last_move(frame,self.near_final(frame));state=self.wait_redeal(frame)
            self.assertEqual(state['tracker']['id'],run);self.assertEqual(state['tracker']['difficulty'],'normal')
            self.assertEqual(len(self.reports()),reports);self.assertEqual(self.totals(),before)
            self.last_move(frame,self.near_final(frame,'win' if won else 'loss'))
            self.settle(frame)
            self.page.wait_for_function('count=>window.__messages.filter(item=>item.data.type==="result").length>count',arg=reports)
            report=self.reports()[-1]
            self.assertEqual(report['runId'],run);self.assertEqual(report['result']['difficulty'],'normal')
            self.assertEqual(report['result']['won'],won);self.assertEqual(report['result']['score'],9 if won else 7)
            self.assertNotIn('triadchampion',self.totals()['rewards'])
            self.assertEqual([cue['kind'] for cue in frame.evaluate('window.__cues')],['win' if won else 'lose'])
            self.home(frame)

    def test_home_and_new_game_cancel_pending_tied_clashes_and_leave_redeals_stopped(self):
        frame=self.game()
        for phase in ['pending','redealt']:
            for action in ['home','new']:
                with self.subTest(phase=phase,action=action):
                    if frame.locator('#startScreen').is_visible():self.start(frame,advanced=True,difficulty='Hard')
                    before=self.totals();reports=len(self.reports())
                    self.last_move(frame,self.near_final(frame,capture=phase=='pending'))
                    if phase=='pending':frame.locator('.notation-clash-layer').wait_for(state='visible')
                    else:self.wait_redeal(frame)
                    if action=='home':self.home(frame)
                    else:
                        frame.locator('#new').click();frame.locator('#exitConfirmYes').click()
                        frame.wait_for_function('board.every(card=>!card)')
                        self.assertEqual(frame.locator('#hand .pick').count(),5)
                    snapshot=frame.evaluate('JSON.stringify({board,hands,turn})')
                    frame.wait_for_timeout(4100)
                    self.assertEqual(frame.evaluate('JSON.stringify({board,hands,turn})'),snapshot)
                    self.assertEqual(len(self.reports()),reports);self.assertEqual(self.totals(),before)
                    self.assertEqual(frame.evaluate('window.__cues'),[])
                    self.assertFalse(frame.evaluate('MusicTriadAnimationQA.state().pending'))
                    self.assertEqual(frame.locator('.notation-clash-layer').count(),0)
                    if action=='new':self.home(frame)

    def test_simple_terminal_games_and_advanced_tutorial_boards_do_not_auto_redeal(self):
        frame=self.game(advanced=False)
        position=frame.evaluate('''()=>{
          cancelTriadAnimations();board=Array.from({length:9},(_,i)=>i===8?null:{owner:[0,1,2,3,5,7].includes(i)?0:1,e:Array(4).fill('sn')});
          hands=[[{owner:0,e:Array(4).fill('sn')}],[{owner:1,e:Array(4).fill('sn')}]];selected=null;turn=0;busy=false;endSoundPlayed=false;render();return {empty:8};
        }''')
        self.last_move(frame,position);self.settle(frame)
        self.assertEqual(frame.locator('#board .card').count(),9)
        self.assertEqual(frame.locator('#board .slot.empty').count(),0)
        self.assertEqual(self.reports()[-1]['result']['rules'],'simple')
        self.assertTrue(self.reports()[-1]['result']['won'])
        self.home(frame)
        if not frame.locator('#homeModeToggle').is_checked():frame.locator('label.mode-toggle').click()
        frame.locator('#tutorialMode').click()
        self.assertTrue(frame.locator('body').evaluate('node=>node.classList.contains("advanced-tutorial-active")'))
        before=self.totals();reports=len(self.reports())
        frame.evaluate('''()=>{
          const cards=Array.from({length:16},(_,i)=>({owner:i<8?0:1,e:Array(4).fill('sn'),meter:'4/4'}));
          window.musicTriadAdvancedTutorial.setup(cards,[]);
        }''')
        frame.wait_for_timeout(100)
        self.assertEqual(frame.locator('#board .card').count(),16)
        self.assertEqual(frame.locator('#board .slot.empty').count(),0)
        self.assertEqual(frame.locator('#hand .pick').count(),0)
        self.assertIn('Tie',frame.locator('#status').inner_text())
        self.assertEqual(len(self.reports()),reports);self.assertEqual(self.totals(),before)

if __name__=='__main__':unittest.main(verbosity=2)
