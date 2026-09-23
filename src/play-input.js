// Input intent is independent of movement, camera collision, and rendering.
// Mouse deltas intentionally have no button-state requirement.
export function createPlayInput(){
 let sprinting=false,lookEnabled=true,lastPointer=null,relativeReady=false,altModifier=false;
 const shifts=new Set(),alts=new Set();
 const isShift=code=>code==='ShiftLeft'||code==='ShiftRight';
 const isAlt=code=>code==='AltLeft'||code==='AltRight';
 const cursorHeld=()=>alts.size>0||altModifier;
 const canLook=()=>lookEnabled&&!cursorHeld();
 function resetPointer(){lastPointer=null;relativeReady=false;}
 return {
  get sprinting(){return sprinting;},get lookEnabled(){return canLook();},
  get cursorHeld(){return cursorHeld();},
  pressShift(code='ShiftLeft',repeat=false){
   if(!isShift(code)||repeat||shifts.has(code))return false;
   const fresh=shifts.size===0;shifts.add(code);
   if(!fresh)return false;sprinting=!sprinting;return true;
  },
  releaseShift(code){if(isShift(code))shifts.delete(code);},
  pressAlt(code='AltLeft'){
   if(!isAlt(code)||alts.has(code))return false;
   const fresh=!cursorHeld();alts.add(code);
   if(fresh)resetPointer();return fresh;
  },
  releaseAlt(code){
   if(!alts.delete(code)||cursorHeld())return false;
   resetPointer();return true;
  },
  syncAlt(held){
   const before=cursorHeld();altModifier=!!held;
   if(!held)alts.clear();
   const changed=before!==cursorHeld();if(changed)resetPointer();return changed;
  },
  clearAlt(){alts.clear();altModifier=false;resetPointer();},
  suspendLook(){lookEnabled=false;resetPointer();},
  resumeLook(){lookEnabled=true;resetPointer();},
  resetPointer,
  pointerDelta(x,y){
   if(!canLook()||!Number.isFinite(x)||!Number.isFinite(y))return null;
   if(!lastPointer){lastPointer={x,y};return null;}
   const delta={x:x-lastPointer.x,y:y-lastPointer.y};lastPointer={x,y};return delta;
  },
  lockedDelta(x,y){
   if(!canLook()||!Number.isFinite(x)||!Number.isFinite(y))return null;
   if(!relativeReady){relativeReady=true;return null;}
   return {x,y};
  }
 };
}
