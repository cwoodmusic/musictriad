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

    def test_svg_capture_comparison_stays_quick_and_end_cue_waits_for_final_board_on_desktop_and_phone(self):
        for phone, advanced in [(False,False),(True,False),(False,True),(True,True)]:
            with self.subTest(phone=phone,advanced=advanced):
                frame = self.load_game(advanced=advanced, phone=phone)
                position = self.position(frame)
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
                self.assertLess(cues[0]['time'] - frame.evaluate('window.__lastMoveStarted'), 3000)

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

    def test_reduced_motion_still_finishes_correctly_with_one_end_cue(self):
        self.page.emulate_media(reduced_motion='reduce')
        frame = self.load_game()
        position = self.position(frame)
        self.last_move(frame, position)
        self.settle(frame)
        self.assertEqual(frame.locator('#board .card.you').count(), 7)
        cues = frame.evaluate('window.__cues')
        self.assertEqual(len(cues), 1)
        self.assertLess(cues[0]['time'] - frame.evaluate('window.__lastMoveStarted'), 1200)

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
                    snapshot = frame.evaluate('JSON.stringify({board,hands,turn})')
                    frame.wait_for_timeout(2200)
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
