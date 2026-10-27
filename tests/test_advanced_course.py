"""The Advanced course must teach real moves and leave normal play intact."""
from triad_browser_support import TriadBrowserCase, TRIAD


class AdvancedCourseTests(TriadBrowserCase):
    def course(self, lesson=0):
        self.page.goto(TRIAD, wait_until='domcontentloaded')
        self.page.wait_for_function('window.CodaAdvancedTutorial')
        self.page.evaluate('(index)=>CodaAdvancedTutorial.start(index)', lesson)

    def state(self):
        return self.page.evaluate('CodaAdvancedTutorial.getState()')

    def test_every_lesson_uses_the_real_board_and_starts_a_clean_match(self):
        self.course()
        self.page.evaluate('''()=>{
          window.__courseRewardCalls=0;
          const original=window.codaTriadObserve;
          window.codaTriadObserve=(...args)=>{
            window.__courseRewardCalls++;
            return original?.(...args);
          };
        }''')
        lessons = self.page.evaluate('CodaAdvancedTutorial.lessons.map(item=>({id:item.id,quiz:!!item.answers,target:item.target,expect:item.expect}))')
        self.assertEqual(len(lessons), 20)
        for number, item in enumerate(lessons):
            with self.subTest(lesson=item['id']):
                self.assertEqual(self.state()['index'], number)
                self.assertEqual(self.state()['phase'], 'look')
                self.page.locator('#advTutNext').click()
                if item['quiz']:
                    self.page.locator('#advTutChoices button').first.click()
                else:
                    self.page.locator('#hand .pick').first.click()
                    self.page.locator('#board .slot').nth(item['target']).click()
                    self.page.wait_for_function('CodaAdvancedTutorial.getState().phase==="feedback"', timeout=30000)
                    owners = self.page.evaluate('board.map(card=>card?card.owner:null)')
                    for position, owner in item['expect'].items():
                        self.assertEqual(owners[int(position)], owner)
                self.assertEqual(self.state()['phase'], 'feedback')
                self.assertIn(item['id'], self.state()['completed'])
                self.assertEqual(self.page.evaluate('window.__courseRewardCalls'), 0)
                self.page.locator('#advTutNext').click()
        self.assertFalse(self.state()['active'])
        self.assertTrue(self.page.evaluate('musicTriadAdvancedSelected()'))
        self.assertEqual(self.page.locator('#board .slot').count(), 16)
        self.assertEqual(self.page.locator('#hand .pick').count(), 5)
        self.assertEqual(self.page.locator('#advTutorialDialogue').count(), 0)
        self.assertFalse(self.page.locator('#startScreen').is_visible())

    def test_wrong_moves_explain_the_target_without_playing_it(self):
        self.course(1)
        self.page.locator('#advTutNext').click()
        before = self.page.evaluate('JSON.stringify(board)')
        self.page.locator('#board .slot').nth(5).click()
        self.assertIn('First choose', self.page.locator('#advTutFeedback').inner_text())
        self.page.locator('#hand .pick').nth(1).click()
        self.assertIn('glowing practice card', self.page.locator('#advTutFeedback').inner_text())
        self.page.locator('#hand .pick').first.click()
        self.page.locator('#board .slot').nth(7).click()
        self.assertIn('glowing empty square', self.page.locator('#advTutFeedback').inner_text())
        self.assertEqual(self.page.evaluate('JSON.stringify(board)'), before)
        self.assertEqual(self.state()['phase'], 'try')
        self.page.locator('#advTutReplay').click()
        self.assertEqual(self.state()['phase'], 'look')
        self.page.locator('#advTutLesson').select_option('9')
        self.page.locator('#advTutNext').click()
        self.page.locator('#advTutChoices button').nth(1).click()
        self.assertEqual(self.state()['phase'], 'try')
        self.assertIn('do not draw cards', self.page.locator('#advTutFeedback').inner_text())

    def test_replay_and_home_cancel_a_special_without_late_feedback(self):
        self.course(15)
        self.page.locator('#advTutNext').click()
        self.page.locator('#hand .pick').first.click()
        self.page.locator('#board .slot').nth(5).click()
        self.assertEqual(self.state()['phase'], 'busy')
        self.page.locator('#advTutReplay').click()
        self.assertEqual(self.state()['phase'], 'look')
        self.assertEqual(self.page.locator('.adv-fx-overlay').count(), 0)
        self.page.locator('#advTutNext').click()
        self.page.locator('#hand .pick').first.click()
        self.page.locator('#board .slot').nth(5).click()
        self.page.locator('#advTutExit').click()
        self.assertTrue(self.page.locator('#startScreen').is_visible())
        self.assertFalse(self.state()['active'])
        self.assertEqual(self.page.locator('.adv-fx-overlay,.adv-tut-target,.adv-tut-card').count(), 0)
        self.assertTrue(self.page.evaluate('musicTriadAdvancedSelected()'))
        self.page.locator('#vsComputer').click()
        self.assertEqual(self.page.locator('#hand .pick').count(), 5)
        self.assertEqual(self.page.locator('#board .slot').count(), 16)

    def test_small_screens_keyboard_exit_resume_and_simple_tutorial(self):
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.course(7)
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 390)
        self.page.locator('#advTutNext').click()
        # The lesson focuses the real card, then the real board target.
        self.page.keyboard.press('Enter')
        self.assertTrue(self.state()['chosen'])
        self.assertEqual(self.page.evaluate('document.activeElement.getAttribute("aria-label")'), 'Row 2, column 2. Practice target')
        self.page.keyboard.press('Escape')
        self.assertTrue(self.page.locator('#startScreen').is_visible())
        self.page.locator('#tutorialMode').click()
        self.assertEqual(self.state()['index'], 7)
        self.page.locator('[data-open="cheatModal"]').last.click()
        self.page.keyboard.press('Escape')
        self.assertTrue(self.state()['active'])
        self.assertFalse(self.page.locator('#cheatModal').is_visible())
        for width, height in [(844, 390), (390, 844)]:
            self.page.set_viewport_size({'width': width, 'height': height})
            self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), width)
            self.assertGreaterEqual(self.page.locator('#advTutExit').bounding_box()['height'], 44)
            self.assertGreaterEqual(self.page.locator('#advTutBack').bounding_box()['height'], 44)
            sides = self.page.evaluate('''()=>{
              const card=document.querySelector('#board .card');
              return Object.fromEntries(['t','r','b','l'].map(side=>
                [side,card.querySelector('.edge.'+side).getBoundingClientRect().toJSON()]));
            }''')
            self.assertLessEqual(sides['t']['bottom'], sides['b']['top'])
            self.assertLessEqual(sides['l']['right'], sides['r']['left'])
        self.page.locator('#advTutExit').click()
        self.page.locator('label.mode-toggle').click()
        self.page.locator('#tutorialMode').click()
        self.assertTrue(self.page.evaluate('document.body.classList.contains("tutorial-active")'))
        self.assertFalse(self.state()['active'])


if __name__ == '__main__':
    import unittest
    unittest.main()
