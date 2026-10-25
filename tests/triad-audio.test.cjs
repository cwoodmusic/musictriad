const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const audio=require('../triad-audio.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function score(name){return JSON.parse(html.match(new RegExp('const '+name+'=(\\[.*?\\]);'))[1]);}
const music=score('MIDI_EVENTS'),victory=score('VICTORY_MIDI_EVENTS'),gameover=score('GAMEOVER_MIDI_EVENTS');
function environment(){
 let time=0,serial=0;const timers=new Map(),sources=[];
 class Parameter{constructor(value=0){this.value=value;this.events=[];}setValueAtTime(value,at){this.value=value;this.events.push([value,at]);}exponentialRampToValueAtTime(value,at){assert.ok(value>0);this.events.push([value,at]);}setTargetAtTime(value,at){this.events.push([value,at]);}cancelScheduledValues(at){this.events=this.events.filter(event=>event[1]<at);}}
 class Node{constructor(){this.gain=new Parameter();this.frequency=new Parameter();this.Q=new Parameter();this.connections=[];}connect(target){this.connections.push(target);return target;}disconnect(){this.connections=[];}}
 class Source extends Node{constructor(){super();sources.push(this);}start(at){this.startAt=at;}stop(at=time){this.stopAt=at;}finish(){if(!this.ended&&this.stopAt<=time){this.ended=true;this.onended?.();}}}
 class Context{constructor(){this.state='running';this.sampleRate=8000;this.destination=new Node();}get currentTime(){return time;}resume(){this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}createGain(){return new Node();}createDynamicsCompressor(){const node=new Node();for(const field of ['threshold','knee','ratio','attack','release'])node[field]=new Parameter();return node;}createOscillator(){return new Source();}createBufferSource(){return new Source();}createBiquadFilter(){return new Node();}createBuffer(_,length){const data=new Float32Array(length);return{getChannelData:()=>data};}}
 let enabled=true;
 const engine=audio.create({window:{},AudioContext:Context,enabled:()=>enabled,music,musicDuration:127.8688,victory,victoryDuration:36.2969,gameover,gameoverDuration:31.114,setTimeout:(callback,delay)=>{const id=++serial;timers.set(id,{at:time+delay/1000,callback});return id;},clearTimeout:id=>timers.delete(id)});
 function advance(seconds){const target=time+seconds;let guard=0;while(true){const next=[...timers.entries()].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++guard>10000)throw Error('Unbounded audio timers');time=next[1].at;timers.delete(next[0]);for(const source of sources)source.finish();next[1].callback();}time=target;for(const source of sources)source.finish();}
 function jump(seconds){time+=seconds;for(const source of sources)source.finish();const due=[...timers.entries()].filter(([,timer])=>timer.at<=time);for(const [id,timer]of due){timers.delete(id);timer.callback();}}
 return{engine,sources,timers,advance,jump,setEnabled:value=>enabled=value};
}

test('the original score loops on its 64-bar boundary without repeating blank lead-in',()=>{
 const prepared=audio.prepareScore(music,127.8688,{bars:64,bpm:122});
 assert.equal(prepared.events.length,2910);assert.equal(prepared.origin,1.9672);assert.equal(prepared.events[0].at,0);
 assert.equal(prepared.duration,256*60/122);assert.ok(prepared.events.every(event=>event.at>=0&&event.at+event.duration<=prepared.duration+1e-8));
 const env=environment();env.engine.startMusic();const initial=env.sources.find(source=>source.codaTriadGroup==='music');
 env.advance(prepared.duration);
 const repeated=env.sources.find(source=>source.codaTriadGroup==='music'&&Math.abs(source.startAt-initial.startAt-prepared.duration)<1e-7);
 assert.ok(repeated,'The first note of the following loop is scheduled at the exact audio boundary');
 assert.equal(repeated.frequency.value,initial.frequency.value);assert.equal(env.engine.snapshot().cyclesScheduled,2);
 assert.ok(env.engine.snapshot().activeMusicVoices<25,'Only nearby notes should allocate audio voices');
});

test('long pads and noisy accompaniment have restrained gains while notes retain dynamic velocity',()=>{
 const pad=audio.voiceProfile(3,127),lead=audio.voiceProfile(0,127),comp=audio.voiceProfile(4,127);
 assert.equal(pad.type,'sine');assert.ok(pad.peak<lead.peak*.6);assert.ok(comp.peak<lead.peak*.7);
 for(let channel=0;channel<12;channel++){
  const loud=audio.voiceProfile(channel,127),soft=audio.voiceProfile(channel,64);
  assert.ok(soft.peak<loud.peak);assert.ok(loud.peak>0&&loud.peak<.05);assert.notEqual(loud.type,'square');
 }
 assert.equal(audio.voiceProfile(0,0).peak,0);
});

test('a victory cue cancels backing and capture voices, and a new match cancels the cue',()=>{
 const env=environment();env.engine.startMusic();env.engine.capture();
 assert.ok(env.engine.snapshot().activeEffectVoices>0);assert.equal(env.engine.fanfare('win'),true);
 const after=env.engine.snapshot();assert.equal(after.mode,'cue');assert.equal(after.cueStarts,1);assert.equal(after.activeMusicVoices,0);assert.equal(after.activeEffectVoices,0);assert.ok(after.activeCueVoices>0);
 assert.ok(after.activeCueVoices<10,'The 36-second cue must not preallocate every future note');
 assert.equal(env.engine.capture(),false,'An old capture callback cannot sound over the result cue');
 const oldNotes=env.sources.length;env.engine.startMusic();assert.equal(env.engine.snapshot().activeCueVoices,0);env.advance(.4);
 assert.equal(env.sources.slice(oldNotes).some(source=>source.codaTriadGroup==='cue'),false);
});

test('muting and leaving stop all scheduled notes without a stale timer restarting them',()=>{
 const env=environment();env.engine.startMusic();env.advance(.2);env.engine.fanfare('lose');
 const first=env.sources.find(source=>source.codaTriadGroup==='cue');assert.ok(first.startAt<.3,'Game-over audio skips its old 2.9-second leading silence');
 env.setEnabled(false);env.engine.stopMusic();env.engine.stopEndCue();const count=env.sources.length;
 env.advance(10);assert.equal(env.sources.length,count);assert.equal(env.timers.size,0);assert.equal(env.engine.snapshot().mode,'idle');
 assert.equal(env.engine.startMusic(),false);assert.equal(env.engine.fanfare('win'),false);
});

test('a throttled background timer skips stale music without rescheduling its loop clock',()=>{
 const env=environment();env.engine.startMusic();const base=env.engine.snapshot().musicBase,count=env.sources.length;
 env.jump(100);const added=env.sources.slice(count);
 assert.ok(added.length<20,'A slow frame must not burst hundreds of old notes at once');
 assert.ok(added.every(source=>source.startAt>=100-.04));assert.equal(env.engine.snapshot().musicBase,base);
 env.jump(200);assert.equal(env.engine.snapshot().musicBase,base);assert.ok(env.engine.snapshot().activeMusicVoices<25);
});
