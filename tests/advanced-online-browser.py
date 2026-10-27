"""Advanced online play across independent clients and a shared Firebase double.

Only the SDK is replaced. Real page controls, rules, atomic transactions,
subscriptions, animations and tournament progression run production code.
No real account, profile or database is contacted.
"""
import copy
import sys
import unittest

sys.dont_write_bytecode=True
from triad_browser_support import TriadBrowserCase, TRIAD, ORIGIN


SDK=r'''(()=>{
 const copy=value=>value==null?null:JSON.parse(JSON.stringify(value));
 const state=window.__online={reads:[],writes:[],listeners:[],disconnects:[],persistence:[],signins:0};
 const callbacks=new Map(),versions=new Map();let polling=false;
 function defined(value,path='data'){
   if(value===undefined)throw Error('Firebase rejects undefined at '+path);
   if(typeof value==='number'&&!Number.isFinite(value))throw Error('Firebase rejects nonfinite numbers at '+path);
   if(value&&typeof value==='object')for(const [key,item]of Object.entries(value))defined(item,path+'/'+key);
 }
 function snapshot(value){return {val:()=>copy(value),exists:()=>value!==null&&value!==undefined,
   child:path=>{let child=value;for(const key of path.split('/').filter(Boolean))child=child?.[key];return snapshot(child);}};}
 async function request(value){return window.__triadBackend({...value,uid:window.__fixtureUid});}
 function accept(path,value){const key=JSON.stringify(value);if(versions.get(path)===key)return;
   versions.set(path,key);for(const callback of callbacks.get(path)||[])callback(snapshot(value));}
 async function poll(){if(polling||!callbacks.size)return;polling=true;
   try{const paths=[...callbacks.keys()],values=await request({op:'readMany',paths});
     paths.forEach((path,index)=>{if(callbacks.has(path))accept(path,values[index]);});
   }catch{}finally{polling=false;}}
 setInterval(poll,20);
 function ref(path){path=path.replace(/^\/+|\/+$/g,'');return {key:path.split('/').at(-1),child:child=>ref(path+'/'+child),
   once:async()=>{state.reads.push(path);return snapshot(await request({op:'read',path}));},
   set:async value=>{defined(value);state.writes.push({path,value:copy(value)});await request({op:'write',path,value});await poll();},
   update:async value=>{defined(value);state.writes.push({path,value:copy(value)});await request({op:'update',path,value});await poll();},
   remove:async()=>{state.writes.push({path,value:null});await request({op:'write',path,value:null});await poll();},
   transaction:async updater=>{for(let attempt=0;attempt<30;attempt++){
     const before=await request({op:'read',path}),value=updater(copy(before));
     if(value===undefined)return {committed:false,snapshot:snapshot(before)};
     defined(value);
     const answer=await request({op:'compareAndSet',path,before,value});
     if(answer.committed){state.writes.push({path,value:copy(value)});await poll();
       return {committed:true,snapshot:snapshot(answer.value)};}
   }throw Error('The shared test transaction did not settle.');},
   on:(_,handler)=>{state.listeners.push(path);if(!callbacks.has(path))callbacks.set(path,new Set());
     callbacks.get(path).add(handler);versions.delete(path);void poll();return handler;},
   off:()=>{callbacks.delete(path);versions.delete(path);},
   onDisconnect:()=>({set:async value=>state.disconnects.push({path,value})})};}
 const database=()=>({ref});database.ServerValue={TIMESTAMP:123456};
 const auth={currentUser:null,setPersistence:async value=>state.persistence.push(value),
   signInAnonymously:async()=>{state.signins++;auth.currentUser={uid:window.__fixtureUid};return {user:auth.currentUser};}};
 const authFactory=()=>auth;authFactory.Auth={Persistence:{NONE:'none',LOCAL:'local'}};
 window.firebase={apps:[],initializeApp(config){this.apps.push({config});},auth:authFactory,database};
})()'''


