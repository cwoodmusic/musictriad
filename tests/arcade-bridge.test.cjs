const test=require('node:test');
const assert=require('node:assert/strict');
const {createResultTracker,createMessageBridge,ORIGINS}=require('../arcade-bridge.js');

const board=(size,owners=[])=>Array.from({length:size},(_,index)=>owners[index]===0||owners[index]===1?{owner:owners[index]}:null);
function tracker(initial={}){
 const settings={visible:true,tutorial:false,rules:'simple',difficulty:'Normal',...initial},reports=[];let serial=0;
 const value=createResultTracker({id:()=>`match-${++serial}`,getSettings:()=>settings,report:(id,result)=>reports.push({id,result})});
 return{value,settings,reports};
}

test('completed decisive simple and advanced matches retain the real board score',()=>{
 for(const rules of ['simple','advanced'])for(const difficulty of ['Easy','Normal','Hard']){
  const size=rules==='advanced'?16:9;
  for(const own of [3,Math.floor(size/2)+1,size]){
   const env=tracker({rules,difficulty});
   env.value.observe(board(size,[0,1]),0,false,true);
   const owners=Array.from({length:size},(_,i)=>i<own?0:1);
   const result=env.value.observe(board(size,owners),0,true,true);
   assert.equal(result.mode,'computer');assert.equal(result.rules,rules);assert.equal(result.difficulty,difficulty.toLowerCase());
   assert.equal(result.score,own);assert.equal(result.won,own>size-own);assert.equal(env.reports.length,1);
   assert.equal(env.value.observe(board(size,owners),0,true,true),null);assert.equal(env.reports.length,1);
  }
 }
});

test('repeated tied Advanced rounds retain one match and report only its eventual winner',()=>{
 const env=tracker({rules:'advanced',difficulty:'Hard'}),first=env.value.getState().id;
 env.value.observe(board(16,[1,1,0]),0,false,true);
 env.value.observe(board(16,[0,1,0,0]),0,false,true);
 const tie=board(16,[0,1,...Array(7).fill(0),...Array(7).fill(1)]);
 for(let round=0;round<3;round++){
  assert.equal(env.value.observe(tie,0,true,true),null);
  assert.equal(env.value.observe(tie,0,true,true),null,'A settled tie may render more than once');
  const tied=env.value.getState();assert.equal(tied.id,first);assert.equal(tied.done,false);
  assert.equal(tied.captures,1);assert.equal(tied.trailed,true);assert.equal(tied.observedActive,true);
  assert.equal(env.reports.length,0,'Tied rounds do not produce a loss, payout, XP, or achievement event');
  env.value.observe(board(16),0,false,true);
  const cleared=env.value.getState();assert.equal(cleared.id,first);assert.equal(cleared.captures,1);
  assert.equal(cleared.trailed,true);assert.equal(cleared.difficulty,'hard');assert.equal(cleared.previous.every(card=>card===null),true);
  env.value.observe(board(16,[0,1]),0,false,true);
 }
 const result=env.value.observe(board(16,[...Array(10).fill(0),...Array(6).fill(1)]),0,true,true);
 assert.deepEqual(result,{mode:'computer',rules:'advanced',difficulty:'hard',won:true,captures:2,comeback:true,score:10});
 assert.equal(env.reports.length,1);assert.equal(env.reports[0].id,first);assert.equal(env.value.getState().done,true);
 env.value.observe(board(16),0,false,true);env.value.observe(board(16,Array(16).fill(0)),0,true,true);
 assert.equal(env.reports.length,1,'The completed match reports only once');
 env.value.reset();assert.notEqual(env.value.getState().id,first);assert.equal(env.value.getState().captures,0);
});

test('Advanced tie continuations preserve captures and the lowest difficulty used on any board',()=>{
 const env=tracker({rules:'advanced',difficulty:'Hard'});env.value.observe(board(16,[1,0]),0,false,true);
 env.value.observe(board(16,[0,0]),0,false,true);
 const tie=board(16,[...Array(8).fill(0),...Array(8).fill(1)]);
 assert.equal(env.value.observe(tie,0,true,true),null);
 env.settings.difficulty='Normal';assert.equal(env.value.useDifficulty('Normal'),true);env.settings.difficulty='Hard';
 env.value.observe(board(16),0,false,true);env.value.observe(board(16,[1,0]),0,false,true);
 env.value.observe(board(16,[0,0]),0,false,true);assert.equal(env.value.observe(tie,0,true,true),null);
 env.settings.difficulty='Easy';assert.equal(env.value.useDifficulty('Easy'),true);env.settings.difficulty='Hard';
 env.value.observe(board(16),0,false,true);env.value.observe(board(16,[0,1]),0,false,true);
 const result=env.value.observe(board(16,[...Array(10).fill(0),...Array(6).fill(1)]),0,true,true);
 assert.equal(result.difficulty,'easy');assert.equal(result.captures,3);assert.equal(env.reports.length,1);
});

