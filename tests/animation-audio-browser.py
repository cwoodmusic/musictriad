"""Real-timer desktop/phone presentation and Web Audio regressions."""
import unittest
import sys

sys.dont_write_bytecode = True

from triad_browser_support import TriadBrowserCase, TRIAD


class AnimationAudioTests(TriadBrowserCase):
    def install_audio_probe(self):
        # Observe the real native nodes and their automation; keep playback intact.
        self.context.add_init_script('''(()=>{
          window.__audioProbe={sources:[],gains:[],ramps:[]};
          const P=(window.AudioContext||window.webkitAudioContext)?.prototype;
          if(!P)return;
          for(const name of ['createOscillator','createBufferSource','createGain']){
            const original=P[name];
            P[name]=function(...args){const node=original.apply(this,args);
              if(name==='createGain'){
                window.__audioProbe.gains.push(node);node.gain.__probeOwner=node;
              }else window.__audioProbe.sources.push(node);
              return node;
            };
          }
          const ramp=AudioParam.prototype.exponentialRampToValueAtTime;
          AudioParam.prototype.exponentialRampToValueAtTime=function(value,time){
            window.__audioProbe.ramps.push({parameter:this,value,time});
            return ramp.call(this,value,time);
          };
        })()''')

    def load_game(self, advanced=False, phone=False):
        self.page.set_viewport_size({'width':390,'height':844} if phone else {'width':1440,'height':1000})
        self.page.goto(TRIAD, wait_until='domcontentloaded')
        self.page.wait_for_function('window.CodaBridge&&window.MusicTriadAnimationQA')
        self.start(self.page.main_frame, advanced=advanced, difficulty='Hard')
        return self.page.main_frame

    def observe_comparisons(self, frame):
        frame.evaluate("""()=>{
          window.__comparisonWindows=[];
          new MutationObserver(records=>{
            for(const record of records){
              for(const node of record.addedNodes)if(node.matches?.('.notation-clash-layer'))
                __comparisonWindows.push({node,opened:performance.now(),closed:null});
              for(const node of record.removedNodes){const item=__comparisonWindows.find(i=>i.node===node);
                if(item)item.closed=performance.now();}
            }
          }).observe(document.body,{childList:true});
        }""")

    def test_comparison_has_a_static_read_then_clash_then_result_before_capture(self):
        frame = self.load_game()
        position = self.position(frame)
        # One real neighboring opponent keeps this a single visible comparison.
        frame.evaluate("""()=>{
          for(let i=0;i<board.length;i++)if(board[i])board[i].owner=i===5?1:0;
          codaTriadReset();render();
        }""")
        self.last_move(frame, position)
        overlay = frame.locator('.notation-clash-layer')
        overlay.wait_for(state='visible')
        self.assertEqual(overlay.get_attribute('data-phase'), 'reading')
        self.assertEqual(overlay.locator('.clash-facing-edge svg').count(), 2)
        self.assertIn('WHOLE NOTE', overlay.locator('.triad-clash-math').inner_text())
        self.assertIn('SIXTEENTH NOTE', overlay.locator('.triad-clash-math').inner_text())
        starting = overlay.locator('.triad-clash-card').evaluate_all(
            "nodes=>nodes.map(n=>({transform:getComputedStyle(n).transform,opacity:getComputedStyle(n).opacity}))")
        frame.wait_for_timeout(1450)
        self.assertEqual(overlay.get_attribute('data-phase'), 'reading')
        self.assertEqual(overlay.locator('.triad-clash-card').evaluate_all(
            "nodes=>nodes.map(n=>({transform:getComputedStyle(n).transform,opacity:getComputedStyle(n).opacity}))"), starting)
        self.assertEqual(frame.locator('.capture-flash').count(), 0)
        self.assertEqual(frame.evaluate('window.__cues'), [])
        overlay.wait_for(state='visible')
        frame.wait_for_function("document.querySelector('.notation-clash-layer')?.dataset.phase==='clashing'")
        frame.wait_for_function("document.querySelector('.notation-clash-layer')?.dataset.phase==='result'")
        self.assertEqual(overlay.locator('.has-lost').count(), 1)
        frame.wait_for_timeout(500)
        self.assertEqual(overlay.get_attribute('data-phase'), 'result')
        self.assertEqual(frame.evaluate('window.__cues'), [])
        self.settle(frame)
        self.assertIn('You win', frame.locator('#status').inner_text())

    def test_svg_comparisons_allow_reading_time_and_end_cue_waits_for_final_board_on_desktop_and_phone(self):
        for phone, advanced in [(False,False),(True,False),(False,True),(True,True)]:
            with self.subTest(phone=phone,advanced=advanced):
                frame = self.load_game(advanced=advanced, phone=phone)
                position = self.position(frame)
                self.observe_comparisons(frame)
                self.last_move(frame, position)
                frame.locator('.notation-clash-layer').wait_for(state='visible')
                self.assertGreaterEqual(frame.locator('.notation-clash-layer svg').count(), 2)
                self.assertEqual(frame.locator('.notation-clash-layer .triad-clash-card .card').count(), 2)
                self.assertEqual(frame.locator('.notation-clash-layer .triad-clash-card .edge').count(), 8)
                self.assertEqual(frame.evaluate('window.__cues'), [])
                bounds = frame.locator('.notation-clash-layer').bounding_box()
                self.assertGreaterEqual(bounds['x'], -1)
                self.assertLessEqual(bounds['x'] + bounds['width'], self.page.viewport_size['width'] + 1)
                self.assertLessEqual(frame.evaluate('document.documentElement.scrollWidth'), self.page.viewport_size['width'])
                self.settle(frame)
                self.assertEqual(frame.locator('#board .card.you').count(), 11 if advanced else 7)
                self.assertEqual(frame.locator('#board .card.cpu').count(), 5 if advanced else 2)
                self.assertIn('You win', frame.locator('#status').inner_text())
                cues = frame.evaluate('window.__cues')
                self.assertEqual([cue['kind'] for cue in cues], ['win'])
                self.assertFalse(cues[0]['animation']['pending'])
                self.assertFalse(cues[0]['animation']['clashes'])
                self.assertFalse(cues[0]['animation']['captures'])
                elapsed = cues[0]['time'] - frame.evaluate('window.__lastMoveStarted')
                self.assertGreaterEqual(elapsed, 10000, 'All four comparisons retain at least 2.5 seconds of reading time')
                self.assertLess(elapsed, 30000)
                comparisons = frame.evaluate('window.__comparisonWindows.map(({opened,closed})=>({opened,closed}))')
                self.assertEqual(len(comparisons), 4)
                for index, comparison in enumerate(comparisons):
                    self.assertIsNotNone(comparison['closed'])
                    self.assertGreaterEqual(comparison['closed']-comparison['opened'], 3500,
                                            'Later comparisons keep the full lesson pace')
                    if index:self.assertGreaterEqual(comparison['opened'],comparisons[index-1]['closed']-30)
                self.assertGreaterEqual(cues[0]['time'], comparisons[-1]['closed']-30)

    def test_advanced_computer_reveal_does_not_flash_captures_before_reading(self):
        frame = self.load_game(advanced=True)
        self.position(frame)
        frame.evaluate("""()=>{
          for(let i=0;i<board.length;i++)if(board[i]){
            board[i].owner=[1,4,6,9].includes(i)?0:1;board[i].e=Array(4).fill('sn');
          }
          hands[1]=[{owner:1,e:Array(4).fill('wn'),meter:'4/4'}];
          turn=1;busy=false;codaTriadReset();render();
          window.__cpuReports=[];const report=CodaBridge.report;
          CodaBridge.report=(id,result)=>{__cpuReports.push({id,result,time:performance.now()});return report(id,result)};
          window.__captureFlashes=[];
          new MutationObserver(records=>{
            for(const item of records)if(item.target.matches?.('.slot.capture-flash'))
              __captureFlashes.push(performance.now());
          }).observe(document.querySelector('#board'),{attributes:true,attributeFilter:['class'],subtree:true});
        }""")
        self.observe_comparisons(frame)
        frame.evaluate("()=>{window.__lastMoveStarted=performance.now();cpuMove();return true}")
        frame.wait_for_timeout(40)
        self.assertEqual(frame.evaluate('window.__captureFlashes'), [], 'The 80ms computer reveal cannot start a board flip')
        overlay = frame.locator('.notation-clash-layer')
        overlay.wait_for(state='visible')
        self.assertEqual(overlay.get_attribute('data-phase'), 'reading')
        frame.wait_for_timeout(1400)
        self.assertEqual(overlay.get_attribute('data-phase'), 'reading')
        self.assertEqual(frame.evaluate('window.__captureFlashes'), [])
        self.assertEqual(frame.evaluate('window.__cpuReports'), [])
        self.assertEqual(frame.evaluate('window.__cues'), [])
        self.settle(frame)
        comparisons = frame.evaluate('window.__comparisonWindows.map(({opened,closed})=>({opened,closed}))')
        self.assertEqual(len(comparisons), 4)
        flashes = frame.evaluate('window.__captureFlashes')
        self.assertTrue(flashes)
        self.assertGreaterEqual(min(flashes),comparisons[-1]['closed']-30)
        self.assertEqual(frame.locator('#board .card.cpu').count(),16)
        self.assertEqual([cue['kind'] for cue in frame.evaluate('window.__cues')],['lose'])
        reports = frame.evaluate('window.__cpuReports')
        self.assertEqual(len(reports),1)
        self.assertFalse(reports[0]['result']['won'])
        self.assertGreaterEqual(reports[0]['time'],comparisons[-1]['closed']-30)

    def test_advanced_special_cards_explain_their_rule_before_capture(self):
        for special, defender, expected in [('qfermata','qn','attacker'),('qfermata','qr','defender'),
                                             ('mmrest','qr','attacker'),('mmrest','qn','defender')]:
            with self.subTest(special=special,defender=defender):
                frame = self.load_game(advanced=True)
                position = self.position(frame)
                frame.evaluate("""({special,defender})=>{
                  for(let i=0;i<board.length;i++)if(board[i]){
                    board[i].owner=i===6?1:0;board[i].e=Array(4).fill(defender);
                  }
                  hands[0][0]={owner:0,special,e:[]};codaTriadReset();render();
                }""", {'special':special,'defender':defender})
                self.last_move(frame, position)
                overlay = frame.locator('.notation-clash-layer')
                overlay.wait_for(state='visible')
                self.assertEqual(overlay.get_attribute('data-phase'),'reading')
                self.assertIn('special card rule',overlay.locator('.triad-clash-cue').inner_text())
                self.assertIn('captures notes' if special=='qfermata' else 'captures rests',
                              overlay.locator('.triad-clash-math').inner_text())
                self.assertEqual(overlay.get_attribute('data-result'),expected)
                frame.wait_for_function("document.querySelector('.notation-clash-layer')?.dataset.phase==='result'")
                self.assertIn('special card',overlay.locator('.triad-clash-cue').inner_text())
                self.assertNotIn('longer beat',overlay.locator('.triad-clash-cue').inner_text())
                self.assertEqual(overlay.locator('.triad-clash-result').inner_text(),
                                 'CAPTURE!' if expected=='attacker' else 'DEFENDER HOLDS')
                self.settle(frame)
                self.assertEqual(frame.locator('#board .card.you').count(),16 if expected=='attacker' else 15)

    def test_full_cards_keep_board_directions_and_facing_notes_for_capture_hold_and_tie(self):
        for direction, winner in [(-3,'attacker'),(1,'defender'),(3,'tie'),(-1,'attacker')]:
            with self.subTest(direction=direction,winner=winner):
                frame = self.load_game()
                position = self.position(frame)
                frame.evaluate('''({direction,winner})=>{
                  const defender=4+direction;
                  for(let index=0;index<board.length;index++)if(board[index]){
                    board[index].owner=index===defender?1:0;
                    board[index].e=Array(4).fill(winner==='defender'?'wn':'sn');
                  }
                  hands[0][0].e=Array(4).fill(winner==='attacker'?'wn':'sn');
                  codaTriadReset();render();
                }''', {'direction':direction,'winner':winner})
                self.last_move(frame, position)
                overlay = frame.locator('.notation-clash-layer')
                overlay.wait_for(state='visible')
                self.assertEqual(overlay.get_attribute('data-direction'), str(direction))
                self.assertEqual(overlay.get_attribute('data-result'), winner)
                self.assertEqual(overlay.locator('.triad-clash-card .card .edge').count(), 8)
                self.assertEqual(overlay.locator('.clash-facing-edge svg').count(), 2)
                axes = overlay.evaluate('''node=>{
                  const actor=kind=>{const s=node.querySelector('.'+kind).style;
                    return [parseFloat(s.getPropertyValue('--start-x')),parseFloat(s.getPropertyValue('--start-y'))];};
                  return {attacker:actor('attacker'),defender:actor('defender')};
                }''')
                axis = 1 if abs(direction) > 1 else 0
                delta = axes['defender'][axis] - axes['attacker'][axis]
                self.assertGreater(delta * direction, 0, 'Comparison preserves the original board direction')
                self.assertEqual(overlay.locator('.has-lost').count(), 0 if winner=='tie' else 1)
                self.settle(frame)

    def test_reading_and_outcome_fit_phone_portrait_landscape_and_desktop(self):
        for viewport in [{'width':1440,'height':1000},{'width':390,'height':844},{'width':844,'height':390}]:
            with self.subTest(viewport=viewport):
                frame = self.load_game(phone=viewport['width']<1000)
                self.page.set_viewport_size(viewport)
                position = self.position(frame)
                frame.evaluate("""()=>{
                  for(let i=0;i<board.length;i++)if(board[i])board[i].owner=i===1?1:0;
                  codaTriadReset();render();
                }""")
                self.last_move(frame, position)
                overlay = frame.locator('.notation-clash-layer')
                overlay.wait_for(state='visible')
                panel = overlay.locator('.triad-clash-panel')
                bounds = panel.bounding_box()
                self.assertGreaterEqual(bounds['y'],0)
                self.assertLessEqual(bounds['y']+bounds['height'],viewport['height']+1)
                for edge in overlay.locator('.clash-facing-edge').all():
                    box=edge.bounding_box()
                    self.assertGreaterEqual(box['y'],bounds['y']-1)
                    self.assertLessEqual(box['y']+box['height'],bounds['y']+bounds['height']+1)
                if viewport['width']==390:self.page.screenshot(path='/tmp/triad46-reading-phone.png')
                frame.wait_for_function("document.querySelector('.notation-clash-layer')?.dataset.phase==='result'")
                for selector in ['.triad-clash-math','.triad-clash-result']:
                    box=overlay.locator(selector).bounding_box()
                    self.assertGreaterEqual(box['y'],bounds['y']-1)
                    self.assertLessEqual(box['y']+box['height'],bounds['y']+bounds['height']+1)
                if viewport['width']==1440:self.page.screenshot(path='/tmp/triad46-outcome-desktop.png')
                if viewport['width']==844:self.page.screenshot(path='/tmp/triad46-outcome-landscape.png')
                self.settle(frame)

    def test_reduced_motion_still_finishes_correctly_with_one_end_cue(self):
        self.page.emulate_media(reduced_motion='reduce')
        frame = self.load_game()
        position = self.position(frame)
        self.last_move(frame, position)
        overlay = frame.locator('.notation-clash-layer')
        overlay.wait_for(state='visible')
        self.assertEqual(overlay.get_attribute('data-phase'), 'reading')
        frame.wait_for_timeout(1450)
        self.assertEqual(overlay.get_attribute('data-phase'), 'reading')
        self.assertEqual(overlay.locator('.clash-facing-edge svg').count(), 2)
        self.assertEqual(overlay.locator('.triad-clash-card').first.evaluate(
            'node=>getComputedStyle(node).animationName'), 'none')
        self.assertEqual(frame.evaluate('window.__cues'), [])
        self.settle(frame)
        self.assertEqual(frame.locator('#board .card.you').count(), 7)
        cues = frame.evaluate('window.__cues')
        self.assertEqual(len(cues), 1)
        self.assertGreaterEqual(cues[0]['time'] - frame.evaluate('window.__lastMoveStarted'), 10000,
                                'Reduced motion retains reading time while removing movement')

    def test_new_game_and_home_cancel_pending_simple_and_advanced_turns(self):
        for advanced in [False, True]:
            for action in ['new', 'home']:
                with self.subTest(advanced=advanced,action=action):
                    frame = self.load_game(advanced=advanced)
                    position = self.position(frame)
                    self.last_move(frame, position)
                    frame.locator('.notation-clash-layer').wait_for(state='visible')
                    if action == 'new':
                        frame.evaluate('starter=0')
                        frame.locator('#new').click()
                        frame.locator('#exitConfirmYes').click()
                        frame.wait_for_function('board.every(card=>!card)')
                    else:
                        self.home(frame)
                    self.assertEqual(frame.locator('.notation-clash-layer:visible').count(), 0)
                    self.assertFalse(frame.evaluate('window.MusicTriadAnimationQA.state().pending'))
                    snapshot = frame.evaluate('JSON.stringify({board,hands,turn})')
                    frame.wait_for_timeout(4100)
                    self.assertEqual(frame.evaluate('JSON.stringify({board,hands,turn})'), snapshot)
                    self.assertEqual(frame.evaluate('window.__cues'), [])
                    self.assertEqual(frame.locator('.notation-clash-layer:visible').count(), 0)
                    self.assertFalse(frame.evaluate('window.MusicTriadAnimationQA.state().pending'))
                    self.assertFalse(frame.evaluate('window.codaTriadState?.done||false'))

    def test_actual_web_audio_mix_uses_bounded_voices_and_exclusive_end_cue(self):
        self.install_audio_probe()
        frame = self.load_game(advanced=True)
        frame.wait_for_function('MusicTriadAudioQA.snapshot().activeMusicVoices>0')
        frame.wait_for_timeout(350)
        audio = frame.evaluate('MusicTriadAudioQA.snapshot()')
        self.assertEqual(audio['contextState'], 'running')
        self.assertAlmostEqual(audio['loopDuration'], 64 * 4 * 60 / 122, places=8)
        self.assertAlmostEqual(audio['loopOrigin'], 1.9672, places=4)
        self.assertEqual(audio['cyclesScheduled'], 1)
        self.assertLess(audio['activeMusicVoices'], 80)
        probe = frame.evaluate('''()=>({
          types:__audioProbe.sources.filter(node=>node.codaTriadGroup==='music').map(node=>node.type),
          peaks:__audioProbe.ramps.filter(item=>item.parameter.__probeOwner?.codaTriadGroup==='music').map(item=>item.value),
          pad:MusicTriadAudio.voiceProfile(3,127,'music'),
          melody:MusicTriadAudio.voiceProfile(0,127,'music')
        })''')
        self.assertTrue(probe['types'], 'The native audio graph contains music sources')
        self.assertNotIn('square', probe['types'])
        self.assertTrue(probe['peaks'])
        self.assertLess(max(probe['peaks']), .05)
        self.assertLess(probe['pad']['peak'], probe['melody']['peak'])
        position = self.position(frame)
        self.last_move(frame, position)
        frame.wait_for_function('MusicTriadAnimationQA.state().pending')
        self.assertEqual(frame.evaluate('MusicTriadAudioQA.snapshot().cueStarts'), 0)
        self.settle(frame)
        ended = frame.evaluate('MusicTriadAudioQA.snapshot()')
        self.assertEqual(ended['cueStarts'], 1)
        self.assertEqual(ended['mode'], 'cue')
        self.assertEqual(ended['activeMusicVoices'], 0)
        self.assertEqual(ended['activeEffectVoices'], 0)
        self.assertGreater(ended['activeCueVoices'], 0)
        frame.evaluate('render();render()')
        self.assertEqual(frame.evaluate('MusicTriadAudioQA.snapshot().cueStarts'), 1)
        frame.locator('#musicToggle').click()
        off = frame.evaluate('MusicTriadAudioQA.snapshot()')
        self.assertEqual(off['mode'], 'idle')
        for key in ['activeMusicVoices','activeCueVoices','activeEffectVoices']:
            self.assertEqual(off[key], 0)
        frame.locator('#musicToggle').click()
        frame.wait_for_function('MusicTriadAudioQA.snapshot().activeMusicVoices>0')
        self.home(frame)
        stopped = frame.evaluate('MusicTriadAudioQA.snapshot()')
        self.assertEqual(stopped['mode'], 'idle')
        self.assertEqual(stopped['activeMusicVoices'] + stopped['activeCueVoices'] + stopped['activeEffectVoices'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
