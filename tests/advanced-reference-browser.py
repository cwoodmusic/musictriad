"""Check the read-only guide against the live engine, keyboard and phone sizes."""
import unittest
from pathlib import Path
from triad_browser_support import TriadBrowserCase, TRIAD

ROOT = Path(__file__).resolve().parents[1]


class AdvancedReferenceBrowser(TriadBrowserCase):
    def load(self):
        self.page.goto(TRIAD, wait_until='domcontentloaded')
        self.page.wait_for_function('document.querySelector("#homeModeToggle")?.dataset.ready')
        if not self.page.evaluate('!!window.CodaAdvancedReference'):
            self.page.add_style_tag(path=str(ROOT / 'advanced-reference.css'))
            self.page.add_script_tag(path=str(ROOT / 'advanced-reference.js'))
        self.page.wait_for_function('window.CodaAdvancedReference?.getState().available')

    def guide(self):
        return self.page.locator('#cheatModal')

    def test_defaults_mode_switch_keyboard_and_real_game_isolation(self):
        self.load()
        trigger = self.page.locator('#startScreen [data-open="cheatModal"]')
        trigger.click()
        self.assertEqual(self.page.evaluate('CodaAdvancedReference.getState().mode'), 'simple')
        self.assertFalse(self.guide().get_by_role('tab', name='Card meters').count())
        self.guide().get_by_role('button', name='Advanced guide', exact=True).click()
        self.assertFalse(self.page.evaluate('musicTriadAdvancedSelected()'))
        self.assertEqual(self.guide().get_by_role('tab').count(), 5)
        self.guide().get_by_role('tab', name='Special cards').click()
        self.assertEqual(self.guide().locator('[data-special]').count(), 6)
        self.assertEqual(self.guide().locator('.triad-ref-target.occupied').count(), 2)
        self.assertIn('whole row and whole column', self.guide().inner_text())
        self.guide().get_by_role('tab', name='Examples').click()
        self.assertEqual(self.guide().locator('[data-example]').count(), 7)
        self.assertGreater(self.guide().locator('[data-example="meter-tie"] svg').count(), 5)
        self.assertIn('2 × ½ = 1', self.guide().locator('[data-example="meter-tie"]').inner_text())
        self.page.keyboard.press('Escape')
        self.assertFalse(self.guide().is_visible())
        self.assertTrue(trigger.evaluate('(el)=>document.activeElement===el'))
        self.page.locator('label.mode-toggle').click()
        self.assertTrue(self.page.evaluate('musicTriadAdvancedSelected()'))
        trigger.click()
        self.assertEqual(self.page.evaluate('CodaAdvancedReference.getState().mode'), 'advanced')
        self.guide().get_by_role('tab', name='How to play').click()
        self.page.keyboard.press('End')
        self.assertEqual(self.page.evaluate('CodaAdvancedReference.getState().section'), 'examples')
        self.page.keyboard.press('Home')
        self.assertEqual(self.page.evaluate('CodaAdvancedReference.getState().section'), 'how')
        self.page.keyboard.press('ArrowRight')
        self.assertEqual(self.page.evaluate('CodaAdvancedReference.getState().section'), 'values')
        self.assertFalse(self.guide().locator('.triad-ref-glyph-label').count())
        self.assertGreater(self.guide().locator('.triad-ref-dot svg, svg.triad-ref-dot').count(), 3)
        self.page.keyboard.press('Escape')
        self.page.locator('#startScreen [data-open="rulesModal"]').click()
        self.assertTrue(self.guide().is_visible())
        self.assertFalse(self.page.locator('#rulesModal').is_visible())
        self.assertEqual(self.page.evaluate('CodaAdvancedReference.getState().section'), 'how')
        self.page.keyboard.press('Tab')
        self.assertTrue(self.guide().get_by_role('button', name='Close card guide').evaluate('(el)=>document.activeElement===el'))
        self.page.keyboard.press('Shift+Tab')
        self.assertTrue(self.guide().evaluate('(el)=>el.contains(document.activeElement)'))

    def test_layout_svg_and_touch_targets_at_phone_and_landscape_sizes(self):
        self.load()
        for width, height in [(390,844),(844,390),(1440,1000)]:
            self.page.set_viewport_size({'width':width,'height':height})
            self.page.evaluate('CodaAdvancedReference.open({mode:"advanced"})')
            for section in ['how','values','meters','specials','examples']:
                self.page.evaluate('(section)=>CodaAdvancedReference.selectSection(section)', section)
                dimensions = self.guide().evaluate('''modal=>{
                  const shell=modal.querySelector('.triad-ref-shell'), body=modal.querySelector('.triad-ref-body');
                  const rect=shell.getBoundingClientRect();
                  return {width:innerWidth,left:rect.left,right:rect.right,bottom:rect.bottom,
                    bodyWidth:body.clientWidth,scrollWidth:body.scrollWidth,
                    controls:[...modal.querySelectorAll('button')].filter(x=>x.getClientRects().length)
                      .map(x=>({label:x.textContent,height:x.getBoundingClientRect().height})),
                    glyphFallbacks:body.querySelectorAll('.triad-ref-glyph-label').length};
                }''')
                self.assertGreaterEqual(dimensions['left'], 0)
                self.assertLessEqual(dimensions['right'], width)
                self.assertLessEqual(dimensions['bottom'], height)
                self.assertLessEqual(dimensions['scrollWidth'], dimensions['bodyWidth']+1, (width, section, dimensions))
                self.assertEqual(dimensions['glyphFallbacks'], 0)
                self.assertTrue(all(control['height']>=44 for control in dimensions['controls']), dimensions)
            if width == 390:
                self.page.screenshot(path='/tmp/musictriad-reference-phone.png')
            self.page.evaluate('CodaAdvancedReference.close()')


if __name__ == '__main__':
    unittest.main()
