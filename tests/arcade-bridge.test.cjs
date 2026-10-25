const test=require('node:test');
const assert=require('node:assert/strict');
const {createResultTracker,createMessageBridge,ORIGINS}=require('../arcade-bridge.js');

const board=(size,owners=[])=>Array.from({length:size},(_,index)=>owners[index]===0||owners[index]===1?{owner:owners[index]}:null);
function tracker(initial={}){
 const settings={visible:true,tutorial:false,rules:'simple',difficulty:'Normal',...initial},reports=[];let serial=0;
 const value=createResultTracker({id:()=>`match-${++serial}`,getSettings:()=>settings,report:(id,result)=>reports.push({id,result})});
 return{value,settings,reports};
}

test('completed simple and advanced wins, losses and ties retain the real board score',()=>{
 for(const rules of ['simple','advanced'])for(const difficulty of ['Easy','Normal','Hard']){
  const size=rules==='advanced'?16:9;
  for(const own of [3,Math.ceil(size/2),size]){
   const env=tracker({rules,difficulty});
   env.value.observe(board(size,[0,1]),0,false,true);
   const owners=Array.from({length:size},(_,i)=>i<own?0:1);
   const result=env.value.observe(board(size,owners),0,true,true);
   assert.equal(result.mode,'computer');assert.equal(result.rules,rules);assert.equal(result.difficulty,difficulty.toLowerCase());
   assert.equal(result.score,own);assert.equal(result.won,own>size-own);assert.equal(env.reports.length,1);
   assert.equal(env.value.observe(board(size,owners),0,true,true),null);assert.equal(env.reports.length,1);
  }
 }
 const tie=tracker({rules:'advanced',difficulty:'Hard'});tie.value.observe(board(16,[0,1]),0,false,true);
 const result=tie.value.observe(board(16,[...Array(8).fill(0),...Array(8).fill(1)]),0,true,true);
 assert.equal(result.won,false);assert.equal(result.score,8);
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
