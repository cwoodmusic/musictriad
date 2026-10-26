"""Classroom multiplayer through real controls and an isolated Firebase double.

No Firebase account or deployed database is contacted. SDK requests are fulfilled
locally, and only the existing lobby/room/tournament paths are exercised.
"""
import sys
import unittest
from urllib.parse import urlparse

sys.dont_write_bytecode=True
from triad_browser_support import TriadBrowserCase, TRIAD, ORIGIN


SDK=r'''(()=>{
 const copy=value=>value==null?null:JSON.parse(JSON.stringify(value));
 const state=window.__online={data:copy(window.__onlineSeed)||{},reads:[],writes:[],listeners:[],disconnects:[],persistence:[],signins:0};
 const callbacks=new Map();
 const parts=path=>path.split('/').filter(Boolean);
 function read(path){let value=state.data;for(const key of parts(path))value=value?.[key];return copy(value);}
 function snap(value){return {val:()=>copy(value),exists:()=>value!==null&&value!==undefined,
   child:path=>{let child=value;for(const key of parts(path))child=child?.[key];return snap(child);}};}
 function notify(path){for(const [key,handlers]of callbacks)if(path===key||path.startsWith(key+'/'))
   for(const handler of handlers)handler(snap(read(key)));}
 function write(path,value){let target=state.data;const keys=parts(path),last=keys.pop();
   for(const key of keys)target=target[key]??={};target[last]=copy(value);notify(path);}
 function ref(path){return {key:parts(path).at(-1),child:child=>ref(path+'/'+child),
   once:async()=>{state.reads.push(path);return snap(read(path));},
   set:async value=>{state.writes.push({path,value:copy(value)});write(path,value);},
   update:async value=>{for(const [key,item]of Object.entries(value)){
     state.writes.push({path:path+'/'+key,value:copy(item)});write(path+'/'+key,item);}},
   transaction:async updater=>{const value=updater(read(path));if(value===undefined)return {committed:false,snapshot:snap(read(path))};
     state.writes.push({path,value:copy(value)});write(path,value);return {committed:true,snapshot:snap(value)};},
   on:(_,handler)=>{state.listeners.push(path);if(!callbacks.has(path))callbacks.set(path,new Set());
     callbacks.get(path).add(handler);handler(snap(read(path)));},
   off:()=>callbacks.delete(path),
   onDisconnect:()=>({set:async value=>state.disconnects.push({path,value})})};}
 const database=()=>({ref});database.ServerValue={TIMESTAMP:123456};
 const auth={currentUser:null,setPersistence:async value=>state.persistence.push(value),
   signInAnonymously:async()=>{state.signins++;if(window.__holdAuth){
     await new Promise(resolve=>window.__finishAuth=resolve);}auth.currentUser={uid:'anonymous-fixture'};
     return {user:auth.currentUser};}};
 const authFactory=()=>auth;authFactory.Auth={Persistence:{NONE:'none',LOCAL:'local'}};
 window.firebase={apps:[],initializeApp(config){this.apps.push({config});},auth:authFactory,database};
})()'''