test('Advanced multiplayer ties keep the same local seat and finish without a computer difficulty',()=>{
 const env=tracker({rules:'advanced',difficulty:'Hard'});env.value.observe(board(16,[0,1]),1,false,false);
 const first=env.value.getState().id,tie=board(16,[...Array(8).fill(0),...Array(8).fill(1)]);
 assert.equal(env.value.observe(tie,1,true,false),null);env.value.observe(board(16),1,false,false);
 env.value.observe(board(16,[0,1]),1,false,false);
 const result=env.value.observe(board(16,[...Array(6).fill(0),...Array(10).fill(1)]),1,true,false);
 assert.equal(result.mode,'multiplayer');assert.equal(result.won,true);assert.equal(result.score,10);
 assert.equal(Object.hasOwn(result,'difficulty'),false);assert.equal(env.reports[0].id,first);
});

test('simple completion behavior is unchanged and tied tutorial boards never start a reward run',()=>{
 const simple=tracker();simple.value.observe(board(9,[0,1]),0,false,true);
 const result=simple.value.observe(board(9,[...Array(4).fill(0),...Array(4).fill(1)]),0,true,true);
 assert.equal(result.won,false);assert.equal(result.score,4);assert.equal(simple.value.getState().done,true);assert.equal(simple.reports.length,1);
 const tutorial=tracker({rules:'advanced',tutorial:true});tutorial.value.observe(board(16,[0,1]),0,false,true);
 tutorial.value.observe(board(16,[...Array(8).fill(0),...Array(8).fill(1)]),0,true,true);
 assert.equal(tutorial.reports.length,0);assert.equal(tutorial.value.getState().started,false);
 tutorial.settings.tutorial=false;
 assert.equal(tutorial.value.observe(board(16,Array(16).fill(0)),0,true,true),null);
 assert.equal(tutorial.reports.length,0,'Leaving a tutorial cannot claim its finished snapshot');
});

test('a real capture and trailing position produce a comeback exactly once',()=>{
 const env=tracker({difficulty:'Hard'});
 env.value.observe(board(9,[1,1,0]),0,false,true);
 env.value.observe(board(9,[0,1,0,0]),0,false,true);
 env.value.observe(board(9,[0,1,0,0]),0,false,true);
 const result=env.value.observe(board(9,[0,1,0,0,0,0,1,1,1]),0,true,true);
 assert.equal(result.captures,1);assert.equal(result.comeback,true);assert.equal(result.won,true);
 assert.equal(env.reports.length,1);
});

test('difficulty can be chosen before playing but easier moves never become Hard rewards',()=>{
 const env=tracker({difficulty:'Normal'});
 env.value.observe(board(16),0,false,true);
 env.settings.rules='advanced';env.settings.difficulty='Hard';
 env.value.observe(board(16,[0]),0,false,true);
 assert.equal(env.value.getState().difficulty,'hard');
 env.settings.difficulty='Normal';env.value.useDifficulty('Normal');env.settings.difficulty='Hard';
 const result=env.value.observe(board(16,[...Array(10).fill(0),...Array(6).fill(1)]),0,true,true);
 assert.equal(result.difficulty,'normal');
 const queued=tracker({rules:'advanced',difficulty:'Normal'});
 queued.value.useDifficulty('Normal');queued.settings.difficulty='Hard';
 queued.value.observe(board(16,[1]),0,false,true);
 assert.equal(queued.value.getState().difficulty,'normal','The first AI move uses its chosen difficulty, not a later dropdown upgrade');
 queued.value.useDifficulty('Easy');queued.settings.difficulty='Hard';
 const lower=queued.value.observe(board(16,[...Array(10).fill(0),...Array(6).fill(1)]),0,true,true);
 assert.equal(lower.difficulty,'easy');
});

