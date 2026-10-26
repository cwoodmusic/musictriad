/* Completed Music Triad matches feed the arcade's existing local rewards. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root?.document){root.CodaTriadResults=api;api.install(root);}
})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const ORIGINS=Object.freeze(['https://cwoodmusic.github.io','https://music-arcade.aquajelly16.chatgpt.site','https://www.coda-aracde.com']);
 const GRADES=Object.freeze(['easy','normal','hard']);
 const grade=value=>GRADES.includes(String(value).toLowerCase())?String(value).toLowerCase():'normal';
 const weaker=(a,b)=>GRADES[Math.min(GRADES.indexOf(grade(a)),GRADES.indexOf(grade(b)))];
 const copy=value=>JSON.parse(JSON.stringify(value));
 function createMessageBridge(win,options={}){
  const allowed=new Set(options.origins||ORIGINS),pending=[],seen=new Set();
  let origin='',token='',destroyed=false;
  const embedded=()=>win.parent&&win.parent!==win;
  function id(){return win.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
  function send(payload){
   if(destroyed||!embedded())return false;
   if(!token){if(pending.length<32)pending.push(payload);return true;}
   try{win.parent.postMessage({...payload,coda:1,token,game:'triad'},origin);return true;}catch{return false;}
  }
  function receive(event){
   const message=event?.data;
   if(destroyed||!embedded()||event.source!==win.parent||!allowed.has(event.origin)||!message||message.coda!==1||message.type!=='init'||message.game!=='triad'||typeof message.token!=='string'||!message.token.length||message.token.length>100)return;
   origin=event.origin;token=message.token;
   for(const payload of pending.splice(0))send(payload);
  }
  win.addEventListener('message',receive);
  if(embedded())for(const target of allowed)try{win.parent.postMessage({coda:1,type:'ready',game:'triad'},target);}catch{}
  return{
   id,
   report(runId,result){
    if(typeof runId!=='string'||!runId.length||runId.length>100||seen.has(runId)||!result||typeof result!=='object')return false;
    seen.add(runId);
    return send({type:'result',runId,result:copy(result)});
   },
   getState:()=>({connected:!!token,origin,pending:pending.length,reported:seen.size}),
   destroy(){destroyed=true;pending.length=0;win.removeEventListener('message',receive);}
  };
 }
 function createResultTracker(options={}){
  const makeId=options.id||(()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  const settings=()=>{let value={};try{value=options.getSettings?.()||{};}catch{}return{visible:value.visible!==false,tutorial:value.tutorial===true,rules:value.rules==='advanced'?'advanced':'simple',difficulty:grade(value.difficulty)};};
  let state;
  function reset(){
   state={id:makeId(),previous:[],captures:0,trailed:false,done:false,observedActive:false,started:false,mode:null,rules:null,difficulty:null,usedDifficulty:null,seat:null,eligible:true};
   options.onState?.(state);return state;
  }
  function useDifficulty(value){
   const current=settings();if(!current.visible||current.tutorial||state.done)return false;
   state.usedDifficulty=state.usedDifficulty?weaker(state.usedDifficulty,value):grade(value);
   if(state.started&&state.mode==='computer')state.difficulty=weaker(state.difficulty,state.usedDifficulty);
   return true;
  }
  function observe(cards,seat,over,computer){
   const current=settings();
   if(!current.visible||current.tutorial||!Array.isArray(cards)||![9,16].includes(cards.length)||![0,1].includes(seat)||typeof over!=='boolean'||typeof computer!=='boolean'||cards.some(card=>card!==null&&card!==undefined&&(!card||![0,1].includes(card.owner))))return null;
   const occupied=cards.filter(Boolean).length,mode=computer?'computer':'multiplayer';
   // Multiplayer resets can arrive from Firebase rather than local reset().
   // Advanced action cards may clear every square during a continuing match.
   if(occupied===0&&state.previous.some(Boolean)&&state.rules!=='advanced')reset();
   if(state.done)return null;
   if(!state.started){
    if(!over&&occupied>0&&occupied<cards.length){
     state.started=state.observedActive=true;state.mode=mode;state.rules=current.rules;state.seat=seat;
     state.difficulty=computer?(state.usedDifficulty?weaker(current.difficulty,state.usedDifficulty):current.difficulty):null;
    }
   }else{
    if(mode!==state.mode||seat!==state.seat||current.rules!==state.rules)state.eligible=false;
    if(computer)state.difficulty=weaker(state.difficulty,state.usedDifficulty?weaker(current.difficulty,state.usedDifficulty):current.difficulty);
   }
   const previous=state.previous;
   if(state.started)cards.forEach((card,index)=>{if(card&&previous[index]&&previous[index].owner!==seat&&card.owner===seat)state.captures++;});
   state.previous=cards.map(card=>card?{owner:card.owner}:null);
   const own=cards.filter(card=>card?.owner===seat).length,opponent=occupied-own;
   if(!over&&state.started&&own<opponent)state.trailed=true;
   if(!over||!state.observedActive||!state.eligible)return null;
   // An Advanced tie starts another board in this same match. Keep its run
   // and reward eligibility open; the cleared board will refresh previous.
   if(state.rules==='advanced'&&own===opponent)return null;
   state.done=true;
   const result={mode:state.mode,rules:state.rules,...(state.mode==='computer'?{difficulty:state.difficulty}:{}),won:own>opponent,captures:state.captures,comeback:state.trailed&&own>opponent,score:own};
   options.report?.(state.id,result);return result;
  }
  reset();
  return{reset,observe,useDifficulty,getState:()=>copy(state)};
 }
 function install(win){
  if(win.CodaTriadResultsInstalled)return win.CodaTriadResultsInstalled;
  const doc=win.document,bridge=createMessageBridge(win);
  const tracker=createResultTracker({id:bridge.id,report:(id,result)=>win.CodaBridge.report(id,result),onState:state=>{win.codaTriadState=state;},getSettings:()=>{
   const start=doc.getElementById('startScreen'),body=doc.body,badge=(doc.getElementById('modeBadge')?.textContent||'').toLowerCase();
   return{visible:!!body&&(!start||start.hidden||start.classList.contains('hidden')),tutorial:body?.classList.contains('tutorial-active')||body?.classList.contains('advanced-tutorial-active')||badge.includes('tutorial'),rules:win.musicTriadAdvancedSelected?.()||body?.classList.contains('advanced-mode')?'advanced':'simple',difficulty:doc.getElementById('level')?.value};
  }});
  win.CodaBridge=bridge;
  win.codaTriadReset=()=>tracker.reset();
  win.codaTriadObserve=(cards,seat,over,computer)=>tracker.observe(cards,seat,over,computer);
  win.codaTriadDifficultyUsed=value=>tracker.useDifficulty(value);
  // A late dropdown upgrade cannot turn an easier match into a Hard reward.
  doc.addEventListener('change',event=>{if(event.target?.id==='level'&&tracker.getState().started)tracker.useDifficulty(event.target.value);});
  return win.CodaTriadResultsInstalled={bridge,tracker};
 }
 return Object.freeze({ORIGINS,createMessageBridge,createResultTracker,install});
});
