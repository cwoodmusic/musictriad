/* Sample-clock music scheduling and a restrained, shared arcade mix. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.MusicTriadAudio=api;})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const frequency=note=>440*Math.pow(2,(note-69)/12);
 const CHANNELS=Object.freeze({
  0:{type:'triangle',gain:.9},1:{type:'triangle',gain:.78},2:{type:'triangle',gain:.82},
  3:{type:'sine',gain:.42},4:{type:'triangle',gain:.58},5:{type:'triangle',gain:.65},
  6:{type:'sine',gain:.95},7:{type:'triangle',gain:.76},8:{type:'sine',gain:.72},
  9:{type:'percussion',gain:.6},10:{type:'triangle',gain:.57},11:{type:'sine',gain:.64}
 });
 function voiceProfile(channel,velocity=100,group='music'){
  const profile=CHANNELS[channel]||{type:'sine',gain:.72},base=group==='effect'?.032:group==='cue'?.047:.043;
  // Square waves and long pads previously received the same gain as quiet
  // sine voices. Timbre-specific levels keep the melody audible without buzz.
  return{type:profile.type,peak:base*profile.gain*clamp(Number.isFinite(velocity)?velocity:0,0,127)/127};
 }
 function prepareScore(raw,duration,options={}){
  const events=(Array.isArray(raw)?raw:[]).filter(event=>Array.isArray(event)&&event.length>=5&&event.every(Number.isFinite)&&event[0]>=0&&event[2]>0&&event[1]>=0&&event[1]<=127).map(event=>event.slice(0,5)).sort((a,b)=>a[0]-b[0]);
  const origin=events[0]?.[0]||0,end=events.reduce((max,event)=>Math.max(max,event[0]+event[2]),0),written=Math.max(end,Number.isFinite(duration)?duration:0)-origin;
  const loopDuration=options.bars&&options.bpm?options.bars*4*60/options.bpm:Math.max(.1,written);
  return Object.freeze({origin,duration:loopDuration,events:Object.freeze(events.map(([at,note,length,velocity,channel])=>Object.freeze({at:at-origin,note,duration:Math.min(length,Math.max(.01,loopDuration-(at-origin))),velocity,channel})).filter(event=>event.at<loopDuration))});
 }
 function create(options={}){
  const win=options.window||(typeof window!=='undefined'?window:globalThis),timerSet=options.setTimeout||win.setTimeout.bind(win),timerClear=options.clearTimeout||win.clearTimeout.bind(win);
  const scores={music:prepareScore(options.music,options.musicDuration,{bars:64,bpm:122}),win:prepareScore(options.victory,options.victoryDuration),lose:prepareScore(options.gameover,options.gameoverDuration)};
  const groups={music:new Set(),cue:new Set(),effect:new Set()},stats={musicNotes:0,cueNotes:0,effectNotes:0,cyclesScheduled:0,cueStarts:0};
  let context=null,master=null,limiter=null,noise=null,mode='idle',musicTimer=null,cueTimer=null,musicGeneration=0,cueGeneration=0,musicBase=0,musicCycle=0,musicIndex=0,cueBase=0,cueIndex=0,cueKind=null,destroyed=false;
  const enabled=()=>!destroyed&&(typeof options.enabled!=='function'||options.enabled()===true);
  function audio(){
   if(!enabled())return null;
   if(!context){
    const Constructor=options.AudioContext||win.AudioContext||win.webkitAudioContext;if(!Constructor)return null;
    try{context=new Constructor();master=context.createGain();master.gain.value=.78;
     if(context.createDynamicsCompressor){limiter=context.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=16;limiter.ratio.value=3;limiter.attack.value=.006;limiter.release.value=.16;master.connect(limiter).connect(context.destination);}else master.connect(context.destination);
    }catch{context=null;return null;}
   }
   if(context.state==='suspended')try{context.resume()?.catch?.(()=>{});}catch{}
   return context;
  }
  function track(source,gain,group,channel){
   const entry={source,gain};groups[group].add(entry);source.codaTriadGroup=group;source.codaTriadChannel=channel;gain.codaTriadVoiceGain=true;gain.codaTriadGroup=group;gain.codaTriadChannel=channel;
   source.onended=()=>{groups[group].delete(entry);try{source.disconnect();gain.disconnect();}catch{}};
   stats[group+'Notes']++;return source;
  }
  function stopGroup(group){
   const now=context?.currentTime||0;
   for(const entry of groups[group]){try{entry.gain.gain.cancelScheduledValues(now);entry.gain.gain.setTargetAtTime(.0001,now,.004);entry.source.stop(now+.02);}catch{}}
   groups[group].clear();
  }
  function voice(event,at,group){
   const ctx=audio();if(!ctx||ctx.state==='closed'||at<ctx.currentTime-.04)return false;
   const profile=voiceProfile(event.channel,event.velocity,group),when=Math.max(ctx.currentTime,at),length=Math.max(.025,event.duration),gain=ctx.createGain();let source;
   if(profile.type==='percussion'&&event.note!==36){
    if(!noise){noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.13),ctx.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
    source=ctx.createBufferSource();source.buffer=noise;const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1800;filter.Q.value=.7;source.connect(filter).connect(gain);
   }else{
    source=ctx.createOscillator();source.type=profile.type==='percussion'?'sine':profile.type;source.frequency.setValueAtTime(profile.type==='percussion'?105:frequency(event.note),when);
    if(profile.type==='percussion')source.frequency.exponentialRampToValueAtTime(45,when+.07);source.connect(gain);
   }
   const duration=profile.type==='percussion'?Math.min(.11,length):length,attack=Math.min(event.channel===3?.04:.009,duration*.25),release=Math.min(.1,duration*.32),sustain=Math.max(when+attack,when+duration-release);
   gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,profile.peak),when+attack);gain.gain.exponentialRampToValueAtTime(Math.max(.00015,profile.peak*.7),sustain);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
   gain.connect(master);track(source,gain,group,event.channel);source.start(when);source.stop(when+duration+.015);return true;
  }
  function stopMusic(){musicGeneration++;timerClear(musicTimer);musicTimer=null;stopGroup('music');stopGroup('effect');if(mode==='music')mode='idle';}
  function stopEndCue(){cueGeneration++;timerClear(cueTimer);cueTimer=null;stopGroup('cue');cueKind=null;if(mode==='cue')mode='idle';}
  function seek(events,at){let left=0,right=events.length;while(left<right){const mid=(left+right)>>>1;if(events[mid].at<at)left=mid+1;else right=mid;}return left;}
  function scheduleMusic(generation){
   musicTimer=null;if(generation!==musicGeneration||mode!=='music'||!enabled()||!context)return;
   const score=scores.music,now=context.currentTime,horizon=now+.22;
   if(!score.events.length){mode='idle';return;}
   // Background timer throttling skips inaudible history; it never floods the
   // next frame with late notes or moves the musical loop boundary.
   const cycle=Math.max(0,Math.floor((now-musicBase)/score.duration));
   if(cycle>musicCycle){musicCycle=cycle;musicIndex=seek(score.events,now-musicBase-musicCycle*score.duration-.04);}
   else if(score.events[musicIndex]&&musicBase+musicCycle*score.duration+score.events[musicIndex].at<now-.25)musicIndex=seek(score.events,now-musicBase-musicCycle*score.duration-.04);
   let planned=0;
   while(planned++<512){
    if(musicIndex>=score.events.length){musicIndex=0;musicCycle++;}
    const event=score.events[musicIndex],at=musicBase+musicCycle*score.duration+event.at;if(at>horizon)break;
    musicIndex++;if(at>=now-.04){voice(event,at,'music');stats.cyclesScheduled=Math.max(stats.cyclesScheduled,musicCycle+1);}
   }
   musicTimer=timerSet(()=>scheduleMusic(generation),50);
  }
  function startMusic(){
   if(!enabled()||!audio())return false;if(mode==='music'&&musicTimer!==null)return true;
   stopEndCue();stopMusic();mode='music';musicBase=context.currentTime+.04;musicCycle=0;musicIndex=0;stats.cyclesScheduled=0;scheduleMusic(musicGeneration);return true;
  }
  function scheduleCue(generation){
   cueTimer=null;if(generation!==cueGeneration||mode!=='cue'||!enabled()||!context)return;
   const score=scores[cueKind],now=context.currentTime,horizon=now+.22;let planned=0;
   if(score.events[cueIndex]&&cueBase+score.events[cueIndex].at<now-.25)cueIndex=seek(score.events,now-cueBase-.04);
   while(cueIndex<score.events.length&&planned++<128){const event=score.events[cueIndex],at=cueBase+event.at;if(at>horizon)break;cueIndex++;if(at>=now-.04)voice(event,at,'cue');}
   if(cueIndex>=score.events.length&&now>=cueBase+score.duration){mode='idle';cueKind=null;return;}
   cueTimer=timerSet(()=>scheduleCue(generation),50);
  }
  function fanfare(kind){
   stopMusic();stopEndCue();if(!['win','lose'].includes(kind)||!enabled()||!audio())return false;
   mode='cue';cueKind=kind;cueBase=context.currentTime+.04;cueIndex=0;stats.cueStarts++;scheduleCue(cueGeneration);return true;
  }
  function capture(){
   if(mode!=='music'||!enabled()||!audio())return false;
   const at=context.currentTime+.005;[[76,0],[83,.045],[88,.09]].forEach(([note,off])=>voice({note,channel:6,duration:.1,velocity:80},at+off,'effect'));return true;
  }
  function snapshot(){return{mode,contextState:context?.state||'closed',activeMusicVoices:groups.music.size,activeCueVoices:groups.cue.size,activeEffectVoices:groups.effect.size,loopDuration:scores.music.duration,loopOrigin:scores.music.origin,musicBase,musicCycle,cueKind,...stats};}
  function destroy(){stopMusic();stopEndCue();destroyed=true;try{context?.close()?.catch?.(()=>{});}catch{}context=null;}
  return{audio,startMusic,stopMusic,stopEndCue,fanfare,capture,snapshot,destroy,get context(){return context;}};
 }
 return Object.freeze({create,prepareScore,voiceProfile,frequency});
});
