// Small, locally synthesized sounds. Nothing is downloaded or played before a gesture.
export function createAudio(){
 let context,master,rainGain,humGain,enabled=true;
 const api={get enabled(){return enabled;},resume(){
  if(!enabled)return;
  if(!context){
   const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
   context=new AudioContext();master=context.createGain();master.gain.value=.26;master.connect(context.destination);
   const buffer=context.createBuffer(1,context.sampleRate*3,context.sampleRate),data=buffer.getChannelData(0);let previous=0;
   for(let i=0;i<data.length;i++){previous=(previous+(Math.random()*2-1)*.12)/1.07;data[i]=previous;}
   const noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;
   const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1900;
   rainGain=context.createGain();rainGain.gain.value=.32;noise.connect(filter).connect(rainGain).connect(master);noise.start();
   const hum=context.createOscillator();hum.type='sine';hum.frequency.value=100;humGain=context.createGain();humGain.gain.value=.004;hum.connect(humGain).connect(master);hum.start();
  }
  context.resume().catch(()=>{});
 },toggle(){enabled=!enabled;if(master)master.gain.setTargetAtTime(enabled?.26:0,context.currentTime,.1);if(enabled)api.resume();return enabled;},update(inside){if(!context)return;rainGain.gain.setTargetAtTime(inside?.055:.30,context.currentTime,.4);humGain.gain.setTargetAtTime(inside?.014:.003,context.currentTime,.5);},play(kind='click'){
  if(!context||!enabled)return;const t=context.currentTime;
  function tone(freq,start,duration,volume=.12,type='sine',end=freq){const o=context.createOscillator(),g=context.createGain();o.type=type;o.frequency.setValueAtTime(freq,t+start);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+start+duration);g.gain.setValueAtTime(.0001,t+start);g.gain.exponentialRampToValueAtTime(volume,t+start+.008);g.gain.exponentialRampToValueAtTime(.0001,t+start+duration);o.connect(g).connect(master);o.start(t+start);o.stop(t+start+duration+.02);}
  if(/door|welcome/.test(kind)){tone(880,0,.3,.14);tone(1175,.15,.4,.11);}
  else if(/cash|checkout|pay|purchase/.test(kind)){tone(1047,0,.15,.12);tone(1568,.12,.26,.10);}
  else if(/foot|step|land/.test(kind)){tone(kind==='step-inside'?120:175,0,.055,kind==='land'?.1:.05,'triangle',55);}
  else if(/coffee|brew|pour/.test(kind)){for(let i=0;i<5;i++)tone(300+Math.random()*400,i*.06,.12,.027,'sine',190);}
  else if(/drink|eat|consume/.test(kind)){tone(390,0,.16,.05,'sine',220);tone(540,.12,.17,.045,'sine',350);}
  else if(/error|denied/.test(kind)){tone(180,0,.12,.09,'triangle',130);}
  else if(/bike|bell/.test(kind)){tone(1700,0,.38,.07);tone(2200,.1,.32,.04);}
  else if(/jump/.test(kind))tone(190,0,.12,.035,'triangle',380);
  else tone(740,0,.075,.065,'sine',520);
 }};return api;
}