class SharedDatabase:
    def __init__(self):
        self.data={}
        self.writes=[]

    def read(self,path):
        value=self.data
        for key in path.strip('/').split('/'):
            if not key:continue
            if isinstance(value,list):
                try:value=value[int(key)]
                except (ValueError,IndexError):return None
            elif isinstance(value,dict):value=value.get(key)
            else:return None
        return copy.deepcopy(value)

    def write(self,path,value):
        def wire(item):
            if isinstance(item,dict):
                result={key:child for key,raw in item.items() if (child:=wire(raw)) is not None}
                return result or None
            if isinstance(item,list):
                result=[wire(child) for child in item]
                while result and result[-1] is None:result.pop()
                return result or None
            return item
        value=wire(value)
        parts=[part for part in path.split('/') if part]
        target=self.data
        for key in parts[:-1]:
            if isinstance(target,list):
                index=int(key)
                while len(target)<=index:target.append(None)
                if not isinstance(target[index],(dict,list)):target[index]={}
                target=target[index]
            else:
                if not isinstance(target.get(key),(dict,list)):target[key]={}
                target=target[key]
        if isinstance(target,list):
            index=int(parts[-1])
            while len(target)<=index:target.append(None)
            target[index]=copy.deepcopy(value)
        elif value is None:target.pop(parts[-1],None)
        else:target[parts[-1]]=copy.deepcopy(value)

    def call(self,_source,request):
        op=request['op']
        if op=='readMany':return [self.read(path) for path in request['paths']]
        path=request['path']
        if op=='read':return self.read(path)
        if op=='compareAndSet':
            if self.read(path)!=request.get('before'):return {'committed':False}
            self.write(path,request.get('value'))
            self.writes.append(copy.deepcopy(request))
            return {'committed':True,'value':self.read(path)}
        if op=='write':self.write(path,request.get('value'))
        elif op=='update':
            for key,value in request['value'].items():self.write(path+'/'+key,value)
        else:raise AssertionError('Unsupported isolated Firebase operation: '+op)
        self.writes.append(copy.deepcopy(request))
        return None


def regular(owner,rhythm='sn'):
    return {'owner':owner,'e':[rhythm]*4,'art':[None]*4,'meter':'4/4'}


