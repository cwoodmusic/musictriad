"""Tournament boundaries, safe rendering, and abandoned-session regressions.

Production UI and timers run in an isolated browser. Firebase-shaped references
are local test doubles; these checks never load SDKs, sign in, or write a server.
"""
import unittest
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.dont_write_bytecode=True
from triad_browser_support import TriadBrowserCase, TRIAD


class AuditTests(TriadBrowserCase):
    def route_checkout(self, route):
        if urlparse(route.request.url).path == '/musictriad/':
            html=(Path(__file__).resolve().parents[1]/'index.html').read_text()
            # Expose only the end-of-lesson transition, without rewriting its
            # timers or callbacks, so a completed lesson can be arranged quickly.
            html=html.replace(' function finishTutorial(){', ' window.__auditFinishTutorial=finishTutorial;\n function finishTutorial(){')
            html=html.replace('function setup(i){n=i;done=false;', 'window.__auditFinishAdvanced=()=>{n=L.length-1;done=true;N.click()};function setup(i){n=i;done=false;')
            return route.fulfill(status=200, content_type='text/html',body=html)
        return super().route_checkout(route)

    def load(self,classroom=True):
        self.page.goto(TRIAD+('?classroom=1' if classroom else ''),wait_until='domcontentloaded')
        self.page.wait_for_function("window.CodaBridge&&window.MusicTriadAnimationQA&&document.querySelector('#homeModeToggle').dataset.ready==='1'")

    def test_tournament_brackets_render_names_as_text_in_every_round(self):
        self.load()
        text='<img src=x onerror="window.__badTournament=true">'
        self.page.evaluate('''text=>{
          window.__badTournament=false;
          renderTournamentBracket({round1:[{a:text,b:text,winner:text}],
            final:{a:text,b:text,winner:text},champion:text});
        }''', text)
        self.assertEqual(self.page.locator('#tournamentBracket img').count(),0)
        self.assertEqual(self.page.locator('#tournamentBracket script').count(),0)
        self.assertFalse(self.page.evaluate('window.__badTournament'))
        self.assertEqual(self.page.locator('#tournamentBracket .tourney-match').count(),3)
        self.assertIn(text,self.page.locator('#tournamentBracket').inner_text())

    def test_supported_tournament_sizes_start_and_oversized_lobbies_stop_before_writing(self):
        self.load()
        for count in (2,3,4,5,16):
            with self.subTest(count=count):
                result=self.page.evaluate('''async count=>{
                  const players=Object.fromEntries(TOURNAMENT_COLORS.slice(0,count).map((color,i)=>[color,'p'+i])),writes=[];
                  mpUid='host';tournamentIsHost=true;window.firebase={database:{ServerValue:{TIMESTAMP:123}}};
                  tournamentRef={once:async()=>({val:()=>({host:'host',status:'waiting',players})}),update:async value=>writes.push(value)};
                  await startTournamentBracket();
                  renderTournamentRoster(players,'tournamentRoster');
                  return {writes,error:document.querySelector('#tournamentError').textContent,
                    disabled:document.querySelector('#startTournament').disabled};
                }''', count)
                if count<=4:
                    self.assertEqual(len(result['writes']),1,result)
                    bracket=result['writes'][0]['bracket']
                    self.assertEqual(len(bracket['round1']),(count+1)//2)
                    self.assertEqual(sorted(bracket['order']),sorted(['Red','Blue','Orange','Green'][:count]))
                    self.assertFalse(result['disabled'])
                else:
                    self.assertEqual(result['writes'],[])
                    self.assertIn('2–4 players',result['error'])
                    self.assertTrue(result['disabled'])

    def test_full_tournament_cannot_claim_a_fifth_color_slot(self):
        self.load()
        result=self.page.evaluate('''async()=>{
          window.initFirebase=async()=>{};mpUid='new-player';
          const claims=[],players={Red:'p1',Blue:'p2',Orange:'p3',Green:'p4'};
          mpDb={ref:()=>({once:async()=>({exists:()=>true,val:()=>({status:'waiting'}),child:()=>({val:()=>players})}),
            child:path=>({transaction:async()=>{claims.push(path);return{committed:false,snapshot:{val:()=>null}};}})})};
          document.querySelector('#tournamentJoinCode').value='ABCDE';
          await joinTournamentLobby();
          return {claims,error:document.querySelector('#tournamentError').textContent};
        }''')
        self.assertEqual(result['claims'],[])
        self.assertIn('4 players maximum',result['error'])

    def test_home_detaches_online_sessions_and_late_snapshots_cannot_replace_a_computer_match(self):
        self.load();self.start(self.page.main_frame)
        self.page.evaluate('''()=>{
          window.__roomOff=0;window.__tournamentOff=0;
          mpRef={on:(_,callback)=>window.__lateRoom=callback,off:()=>__roomOff++};
          mpRoom='ABCD';mpSeat=0;gameMode='classmate';listenRoom();
          const ref={on:(_,callback)=>window.__lateTournament=callback,off:()=>__tournamentOff++};
          listenTournament(ref);tournamentGameContext=null;setTournamentControls();
          scheduleTournamentReturn();
        }''')
        self.page.locator('#homeBtn').click();self.page.locator('#exitConfirmYes').click()
        self.page.evaluate('starter=0')
        self.page.locator('#vsComputer').click()
        before=self.page.evaluate('JSON.stringify({board,hands,turn})')
        self.page.evaluate('''()=>{
          __lateRoom({val:()=>({p2:'p2',game:{board:Array(9).fill({owner:1,e:['sn','sn','sn','sn']}),
            hands:[[],[]],turn:1,finished:true}})});
          __lateTournament({val:()=>({players:{Red:'p1'},bracket:{champion:'Red',round1:[]}})});
        }''')
        self.page.wait_for_timeout(1400)
        self.assertEqual(self.page.evaluate('JSON.stringify({board,hands,turn})'),before)
        self.assertFalse(self.page.locator('#startScreen').is_visible())
        self.assertFalse(self.page.locator('#tourneyPanel').is_visible())
        self.assertTrue(self.page.locator('#championSplash').is_hidden())
        self.assertEqual(self.page.evaluate('({room:mpRef,tournament:tournamentRef,context:tournamentGameContext})'),
                         {'room':None,'tournament':None,'context':None})
        self.assertEqual(self.page.evaluate('[__roomOff,__tournamentOff]'),[1,1])
        self.assertNotIn('tournament-locked',self.page.locator('#new').get_attribute('class') or '')

    def test_completed_tutorial_return_cannot_end_a_new_computer_match(self):
        self.load()
        for advanced in (False,True):
            with self.subTest(advanced=advanced):
                self.page.evaluate('goHomeScreen()')
                if self.page.locator('#homeModeToggle').is_checked()!=advanced:
                    self.page.locator('label.mode-toggle').click()
                self.page.locator('#tutorialMode').click()
                self.page.evaluate('__auditFinishAdvanced()' if advanced else '__auditFinishTutorial()')
                self.page.evaluate('goHomeScreen();starter=0')
                self.page.locator('#vsComputer').click()
                before=self.page.evaluate('JSON.stringify({board,hands,turn})')
                self.page.wait_for_timeout(2400)
                self.assertFalse(self.page.locator('#startScreen').is_visible())
                self.assertEqual(self.page.evaluate('JSON.stringify({board,hands,turn})'),before)
                self.assertFalse(self.page.locator('#tutorialToast').is_visible())
                self.assertFalse(self.page.locator('#advTutorialToast').is_visible())

    def test_abandoned_online_start_cannot_resume_after_a_new_computer_match(self):
        self.load()
        for operation in ('createClassmateRoom','joinClassmateRoom','createTournamentLobby','joinTournamentLobby','playTournamentMatch'):
            with self.subTest(operation=operation):
                self.page.evaluate('''operation=>{
                  goHomeScreen();starter=0;window.__databaseCalls=0;
                  window.initFirebase=()=>new Promise(resolve=>window.__finishInit=resolve);
                  mpDb={ref:()=>{__databaseCalls++;throw Error('A canceled start reached the database');}};
                  window.__pendingOnline=window[operation]();
                }''',operation)
                self.page.locator('#vsComputer').click()
                before=self.page.evaluate('JSON.stringify({board,hands,turn})')
                self.page.evaluate('async()=>{__finishInit();await __pendingOnline;}')
                self.assertEqual(self.page.evaluate('__databaseCalls'),0)
                self.assertEqual(self.page.evaluate('JSON.stringify({board,hands,turn})'),before)
                self.assertEqual(self.page.evaluate('gameMode'),'computer')
                self.assertFalse(self.page.locator('#startScreen').is_visible())

    def test_late_tournament_result_never_writes_into_a_replacement_tournament(self):
        self.load()
        self.page.evaluate('''()=>{
          window.__oldUpdates=[];window.__newUpdates=[];
          const match={child:()=>({transaction:()=>new Promise(resolve=>window.__finishClaim=resolve)}),
            update:async value=>__oldUpdates.push(value)};
          tournamentRef={child:()=>match,off:()=>{},update:async value=>__oldUpdates.push(value)};
          mpRoom='OLD1';tournamentGameContext={round:'final',index:0,a:'Red',b:'Blue'};
          board=Array.from({length:9},(_,index)=>({owner:index<5?0:1,e:Array(4).fill('qn')}));
          window.__pendingResult=reportTournamentResult([5,4]);
          goHomeScreen();
          tournamentRef={off:()=>{},update:async value=>__newUpdates.push(value)};
          mpRoom='NEW1';tournamentGameContext={round:'round1',index:0,a:'Green',b:'Orange'};
        }''')
        self.page.evaluate('''async()=>{
          __finishClaim({committed:true,snapshot:{val:()=>'Red'}});await __pendingResult;
        }''')
        self.assertEqual(self.page.evaluate('__newUpdates'),[])
        self.assertEqual(self.page.evaluate('__oldUpdates'),[])
        self.assertEqual(self.page.evaluate('tournamentReportedRoom'),'')
        self.assertEqual(self.page.evaluate('mpRoom'),'NEW1')

    def test_a_current_tournament_result_finishes_its_match_and_returns_to_its_lobby(self):
        self.load(classroom=False);self.start(self.page.main_frame)
        self.page.evaluate('''async()=>{
          cancelTriadAnimations();window.__matchUpdates=[];window.__tournamentUpdates=[];
          const match={child:()=>({transaction:async updater=>({committed:true,snapshot:{val:()=>updater(null)}})}),
            update:async value=>__matchUpdates.push(value)};
          tournamentRef={child:()=>match,off:()=>{},update:async value=>__tournamentUpdates.push(value)};
          tournamentColor='Red';mpRoom='ABCD';mpSeat=0;gameMode='classmate';
          tournamentGameContext={round:'final',index:0,a:'Red',b:'Blue'};
          board=Array.from({length:9},(_,index)=>({owner:index<5?0:1,e:Array(4).fill('qn')}));
          await reportTournamentResult([5,4]);
        }''')
        self.assertEqual(self.page.evaluate('__matchUpdates'),[{'status':'complete','score0':5,'score1':4}])
        self.assertEqual(self.page.evaluate('__tournamentUpdates'),[{'bracket/champion':'Red','status':'finished'}])
        self.page.wait_for_function('tournamentGameContext===null&&mpRoom===null')
        self.assertTrue(self.page.locator('#startScreen').is_visible())
        self.assertTrue(self.page.locator('#tourneyPanel').is_visible())
        self.assertTrue(self.page.evaluate('tournamentRef!==null'))

    def test_stored_match_fields_cannot_redirect_the_local_round_address(self):
        self.load()
        result=self.page.evaluate('''()=>{
          tournamentColor='Red';
          const round1=findMyTournamentMatch({bracket:{round1:[{a:'Red',b:'Blue',round:'final',index:'other/path'}]}});
          const final=findMyTournamentMatch({bracket:{final:{a:'Red',b:'Blue',round:'round1',index:99}}});
          return [round1,final].map(match=>({round:match.round,index:match.index}));
        }''')
        self.assertEqual(result,[{'round':'round1','index':0},{'round':'final','index':0}])

    def test_private_classroom_solo_stays_offline_with_online_modes_available(self):
        requests=[]
        self.page.on('request',lambda request:requests.append(request.url))
        self.load()
        self.assertTrue(self.page.evaluate('CodaGamePrivacy.enabled'))
        self.assertFalse(self.page.locator('#vsClassmate').is_disabled())
        self.assertFalse(self.page.locator('#tournamentMode').is_disabled())
        self.assertFalse(any('firebase' in url or 'googleapis' in url for url in requests))
        self.start(self.page.main_frame)
        self.assertEqual(self.page.locator('#board .slot').count(),9)


if __name__=='__main__':unittest.main(verbosity=2)