class ClassroomMultiplayerTests(TriadBrowserCase):
    def setUp(self):
        super().setUp()
        self.requests=[];self.sdk=[]
        self.page.on('request',lambda request:self.requests.append(request.url))
        self.context.route('https://www.gstatic.com/firebasejs/**',self.route_sdk)

    def route_sdk(self,route):
        self.sdk.append(route.request.url)
        return route.fulfill(status=200,content_type='text/javascript',
            body=SDK if 'firebase-app-compat.js' in route.request.url else '')

    def load(self):
        self.page.goto(TRIAD+'?classroom=1',wait_until='domcontentloaded')
        self.page.wait_for_function("window.CodaBridge&&document.querySelector('#homeModeToggle').dataset.ready==='1'")

    def assert_no_cloud(self):
        self.assertEqual(self.sdk,[])
        self.assertFalse(self.page.evaluate('Boolean(window.firebase)'))
        self.assertFalse(any('googleapis' in url or 'firebaseio' in url for url in self.requests))

    def assert_private_connection(self):
        self.assertEqual(len(self.sdk),3)
        stats=self.page.evaluate('__online')
        self.assertEqual(stats['persistence'],['none'])
        self.assertEqual(stats['signins'],1)
        for path in stats['reads']+stats['listeners']+[entry['path'] for entry in stats['writes']]:
            self.assertIn(path.split('/')[0],['lobbies','rooms','tournaments'])

    def test_simple_multiplayer_panels_are_available_without_loading_cloud_services(self):
        self.load()
        self.assertTrue(self.page.evaluate('CodaGamePrivacy.enabled'))
        for button,panel in [('#vsClassmate','#mpPanel'),('#tournamentMode','#tourneyPanel')]:
            self.assertTrue(self.page.locator(button).is_visible())
            self.assertFalse(self.page.locator(button).is_disabled())
            self.page.locator(button).click()
            self.assertTrue(self.page.locator(panel).is_visible())
            self.assert_no_cloud()
        self.page.locator('label.mode-toggle').click()
        for selector in ['#vsClassmate','#tournamentMode']:
            self.assertTrue(self.page.locator(selector).is_disabled())
        self.start(self.page.main_frame,advanced=True)
        self.assertEqual(self.page.locator('#board .slot').count(),16)
        self.assert_no_cloud()

    def test_create_classmate_game_connects_only_after_create_with_memory_only_auth(self):
        self.load();self.page.locator('#vsClassmate').click();self.assert_no_cloud()
        self.page.locator('#createRoom').click()
        self.page.wait_for_function("!document.querySelector('#createdRoom').hidden")
        code=self.page.locator('#roomCode').inner_text()
        self.assertEqual(len(code),4)
        self.assert_private_connection()
        self.assertEqual(self.page.evaluate('__online.data.lobbies['+repr(code)+']'),'anonymous-fixture')
        self.assertEqual(self.page.evaluate('__online.data.rooms['+repr(code)+'].p1'),'anonymous-fixture')
        self.assertEqual(self.page.evaluate('({mode:gameMode,seat:mpSeat,room:mpRoom})'),
            {'mode':'classmate','seat':0,'room':code})

    def test_join_classmate_game_claims_second_seat_and_rejects_an_occupied_game(self):
        self.load();self.page.locator('#vsClassmate').click()
        self.page.evaluate("window.__onlineSeed={lobbies:{ABCD:'host'},rooms:{ABCD:{p1:'host'}}}")
        self.page.locator('#showJoin').click();self.page.locator('#joinCode').fill('ABCD')
        self.assert_no_cloud()
        self.page.locator('#joinNow').click()
        self.page.wait_for_function("mpRoom==='ABCD'&&mpSeat===1&&__online.data.rooms.ABCD.p2Online===true")
        self.assertEqual(self.page.evaluate('__online.data.rooms.ABCD.p2'),'anonymous-fixture')
        self.assert_private_connection()
        self.page.evaluate("goHomeScreen();__online.data.lobbies.EFGH='host';__online.data.rooms.EFGH={p1:'host',p2:'other'}")
        self.page.locator('#vsClassmate').click();self.page.locator('#showJoin').click()
        self.page.locator('#joinCode').fill('EFGH');self.page.locator('#joinNow').click()
        self.page.wait_for_function("document.querySelector('#mpError').textContent.includes('already has two players')")
        self.assertEqual(self.page.evaluate('__online.data.rooms.EFGH.p2'),'other')

    def test_tournament_create_and_join_use_existing_paths_without_profile_data(self):
        self.load();self.page.locator('#tournamentMode').click();self.assert_no_cloud()
        self.page.locator('#createTournament').click()
        self.page.wait_for_function("!document.querySelector('#createdTournament').hidden")
        code=self.page.locator('#tournamentCode').inner_text()
        self.assertEqual(len(code),5);self.assert_private_connection()
        record=self.page.evaluate('__online.data.tournaments['+repr(code)+']')
        self.assertEqual(set(record),{'host','status','created','players'})
        self.page.evaluate("goHomeScreen();__online.data.tournaments.ABCDE={host:'host',status:'waiting',players:{Red:'other'}}")
        self.page.locator('#tournamentMode').click();self.page.locator('#showTournamentJoin').click()
        self.page.locator('#tournamentJoinCode').fill('ABCDE');self.page.locator('#joinTournamentNow').click()
        self.page.wait_for_function("!document.querySelector('#studentTournamentStatus').hidden")
        self.assertEqual(self.page.locator('#assignedColor').text_content(),'Blue')
        self.assertEqual(self.page.evaluate('__online.data.tournaments.ABCDE.players.Blue'),'anonymous-fixture')
        self.assertEqual(len(self.sdk),3,'Opening another online mode reuses the SDK')

    def test_cancelled_create_during_auth_never_creates_a_room_or_replaces_solo(self):
        self.load();self.page.evaluate('window.__holdAuth=true')
        self.page.locator('#vsClassmate').click();self.page.locator('#createRoom').click()
        self.page.wait_for_function('typeof window.__finishAuth===\'function\'')
        self.page.evaluate('goHomeScreen();starter=0')
        self.page.locator('#vsComputer').click()
        before=self.page.evaluate('JSON.stringify({board,hands,turn})')
        self.page.evaluate('__finishAuth()')
        self.page.wait_for_function('Boolean(firebase.auth().currentUser)')
        self.page.wait_for_timeout(100)
        self.assertEqual(self.page.evaluate('__online.reads'),[])
        self.assertEqual(self.page.evaluate('__online.writes'),[])
        self.assertEqual(self.page.evaluate('gameMode'),'computer')
        self.assertEqual(self.page.evaluate('JSON.stringify({board,hands,turn})'),before)
        self.assertFalse(self.page.locator('#startScreen').is_visible())


if __name__=='__main__':unittest.main(verbosity=2)