class AdvancedOnlineTests(TriadBrowserCase):
    def setUp(self):
        super().setUp()
        self.db=SharedDatabase();self.extra_contexts=[];self.clients=[]
        self.configure(self.context,self.page,'host')

    def tearDown(self):
        for context in self.extra_contexts:context.close()
        super().tearDown()

    def configure(self,context,page,identity):
        context.expose_binding('__triadBackend',self.db.call)
        context.add_init_script('window.__fixtureUid='+repr('isolated-'+identity))
        context.route('https://www.gstatic.com/firebasejs/**',lambda route:route.fulfill(
          status=200,content_type='text/javascript',body=SDK if 'firebase-app-compat.js' in route.request.url else ''))
        page.emulate_media(reduced_motion='reduce')
        self.clients.append(page)
        return page

    def new_client(self,identity):
        context=self.browser.new_context(viewport={'width':1440,'height':1000})
        self.extra_contexts.append(context)
        context.route('https://**/*',lambda route:route.abort())
        context.route(ORIGIN+'/**',self.route_checkout)
        page=context.new_page();page.set_default_timeout(20000)
        page.on('pageerror',lambda error:self.errors.append(str(error)))
        return self.configure(context,page,identity)

    def load(self,page,advanced=False):
        page.goto(TRIAD+'?classroom=1',wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('#homeModeToggle').dataset.ready==='1'")
        if page.locator('#homeModeToggle').is_checked()!=advanced:page.locator('label.mode-toggle').click()
        self.assertFalse(page.evaluate('Boolean(window.firebase)'),'Browsing an online panel must remain local')

    def pair(self,advanced=True,join_advanced=False):
        host=self.page;guest=self.new_client('guest')
        self.load(host,advanced);self.load(guest,join_advanced)
        host.locator('#vsClassmate').click();host.locator('#createRoom').click()
        host.wait_for_function("!document.querySelector('#createdRoom').hidden")
        code=host.locator('#roomCode').inner_text()
        guest.locator('#vsClassmate').click();guest.locator('#showJoin').click()
        guest.locator('#joinCode').fill(code);guest.locator('#joinNow').click()
        size=16 if advanced else 9
        for page in [host,guest]:
            page.wait_for_function('size=>document.querySelector("#startScreen").classList.contains("hidden")&&board.length===size',arg=size)
            page.wait_for_function('!busy')
            self.assertEqual(page.locator('#board .slot').count(),size)
            self.assertEqual(page.evaluate('musicTriadAdvancedSelected()'),advanced)
            self.assertEqual(page.evaluate('__online.persistence'),['none'])
        return host,guest,code

    def seed_game(self,code,board,hands,turn=0,**extra):
        game=self.db.read('rooms/'+code+'/game')
        game.update({'board':[card if card else {'empty':True} for card in board],
          'hands':hands,'turn':turn,'moves':game.get('moves',0)+1,'finished':False,'lastMove':None,**extra})
        self.db.write('rooms/'+code+'/game',game)
        for page in self.clients:
            if page.evaluate('mpRoom')!=code:continue
            page.wait_for_function('expected=>JSON.stringify(board.map(card=>card?.owner??null))===JSON.stringify(expected)',
              arg=[card['owner'] if card else None for card in board])
            page.evaluate('cancelTriadAnimations();selected=null;busy=false;endSoundPlayed=false;render()')
        return game

    def move(self,page,index,hand_index=0):
        page.wait_for_function('!busy')
        page.locator('#hand .pick').nth(hand_index).click()
        page.locator('#board .slot').nth(index).click()

    def equal_state(self,pages):
        values=[page.evaluate('JSON.stringify({board,hands,turn})') for page in pages]
        self.assertTrue(all(value==values[0] for value in values),values)

    def test_advanced_room_inherits_rules_and_real_moves_capture_for_both_seats(self):
        host,guest,code=self.pair()
        room=self.db.read('rooms/'+code)
        self.assertEqual(room['rules'],'advanced')
        self.assertEqual(len(room['game']['board']),16)
        self.assertTrue(all(guest.locator('#hand .pick').nth(i).is_disabled() for i in range(guest.locator('#hand .pick').count())))
        board=[None]*16;board[1]=regular(1)
        before=self.seed_game(code,board,[[regular(0,'wn')],[regular(1)]])
        self.move(host,0)
        for page in [host,guest]:
            page.wait_for_function('board[0]?.owner===0&&board[1]?.owner===0&&turn===1&&!busy')
        after=self.db.read('rooms/'+code+'/game')
        self.assertEqual(after['moves'],before['moves']+1)
        self.assertEqual(after['board'][1]['owner'],0)
        self.equal_state([host,guest])
        unchanged=copy.deepcopy(after)
        host.locator('#board .slot').nth(2).dispatch_event('click')
        host.wait_for_timeout(100)
        self.assertEqual(self.db.read('rooms/'+code+'/game'),unchanged,'A nonactive seat cannot move')
        self.move(guest,2)
        for page in [host,guest]:page.wait_for_function('board[2]?.owner===1&&turn===0&&!busy')
        self.equal_state([host,guest])

    def test_advanced_actions_clear_cards_and_ties_redeal_once_before_a_real_winner(self):
        host,guest,code=self.pair()
        board=[None]*16
        for index in [0,1,4,5,6,9,15]:board[index]=regular(index%2)
        action={'owner':1,'special':'tacet'}
        before=self.seed_game(code,board,[[regular(0)],[action]],turn=1)
        self.move(guest,5)
        for page in [host,guest]:page.wait_for_function('!board[1]&&!board[4]&&!board[5]&&!board[6]&&!board[9]&&turn===0&&!busy')
        self.equal_state([host,guest])
        self.assertEqual(self.db.read('rooms/'+code+'/game/moves'),before['moves']+1)
        original_members={key:self.db.read('rooms/'+code+'/'+key) for key in ['p1','p2']}
        tied=[regular(0 if index<7 else 1) if index<15 else None for index in range(16)]
        original_round=self.db.read('rooms/'+code+'/game').get('round',1)
        self.seed_game(code,tied,[[regular(0)],[regular(1)]],round=original_round)
        self.move(host,15)
        for page in [host,guest]:page.wait_for_function('board.length===16&&board.every(card=>!card)&&hands[0].length===5&&hands[1].length===5&&!busy',timeout=30000)
        redealt=self.db.read('rooms/'+code+'/game')
        self.assertEqual(redealt['round'],original_round+1)
        self.assertEqual(redealt['turn'],original_round%2,'Tied rounds alternate the starting seat')
        self.assertFalse(redealt['finished'])
        self.assertEqual({key:self.db.read('rooms/'+code+'/'+key) for key in original_members},original_members)
        self.equal_state([host,guest])
        winning=[regular(0 if index<8 else 1) if index<15 else None for index in range(16)]
        self.seed_game(code,winning,[[regular(0)],[regular(1)]],round=redealt['round'])
        self.move(host,15)
        for page in [host,guest]:page.wait_for_function('board.every(Boolean)&&endSoundPlayed',timeout=30000)
        result=self.db.read('rooms/'+code+'/game')
        self.assertTrue(result['finished'])
        self.assertEqual(sum(card.get('owner')==0 for card in result['board']),9)
        self.assertIn('You win',host.locator('#status').inner_text())
        self.assertIn('Classmate wins',guest.locator('#status').inner_text())
        self.equal_state([host,guest])

    def test_simple_room_still_uses_nine_cells_when_advanced_client_joins(self):
        host,guest,code=self.pair(advanced=False,join_advanced=True)
        self.assertIn(self.db.read('rooms/'+code).get('rules','simple'),['simple'])
        self.assertEqual(len(self.db.read('rooms/'+code+'/game/board')),9)
        self.assertFalse(guest.evaluate('musicTriadAdvancedSelected()'))

    def test_advanced_wire_rules_keep_all_specials_meter_values_and_input_immutable(self):
        self.load(self.page,advanced=True)
        results=self.page.evaluate('''()=>{
          const api=musicTriadAdvancedOnline,checks=[];
          const card=(owner,rhythm='qn',meter='4/4')=>({owner,e:Array(4).fill(rhythm),meter});
          const make=(played,items={})=>({rules:'advanced',board:Array.from({length:16},(_,i)=>items[i]||{empty:true}),
            hands:[[played],[card(1)]],turn:0,moves:0,round:1,finished:false});
          const globalBefore=JSON.stringify({board,hands,turn,selected});
          function run(name,input,index,verify){
            const before=JSON.stringify(input),answer=api.move(input,0,0,index);
            if(!answer||!verify(answer))throw Error(name+' did not apply its musical rule');
            if(JSON.stringify(input)!==before)throw Error(name+' mutated its wire input');
            if(JSON.stringify({board,hands,turn,selected})!==globalBefore)throw Error(name+' mutated another live game');
            checks.push(name);
          }
          const neighbors={1:card(1),4:card(1,'hr'),6:card(1,'er'),9:card(1,'wn'),15:card(1)};
          run('multi-measure rest',make({owner:0,special:'mmrest'},neighbors),5,
            value=>value.board[4].owner===0&&value.board[6].owner===0&&value.board[1].owner===1&&value.board[9].owner===1);
          run('quarter-note fermata',make({owner:0,special:'qfermata'},neighbors),5,
            value=>value.board[1].owner===0&&value.board[9].owner===0&&value.board[4].owner===1&&value.board[6].owner===1);
          run('conductor',make({owner:0,special:'conductor'},neighbors),5,
            value=>[1,4,6,9].every(i=>value.board[i].owner===0)&&value.board[15].owner===1);
          const rowColumn={1:card(1),4:card(0),6:card(1),7:card(0),9:card(1),13:card(0),15:card(1)};
          run('turn ornament',make({owner:0,special:'mordent'},rowColumn),5,
            value=>[1,4,6,7,9,13].every(i=>value.board[i].owner===1-rowColumn[i].owner)&&value.board[15].owner===1);
          run('subito',make({owner:0,special:'subito'},neighbors),1,
            value=>value.board[1].empty&&value.board[4].owner===1&&value.lastMove.kind==='subito');
          run('tacet edge without row wrap',make({owner:0,special:'tacet'},{2:card(1),3:card(1),4:card(1),7:card(1),15:card(1)}),3,
            value=>[2,3,7].every(i=>value.board[i].empty)&&value.board[4].owner===1&&value.board[15].owner===1);
          run('cut time equal-value defense',make(card(0,'hn','2/2'),{1:card(1)}),0,
            value=>value.board[1].owner===1);
          const compound=card(0,'qn','6/8');compound.art=['staccato','legato',null,'staccato'];
          run('compound meter and articulation metadata',make(compound,{1:card(1)}),0,
            value=>value.board[1].owner===0&&JSON.stringify(value.board[0].art)===JSON.stringify(compound.art)&&
              value.lastMove.card.meter==='6/8');
          run('notes do not capture rests',make(card(0,'wn'),{1:card(1,'er')}),0,
            value=>value.board[1].owner===1);
          const wrongTurn=make(card(0));wrongTurn.turn=1;
          const occupied=make(card(0),{5:card(1)});
          const invalid=[api.move(wrongTurn,0,0,5),api.move(occupied,0,0,5),
            api.move(make({owner:0,special:'subito'}),0,0,5),api.move(make(card(0)),0,99,5),
            api.move(make(card(0)),0,0,16)];
          if(invalid.some(value=>value!==undefined))throw Error('An illegal or out-of-turn move was accepted');
          const injection='<img src=x onerror="window.__unsafeCard=true">';
          const unsafe=card(1);unsafe.meter=injection;unsafe.art=[injection,'staccato','constructor','legato'];
          const clean=cardFromWire(unsafe);
          if(clean.meter!==undefined||JSON.stringify(clean.art)!==JSON.stringify([null,'staccato',null,'legato']))
            throw Error('Untrusted meter or articulation reached the card painter');
          if(cardEl(clean).innerHTML.includes(injection))throw Error('Card markup was not restricted to known notation');
          if(cardFromWire({...unsafe,e:[injection,'qn','qn','qn']})!==null||
             cardFromWire({...unsafe,e:['constructor','qn','qn','qn']})!==null||
             cardFromWire({owner:1,special:injection})!==null)throw Error('An untrusted notation symbol was accepted');
          return checks;
        }''')
        self.assertEqual(len(results),9)

    def test_four_player_advanced_tournament_inherits_rules_and_advances_to_champion(self):
        teacher=self.page;self.load(teacher,advanced=True)
        teacher.locator('#tournamentMode').click();teacher.locator('#createTournament').click()
        teacher.wait_for_function("!document.querySelector('#createdTournament').hidden")
        self.assertTrue(teacher.locator('#homeModeToggle').is_disabled())
        code=teacher.locator('#tournamentCode').inner_text();players={}
        for number in range(4):
            page=self.new_client('tournament-'+str(number));self.load(page,advanced=False)
            page.locator('#tournamentMode').click();page.locator('#showTournamentJoin').click()
            page.locator('#tournamentJoinCode').fill(code);page.locator('#joinTournamentNow').click()
            page.wait_for_function("!document.querySelector('#studentTournamentStatus').hidden")
            self.assertTrue(page.locator('#homeModeToggle').is_disabled())
            players[page.locator('#assignedColor').text_content().strip()]=page
        self.assertEqual(self.db.read('tournaments/'+code+'/rules'),'advanced')
        self.assertEqual(len(players),4)
        teacher.wait_for_function('!document.querySelector("#startTournament").disabled')
        teacher.locator('#startTournament').click()
        teacher.wait_for_function('document.querySelectorAll(".tourney-match").length>=2')
        bracket=self.db.read('tournaments/'+code+'/bracket')
        for match in bracket['round1']:
            self.finish_tournament_match(code,match,players)
        teacher.wait_for_function('document.querySelector("#tournamentBracket").textContent.includes("CHAMPIONSHIP")')
        final=self.db.read('tournaments/'+code+'/bracket/final')
        self.finish_tournament_match(code,final,players)
        teacher.wait_for_function('!document.querySelector("#championSplash").hidden')
        champion=self.db.read('tournaments/'+code+'/bracket/champion')
        self.assertIn(champion,players)
        self.assertEqual(self.db.read('tournaments/'+code+'/status'),'finished')
        self.assertEqual(teacher.locator('#championName').inner_text(),champion.upper())
        for write in self.db.writes:
            self.assertIn(write['path'].split('/')[0],['rooms','lobbies','tournaments'])

    def finish_tournament_match(self,tournament,match,players):
        first,second=players[match['a']],players[match['b']]
        for page in [first,second]:
            page.wait_for_function('!document.querySelector("#playTournamentMatch").disabled')
            page.locator('#playTournamentMatch').click()
        for page in [first,second]:
            page.wait_for_function('isMp()&&board.length===16&&document.querySelector("#startScreen").classList.contains("hidden")')
            self.assertTrue(page.evaluate('musicTriadAdvancedSelected()'))
        code=first.evaluate('mpRoom')
        self.assertEqual(second.evaluate('mpRoom'),code)
        self.assertEqual(self.db.read('rooms/'+code+'/rules'),'advanced')
        board=[regular(0 if index<8 else 1) if index<15 else None for index in range(16)]
        self.seed_game(code,board,[[regular(0)],[regular(1)]])
        self.move(first,15)
        for page in [first,second]:
            page.wait_for_function('document.querySelector("#startScreen").classList.contains("hidden")===false',timeout=30000)
        record=self.db.read('tournaments/'+tournament+'/bracket')
        completed=record.get('final') if match.get('round')=='final' else None
        if not completed:
            completed=next((item for item in record['round1'] if item.get('roomCode')==code),record.get('final'))
        self.assertEqual(completed['winner'],match['a'])


if __name__=='__main__':unittest.main(verbosity=2)