test('Home, tutorials and a finished multiplayer snapshot cannot earn a result',()=>{
 const env=tracker({visible:false,rules:'advanced',difficulty:'Hard'});
 env.value.observe(board(16,[0,1]),0,false,true);
 env.settings.visible=true;
 assert.equal(env.value.observe(board(16,Array(16).fill(0)),0,true,true),null);
 assert.equal(env.reports.length,0);
 env.value.reset();env.settings.tutorial=true;
 env.value.useDifficulty('Easy');env.value.observe(board(16,[1]),0,false,true);
 env.value.observe(board(16,Array(16).fill(0)),0,true,true);
 assert.equal(env.reports.length,0);assert.equal(env.value.getState().usedDifficulty,null);
 const mp=tracker();mp.value.observe(board(9),1,false,false);
 assert.equal(mp.value.observe(board(9,[0,0,0,0,1,1,1,1,1]),1,true,false),null);
 assert.equal(mp.reports.length,0);
 // A transient full-board render while the last animation settles also
 // cannot turn an unseen completed match into an observed active match.
 assert.equal(mp.value.observe(board(9,[0,0,0,0,1,1,1,1,1]),1,false,false),null);
 assert.equal(mp.value.getState().observedActive,false);
});

test('Advanced clear-all actions keep the match id, captures and difficulty',()=>{
 const env=tracker({rules:'advanced',difficulty:'Hard'});
 env.value.observe(board(16,[1,0]),0,false,true);
 env.value.observe(board(16,[0,0]),0,false,true);
 const before=env.value.getState();env.value.observe(board(16),0,false,true);
 assert.equal(env.value.getState().id,before.id);assert.equal(env.value.getState().captures,1);
 env.value.observe(board(16,[0]),0,false,true);
 const result=env.value.observe(board(16,[...Array(9).fill(0),...Array(7).fill(1)]),0,true,true);
 assert.equal(result.captures,1);assert.equal(result.difficulty,'hard');assert.equal(env.reports[0].id,before.id);
});

test('simple multiplayer remote resets start a new match and keep the local seat perspective',()=>{
 const env=tracker({difficulty:'Hard'});
 env.value.observe(board(9,[0,1]),1,false,false);const first=env.value.getState().id;
 env.value.observe(board(9),1,false,false);assert.notEqual(env.value.getState().id,first);
 env.value.observe(board(9,[0,1]),1,false,false);
 const result=env.value.observe(board(9,[1,1,1,1,1,0,0,0,0]),1,true,false);
 assert.equal(result.mode,'multiplayer');assert.equal(result.rules,'simple');assert.equal(result.score,5);assert.equal(result.won,true);
 assert.equal(Object.hasOwn(result,'difficulty'),false,'Classmate matches must not inherit a hidden computer difficulty');
});

test('a changed game mode or malformed board cannot contaminate match metadata',()=>{
 const env=tracker({rules:'advanced',difficulty:'Hard'});
 env.value.observe(board(16,[0,1]),0,false,true);const before=env.value.getState();
 assert.equal(env.value.observe([{owner:2}],0,false,true),null);assert.deepEqual(env.value.getState(),before);
 assert.equal(env.value.observe(board(16),7,false,true),null);
 env.settings.rules='simple';env.value.observe(board(16,[0,1,0]),0,false,true);env.settings.rules='advanced';
 assert.equal(env.value.observe(board(16,Array(16).fill(0)),0,true,true),null);assert.equal(env.reports.length,0);
 env.value.reset();env.value.observe(board(16,[0,1]),0,false,true);
 env.value.observe(board(16,Array(16).fill(0)),0,true,true);assert.equal(env.reports.length,1);
});

function windowFixture(standalone=false){
 const messages=[],listeners=new Map(),parent={postMessage:(data,origin)=>messages.push({data,origin})};
 const win={parent,crypto:{randomUUID:()=> 'unique-match'},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 if(standalone)win.parent=win;
 return{win,parent,messages,receive:event=>listeners.get('message')?.(event),listeners};
}

test('tied Advanced boards never queue a bridge event or consume the eventual result id',()=>{
 const env=windowFixture(),bridge=createMessageBridge(env.win);
 const value=createResultTracker({id:bridge.id,getSettings:()=>({rules:'advanced',difficulty:'Hard'}),report:bridge.report});
 value.observe(board(16,[0,1]),0,false,true);
 const tie=board(16,[...Array(8).fill(0),...Array(8).fill(1)]);
 for(let round=0;round<2;round++){
  value.observe(tie,0,true,true);value.observe(board(16),0,false,true);value.observe(board(16,[0,1]),0,false,true);
  assert.equal(bridge.getState().pending,0);assert.equal(bridge.getState().reported,0);
 }
 value.observe(board(16,[...Array(10).fill(0),...Array(6).fill(1)]),0,true,true);
 assert.equal(bridge.getState().pending,1);assert.equal(bridge.getState().reported,1);
 env.receive({source:env.parent,origin:ORIGINS[0],data:{coda:1,type:'init',game:'triad',token:'tie-match-token'}});
 const reports=env.messages.filter(message=>message.data.type==='result');assert.equal(reports.length,1);
 assert.equal(reports[0].data.runId,'unique-match');assert.equal(reports[0].data.result.won,true);assert.equal(reports[0].data.result.score,10);
 bridge.destroy();
});

test('the real message bridge accepts only its allowed parent handshake and deduplicates reports',()=>{
 const env=windowFixture(),bridge=createMessageBridge(env.win),result={mode:'computer',rules:'advanced',difficulty:'hard',won:true,score:10,captures:2,comeback:true};
 assert.equal(env.messages.length,ORIGINS.length);assert.ok(env.messages.every(m=>m.data.type==='ready'&&m.data.game==='triad'));
 assert.equal(bridge.report('match-1',result),true);assert.equal(bridge.report('match-1',result),false);result.score=16;
 assert.equal(bridge.getState().pending,1);
 const good={source:env.parent,origin:ORIGINS[0],data:{coda:1,type:'init',game:'triad',token:'session-token'}};
 for(const bad of [{...good,source:{}},{...good,origin:'https://example.com'},{...good,data:{...good.data,token:''}},{...good,data:{...good.data,token:'x'.repeat(101)}},{...good,data:{...good.data,game:'pitch'}}])env.receive(bad);
 assert.equal(bridge.getState().connected,false);assert.equal(bridge.getState().pending,1);
 env.receive(good);
 const report=env.messages.at(-1);assert.equal(report.origin,ORIGINS[0]);assert.equal(report.data.coda,1);assert.equal(report.data.token,'session-token');assert.equal(report.data.type,'result');
 assert.equal(report.data.result.score,10,'Queued results are detached from mutable game objects');
 assert.equal(bridge.getState().pending,0);assert.equal(bridge.report('x'.repeat(101),result),false);assert.equal(bridge.report('',result),false);
 // The parent arcade wraps this method when same-origin access is available.
 const original=bridge.report;let wrapped=0;bridge.report=(...args)=>{wrapped++;return original(...args);};
 assert.equal(bridge.report('match-2',result),true);assert.equal(wrapped,1);
 bridge.destroy();assert.equal(env.listeners.has('message'),false);
});

test('standalone Music Triad does not contact a parent or require external services',()=>{
 const env=windowFixture(true),bridge=createMessageBridge(env.win);
 assert.equal(bridge.id(),'unique-match');assert.equal(bridge.report('match-1',{mode:'computer'}),false);
 assert.equal(env.messages.length,0);assert.equal(bridge.getState().connected,false);bridge.destroy();
});

test('the custom arcade domain and existing origins retain an exact trusted-parent handshake',()=>{
 assert.deepEqual(ORIGINS,['https://cwoodmusic.github.io','https://music-arcade.aquajelly16.chatgpt.site','https://www.coda-aracde.com']);
 for(const origin of ORIGINS){
  const env=windowFixture(),bridge=createMessageBridge(env.win);
  bridge.report('domain-match',{mode:'computer',won:true,score:5,captures:1,comeback:false});
  const good={source:env.parent,origin,data:{coda:1,type:'init',game:'triad',token:'domain-session'}};
  for(const untrusted of ['https://www.coda-arcade.com','https://coda-arcade.com','http://www.coda-aracde.com','https://www.coda-aracde.com.evil.invalid','https://coda-aracde.com','https://www.coda-aracde.com:444','https://cwoodmusic.github.io.evil.invalid'])env.receive({...good,origin:untrusted});
  env.receive({...good,source:{}});env.receive({...good,data:{...good.data,game:'pitch'}});
  env.receive({...good,data:{...good.data,token:''}});env.receive({...good,data:{...good.data,token:'x'.repeat(101)}});
  assert.equal(bridge.getState().connected,false);assert.equal(env.messages.filter(m=>m.data.type==='result').length,0);
  env.receive(good);
  const reports=env.messages.filter(m=>m.data.type==='result');assert.equal(reports.length,1);
  assert.equal(reports[0].origin,origin);assert.equal(reports[0].data.token,'domain-session');
  assert.equal(reports[0].data.game,'triad');assert.equal(reports[0].data.runId,'domain-match');
  bridge.destroy();
 }
});
