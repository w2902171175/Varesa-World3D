import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { MMDParser } from 'three/addons/libs/mmdparser.module.js';
import { createMotionController } from '../src/character-motion.js';
import { capturedCycles } from '../assets/motion/cycles.js';
import { advanceVelocity } from '../src/locomotion.js';

// Load the real PMX geometry and bind skeleton; only image/material decoding is
// omitted. A mock skeleton cannot catch a control-bone/deform-bone mismatch.
const modelUrl = new URL('../assets/character/official/瓦雷莎.pmx', import.meta.url);
const hasLocalModel = existsSync(modelUrl);
const file = hasLocalModel ? readFileSync(modelUrl) : null;
const pmx = file ? new MMDParser.Parser().parsePmx(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), true) : {morphs: [], metadata: {morphCount: 0}, vertices: [], bones: []};
const expressions = new Set(['まばたき', '笑い', 'にこり', '口角上げ', 'もぐもぐ', 'あ']);
pmx.morphs = pmx.morphs.filter(m => expressions.has(m.name));
pmx.metadata.morphCount = pmx.morphs.length;
const weightTotals = new Map();
for (const vertex of pmx.vertices) vertex.skinIndices.forEach((index, i) => {
  weightTotals.set(index, (weightTotals.get(index) || 0) + (vertex.skinWeights[i] || 0));
});
const indicesByName = new Map(pmx.bones.map((bone, i) => [bone.name, i]));
const deformIndices = new Set(['左足D', '左ひざD', '左足首D', '左足先EX', '右足D', '右ひざD', '右足首D', '右足先EX'].map(name => indicesByName.get(name)));
const eligibleVertices = pmx.vertices.flatMap((vertex, index) => {
  const weight = vertex.skinIndices.reduce((sum, bone, i) => sum + (deformIndices.has(bone) ? vertex.skinWeights[i] || 0 : 0), 0);
  return weight > .90 ? [index] : [];
});
const sampleIndices = Array.from({ length: 96 }, (_, i) => eligibleVertices[Math.floor(i * eligibleVertices.length / 96)]);

function fixture({ animated = true } = {}) {
  const loader = new MMDLoader();
  loader.meshBuilder.materialBuilder.build = () => pmx.materials.map(() => new THREE.MeshBasicMaterial());
  const mesh = loader.meshBuilder.build(pmx, '');
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox, scale = 1.72 / (bounds.max.y - bounds.min.y), groundOffset = -bounds.min.y * scale;
  const root = new THREE.Group(), visual = new THREE.Group();
  root.add(visual); visual.add(mesh); mesh.scale.setScalar(scale); mesh.position.y = groundOffset;
  const bones = Object.fromEntries(mesh.skeleton.bones.map(bone => [bone.name, bone]));
  const sockets = { leftHand: new THREE.Group(), rightHand: new THREE.Group() };
  for (const [name, boneName] of [['leftHand', '左手首'], ['rightHand', '右手首']]) {
    bones[boneName].add(sockets[name]); sockets[name].position.set(0, -.43, .06); sockets[name].scale.setScalar(1 / scale);
  }
  root.updateMatrixWorld(true);
  const motion = animated ? createMotionController({ mesh, root, visual, scale, groundOffset, sockets }) : null;
  let time = 0;
  function update(dt, state = {}, { travel = true } = {}) {
    time += dt;
    const speed = state.speed || 0, yaw = root.rotation.y;
    if (travel && state.moving && !state.riding) {
      root.position.x += Math.sin(yaw) * speed * dt;
      root.position.z += Math.cos(yaw) * speed * dt;
    }
    motion.update(dt, { grounded: true, velocity: { x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, time, ...state });
    root.updateMatrixWorld(true); mesh.skeleton.update();
  }
  function sample() {
    root.updateMatrixWorld(true); mesh.skeleton.update();
    return sampleIndices.map(index => {
      const p = mesh.getVertexPosition(index, new THREE.Vector3()); mesh.localToWorld(p); root.worldToLocal(p); return p;
    });
  }
  function socket(name = 'rightHand') { const p = sockets[name].getWorldPosition(new THREE.Vector3()); return root.worldToLocal(p); }
  function settle(seconds = 1.5, state = {}) { for (let i = 0; i < Math.round(seconds * 60); i++) update(1 / 60, { moving: false, speed: 0, ...state }); }
  function dispose() { mesh.geometry.dispose(); mesh.material.forEach(m => m.dispose()); mesh.skeleton.dispose(); }
  return { root, visual, mesh, bones, sockets, motion, update, sample, socket, settle, dispose, scale };
}

function difference(a, b) {
  let total = 0, maximum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i].distanceTo(b[i]); total += d * d; maximum = Math.max(maximum, d); }
  return { rms: Math.sqrt(total / a.length), maximum };
}
function finiteRig(rig) {
  for (const bone of rig.mesh.skeleton.bones) {
    assert.ok([...bone.position.toArray(), ...bone.quaternion.toArray(), ...bone.matrixWorld.elements].every(Number.isFinite), `${bone.name}: non-finite transform`);
    assert.ok(Math.abs(bone.quaternion.length() - 1) < 1e-4, `${bone.name}: quaternion is not normalized`);
  }
  assert.ok([...rig.mesh.skeleton.boneMatrices].every(Number.isFinite), 'Non-finite skinning palette');
  assert.ok((rig.mesh.morphTargetInfluences || []).every(v => Number.isFinite(v) && v >= -.001 && v <= 1.001), 'Invalid facial morph');
  for (const p of rig.sample()) assert.ok(p.toArray().every(Number.isFinite), 'Non-finite skinned vertex');
}
function localBonePosition(rig, name) {
  return rig.root.worldToLocal(rig.bones[name].getWorldPosition(new THREE.Vector3()));
}
function hipHeight(rig) {
  return (localBonePosition(rig, '左足').y + localBonePosition(rig, '右足').y) / 2;
}
function captureDirection(cycle, key, phase) {
  const frame = phase * cycle.frames.length, index = Math.floor(frame) % cycle.frames.length;
  return new THREE.Vector3(...cycle.frames[index][key]).lerp(new THREE.Vector3(...cycle.frames[(index + 1) % cycle.frames.length][key]), frame - Math.floor(frame)).normalize();
}

describe('Official Varesa PMX motion and deformation', {skip: hasLocalModel ? false : '本地模型未安装；请按 README.md 获取官方模型后运行完整角色测试。'}, () => {
  test('front-view free arm swings stay on their own sides and travel mainly forward and back', t => {
    for (const [label, speed, running] of [['walk', 1.45, false], ['run', 3.15, true]]) {
      const rig = fixture(); rig.settle();
      const tracks = { 左: { x: [], z: [] }, 右: { x: [], z: [] } };
      for (let frame = 0; frame < 240; frame++) {
        rig.update(1 / 60, { speed, moving: true, running });
        if (frame < 60) continue;
        for (const [side, sign] of [['左', 1], ['右', -1]]) {
          const wrist = localBonePosition(rig, side + '手首');
          const elbow = localBonePosition(rig, side + 'ひじ');
          assert.ok(wrist.x * sign > .09, `${label}: ${side} hand crowded/crossed the centreline`);
          assert.ok(wrist.x * sign < .24 && elbow.x * sign < .20, `${label}: ${side} arm flared too far sideways`);
          tracks[side].x.push(wrist.x); tracks[side].z.push(wrist.z);
          const shoulder = localBonePosition(rig, side + '腕');
          const angle = THREE.MathUtils.radToDeg(shoulder.sub(elbow).angleTo(wrist.clone().sub(elbow)));
          assert.ok(angle > 45 && angle < 170, `${label}: ${side} elbow collapsed or locked straight`);
        }
      }
      for (const side of ['左', '右']) {
        const lateral = Math.max(...tracks[side].x) - Math.min(...tracks[side].x);
        const forward = Math.max(...tracks[side].z) - Math.min(...tracks[side].z);
        assert.ok(lateral < .040 && forward > .095 && forward > lateral * 3, `${label}: ${side} hand swept sideways instead of forward/back`);
        t.diagnostic(`${label} ${side}: lateral ${(lateral * 100).toFixed(1)} cm, fore/aft ${(forward * 100).toFixed(1)} cm`);
      }
      finiteRig(rig); rig.dispose();
    }
  });

  test('umbrella has distinct stowed, closed-equipped and open hand poses with smooth transitions', t => {
    const rig = fixture(); rig.settle(); let last = rig.socket(), maximumStep = 0;
    function advance(state, frames = 120) {
      const points = [];
      for (let i = 0; i < frames; i++) {
        rig.update(1 / 60, state); const p = rig.socket();
        maximumStep = Math.max(maximumStep, p.distanceTo(last)); last = p;
        if (i >= 60) points.push(p);
      }
      return points;
    }
    const closed = advance({ speed: 1.45, moving: true, umbrellaEquipped: true, umbrellaOpen: false });
    for (const p of closed) assert.ok(p.x < -.17 && p.x > -.25 && p.y > .74 && p.y < .90 && Math.abs(p.z) < .15, 'Closed umbrella grip must hang outside the right thigh');
    const closedZ = Math.max(...closed.map(p => p.z)) - Math.min(...closed.map(p => p.z));
    assert.ok(closedZ < .035, 'Carrying a closed umbrella should quiet the right-arm swing');
    const open = advance({ speed: 0, moving: false, umbrellaEquipped: true, umbrellaOpen: true });
    assert.ok(open.every(p => p.y > 1.0 && p.y < 1.20 && p.z > .13), 'Open umbrella grip must rise to its handle position');
    const stowed = advance({ speed: 1.45, moving: true, umbrellaEquipped: false, umbrellaOpen: false });
    assert.ok(Math.max(...stowed.map(p => p.z)) - Math.min(...stowed.map(p => p.z)) > .10, 'Stowing the umbrella must restore free arm swing');
    const legacy = advance({ speed: 0, moving: false, umbrella: true });
    assert.ok(legacy.every(p => p.y > 1.0), 'Legacy umbrella=true must still mean an open umbrella');
    assert.ok(maximumStep < .13, `Umbrella transition moved the grip ${(maximumStep * 100).toFixed(1)} cm in one frame`);
    t.diagnostic(`Closed umbrella fore/aft grip drift ${(closedZ * 100).toFixed(2)} cm; maximum transition step ${(maximumStep * 100).toFixed(2)} cm`);
    finiteRig(rig); rig.dispose();
  });

  test('the source rig requires grants: control-bone motion alone does not deform the legs', () => {
    for (const side of ['左', '右']) for (const part of ['足', 'ひざ', '足首']) {
      assert.equal(weightTotals.get(indicesByName.get(side + part)) || 0, 0);
      assert.ok(weightTotals.get(indicesByName.get(side + part + 'D')) > 300, `${side + part}D must own actual skin weights`);
    }
    const rig = fixture({ animated: false }), original = rig.sample();
    rig.bones['左足'].rotation.x = .65;
    assert.ok(difference(original, rig.sample()).maximum < 1e-7, 'This regression fixture must expose the unpropagated grant bug');
    rig.bones['左足D'].quaternion.copy(rig.bones['左足'].quaternion);
    assert.ok(difference(original, rig.sample()).maximum > .20, 'The D chain must visibly deform the original weighted leg geometry');
    rig.dispose();
  });

  test('spawn relocation and bike dismount retain an undistorted standing pose beside the current root', () => {
    const rig = fixture(); rig.settle(); const restingSkin = rig.sample();
    const restingFeet = Object.fromEntries(['左', '右'].map(side => [side, localBonePosition(rig, side + '足首D')]));
    const assertStanding = (label) => {
      for (const side of ['左', '右']) {
        const ankle = localBonePosition(rig, side + '足首D');
        assert.ok(Math.hypot(ankle.x, ankle.z) < .25, `${label}: ${side} foot remained at an earlier world location`);
        assert.ok(ankle.distanceTo(restingFeet[side]) < .065, `${label}: ${side} foot did not return to its standing position`);
      }
      finiteRig(rig);
      assert.ok(difference(restingSkin, rig.sample()).maximum < .22, `${label}: relocated resting skin is distorted`);
    };
    // createCharacter initializes at the origin before game places and turns it.
    rig.root.position.set(2.8, .045, 6.05); rig.root.rotation.y = -2.1;
    rig.update(1 / 60, { moving: false, speed: 0 });
    assertStanding('first frame after spawn'); rig.settle(1.5); assertStanding('settled spawn');
    // A mount/dismount can move less than the teleport threshold horizontally.
    // Its vertical seat offset must not leave idle feet in the pedal pose.
    rig.root.position.x += .55; rig.root.position.y += .54; rig.root.rotation.y += .4;
    rig.settle(1.5, { riding: true });
    rig.root.position.x += .55; rig.root.position.y -= .54;
    rig.settle(2); assertStanding('idle after dismount'); rig.dispose();
  });

  test('captured walk and run tracks drive the actual PMX limbs and weighted D chains', (t) => {
    const rig = fixture(); rig.settle(); const baseline = rig.sample();
    let maximumRms = 0, maximumVertex = 0, maximumCaptureError = 0;
    for (const [name, speed] of [['walk', 1.45], ['run', 3.15]]) {
      const cycle = capturedCycles[name], running = name === 'run';
      assert.ok(cycle.frames.length >= 32 && cycle.duration > .3 && cycle.distance > .5, `${name}: missing usable capture cycle`);
      for (const frame of cycle.frames) {
        for (const key of ['leftThigh', 'leftShin', 'rightThigh', 'rightShin', 'leftArm', 'leftForearm', 'rightArm', 'rightForearm']) {
          assert.ok(frame[key]?.length === 3 && frame[key].every(Number.isFinite), `${name}: invalid ${key} direction track`);
          assert.ok(Math.abs(new THREE.Vector3(...frame[key]).length() - 1) < .00001, `${name}: non-unit capture direction`);
        }
        assert.ok(Math.abs(frame.bob) <= .035, `${name}: capture body bob must remain centimetres`);
      }
      // Settle the walk/run blend, then compare actual joint directions against
      // several phases of the included source data, not an invented sine gait.
      for (let i = 0; i < 90; i++) rig.update(1 / 60, { moving: true, speed, running });
      for (let frame = 0; frame < 90; frame++) {
        rig.update(1 / 60, { moving: true, speed, running });
        const debug = rig.motion.getDebugState(); assert.match(debug.source, /CMU.*35_01.*35_17/);
        const delta = difference(baseline, rig.sample()); maximumRms = Math.max(maximumRms, delta.rms); maximumVertex = Math.max(maximumVertex, delta.maximum);
        for (const [key, parent, child] of [['leftThigh', '左足', '左ひざ'], ['leftShin', '左ひざ', '左足首'], ['rightThigh', '右足', '右ひざ'], ['rightShin', '右ひざ', '右足首']]) {
          const actual = localBonePosition(rig, child).sub(localBonePosition(rig, parent)).normalize();
          maximumCaptureError = Math.max(maximumCaptureError, actual.angleTo(captureDirection(cycle, key, debug.phase)));
        }
        for (const side of ['左', '右']) for (const part of ['足', 'ひざ', '足首']) {
          const control = rig.bones[side + part], deform = rig.bones[side + part + 'D'];
          assert.ok(control.getWorldPosition(new THREE.Vector3()).distanceTo(deform.getWorldPosition(new THREE.Vector3())) < .0002, `${side + part}D descendants must be updated after grants`);
          assert.ok(control.getWorldQuaternion(new THREE.Quaternion()).angleTo(deform.getWorldQuaternion(new THREE.Quaternion())) < .001, `${side + part}D must inherit the captured control rotation`);
        }
      }
    }
    assert.ok(maximumRms > .05, `Weighted leg RMS excursion only ${maximumRms.toFixed(4)} m`);
    assert.ok(maximumVertex > .15, `Weighted leg maximum excursion only ${maximumVertex.toFixed(4)} m`);
    assert.ok(maximumCaptureError < .035, `PMX thigh/shin direction diverges from the selected capture by ${THREE.MathUtils.radToDeg(maximumCaptureError).toFixed(2)} degrees`);
    t.diagnostic(`Weighted leg excursion: RMS ${maximumRms.toFixed(4)} m, maximum vertex ${maximumVertex.toFixed(4)} m`);
    t.diagnostic(`Maximum actual limb/source direction error: ${THREE.MathUtils.radToDeg(maximumCaptureError).toFixed(4)} degrees`);
    rig.dispose();
  });

  test('stopping settles into a stable idle without accumulating grant rotations', (t) => {
    const rig = fixture(); rig.settle();
    for (let i = 0; i < 90; i++) rig.update(1 / 60, { moving: true, speed: 1.6 });
    rig.settle(3); const initial = rig.sample();
    let maximumRms = 0;
    for (let i = 0; i < 120; i++) { rig.update(1 / 60, { moving: false, speed: 0 }); maximumRms = Math.max(maximumRms, difference(initial, rig.sample()).rms); }
    assert.ok(maximumRms < .012, `Idle leg drift after settling is ${maximumRms.toFixed(4)} m`);
    t.diagnostic(`Settled idle RMS drift: ${maximumRms.toFixed(6)} m`);
    finiteRig(rig); rig.dispose();
  });

  test('standing height remains upright during captured locomotion and sole correction stays within three centimetres', (t) => {
    const bind = fixture({ animated: false }), bindHip = hipHeight(bind); bind.dispose();
    const rig = fixture(); rig.settle(); const standingHip = hipHeight(rig);
    assert.ok(Math.abs(standingHip - bindHip) < .035, 'Idle must retain the original model standing hip height');
    let lowestHip = standingHip, maximumCorrection = 0, lowestPelvis = 0;
    for (const [speed, running] of [[1.45, false], [3.15, true]]) for (let i = 0; i < 180; i++) {
      rig.update(1 / 60, { moving: true, speed, running });
      const debug = rig.motion.getDebugState(); lowestHip = Math.min(lowestHip, hipHeight(rig));
      maximumCorrection = Math.max(maximumCorrection, Math.abs(debug.groundCorrection)); lowestPelvis = Math.min(lowestPelvis, debug.pelvis);
      assert.ok(Number.isFinite(debug.groundCorrection), 'Sole correction is not finite');
    }
    assert.ok(standingHip - lowestHip < .060, `Locomotion lowered the actual hips ${(standingHip - lowestHip).toFixed(4)} m into a crouch`);
    assert.ok(lowestPelvis >= -.060, `The visual root is being forced down ${(-lowestPelvis).toFixed(4)} m`);
    assert.ok(maximumCorrection <= .03001, `Sole correction exceeded its 3 cm cap: ${maximumCorrection}`);
    t.diagnostic(`Actual hip drop ${(standingHip - lowestHip).toFixed(4)} m; minimum pelvis ${lowestPelvis.toFixed(4)} m; maximum sole correction ${maximumCorrection.toFixed(4)} m`);
    rig.dispose();
  });

  test('walking intent against a wall does not advance the gait without accepted world travel', () => {
    const rig = fixture(); rig.settle(); const phase = rig.motion.getDebugState().phase;
    for (let i = 0; i < 120; i++) rig.update(1 / 60, { moving: true, speed: 2.35 }, { travel: false });
    const delta = Math.abs(rig.motion.getDebugState().phase - phase);
    assert.ok(delta < .0001, `Blocked movement advanced gait phase by ${delta} cycles`);
    finiteRig(rig); rig.dispose();
  });

  test('captured cycle seams, starts, stops and a moving turn remain continuous', (t) => {
    for (const [name, cycle] of Object.entries(capturedCycles)) for (const key of Object.keys(cycle.frames[0]).filter(key => key !== 'body' && key !== 'bob')) {
      const seam = new THREE.Vector3(...cycle.frames[0][key]).angleTo(new THREE.Vector3(...cycle.frames.at(-1)[key]));
      assert.ok(seam < .25, `${name} ${key} has an abrupt source-cycle seam`);
    }
    const rig = fixture(); rig.settle(); let previous = rig.sample(), maximumStep = 0, worstFrame = 0;
    for (let i = 0; i < 240; i++) {
      const moving = i < 120 || i >= 180;
      if (i >= 60 && i < 120) rig.root.rotation.y = (i - 60) / 60 * Math.PI / 2;
      rig.update(1 / 60, { moving, speed: moving ? 1.45 : 0 });
      const next = rig.sample(), delta = difference(previous, next);
      if (delta.maximum > maximumStep) { maximumStep = delta.maximum; worstFrame = i; }
      previous = next;
    }
    assert.ok(maximumStep < .105, `Leg vertex moved ${maximumStep.toFixed(4)} m in one 60 Hz frame (${worstFrame})`);
    t.diagnostic(`Maximum 60 Hz leg vertex step: ${maximumStep.toFixed(6)} m at frame ${worstFrame}`);
    let runStep = 0, wraps = 0, phase = rig.motion.getDebugState().phase;
    const runVelocity = new THREE.Vector3(0, 0, 1.45), requestedRun = new THREE.Vector3(0, 0, 3.15);
    for (let i = 0; i < 180; i++) {
      // Exercise the same accepted acceleration as game.js, rather than
      // teleporting from walking to twice its velocity in a single frame.
      advanceVelocity(runVelocity, requestedRun, 1 / 60, { running: true });
      rig.update(1 / 60, { moving: true, speed: runVelocity.length(), running: true });
      const next = rig.sample(), nextPhase = rig.motion.getDebugState().phase;
      if (nextPhase < phase) wraps++; phase = nextPhase;
      runStep = Math.max(runStep, difference(previous, next).maximum); previous = next;
    }
    assert.ok(wraps >= 3, 'The run check must cross several real cycle boundaries');
    assert.ok(runStep < .12, `Run cycle/blend discontinuity moved a vertex ${runStep.toFixed(4)} m in one frame`);
    t.diagnostic(`Maximum run-cycle vertex step: ${runStep.toFixed(6)} m across ${wraps} loop seams`);
    rig.dispose();
  });

  test('running, jumping, umbrella, drinking and cycling keep skinning and metre-sized hand sockets valid', (t) => {
    const rig = fixture(); rig.settle();
    const scenarios = [
      { moving: true, speed: .3 },
      { moving: true, running: true, speed: 3.15 },
      { moving: true, running: true, speed: 2.3, jumping: true, grounded: false },
      { moving: true, speed: 1.45, umbrella: true },
      { moving: false, speed: 0, action: 'drink' },
      { moving: false, speed: 0, action: 'eat' },
      { moving: true, speed: 3, riding: true }
    ];
    let maximumHandStep = 0;
    const runElbowAngles = { 左: [], 右: [] };
    for (const state of scenarios) {
      let previousHand = rig.socket();
      for (let frame = 0; frame < 75; frame++) {
        rig.root.position.y = state.jumping ? Math.sin(frame / 75 * Math.PI) * .35 : 0;
        rig.update(1 / 60, state);
        const currentHand = rig.socket(); maximumHandStep = Math.max(maximumHandStep, currentHand.distanceTo(previousHand)); previousHand = currentHand;
        if (state.running && !state.jumping && frame >= 30) {
          for (const side of ['左', '右']) {
            const shoulder = rig.bones[side + '腕'].getWorldPosition(new THREE.Vector3());
            const elbow = rig.bones[side + 'ひじ'].getWorldPosition(new THREE.Vector3());
            const wrist = rig.bones[side + '手首'].getWorldPosition(new THREE.Vector3());
            runElbowAngles[side].push(THREE.MathUtils.radToDeg(shoulder.sub(elbow).angleTo(wrist.sub(elbow))));
          }
        }
        if (frame % 15 === 0) finiteRig(rig);
        for (const socket of Object.values(rig.sockets)) {
          const worldScale = socket.getWorldScale(new THREE.Vector3());
          assert.ok(worldScale.distanceTo(new THREE.Vector3(1, 1, 1)) < .001, 'Held props must remain metre-sized');
          assert.ok(socket.getWorldQuaternion(new THREE.Quaternion()).angleTo(rig.root.getWorldQuaternion(new THREE.Quaternion())) < .002, 'Hand socket must remain upright relative to avatar heading');
        }
      }
    }
    for (const side of ['左', '右']) {
      const angles = runElbowAngles[side];
      assert.ok(angles.length >= 30, 'The real running pose needs a settled gait sample');
      assert.ok(Math.min(...angles) > 20 && Math.max(...angles) < 175, `${side} captured running elbow collapsed or locked straight`);
      t.diagnostic(`${side} captured running elbow range: ${Math.min(...angles).toFixed(2)}–${Math.max(...angles).toFixed(2)} degrees`);
    }
    assert.ok(maximumHandStep < .16, `Action transition teleported the hand ${maximumHandStep.toFixed(4)} m in one frame`);
    t.diagnostic(`Maximum 60 Hz action hand step: ${maximumHandStep.toFixed(6)} m`);
    rig.dispose();
  });

  test('equal travel at 30, 60 and 120 Hz gives closely matching skinned poses', (t) => {
    function simulate(fps) {
      const rig = fixture(), result = [];
      for (let i = 0; i < fps * 4; i++) {
        const t = i / fps, moving = t < 2.5 || t >= 3.2;
        rig.update(1 / fps, { moving, speed: moving ? 1.45 : 0 });
        if ((i + 1) % (fps / 10) === 0) result.push(rig.sample());
      }
      rig.dispose(); return result;
    }
    const at30 = simulate(30), at60 = simulate(60), at120 = simulate(120);
    const compare = (a, b) => Math.max(...a.map((frame, i) => difference(frame, b[i]).rms));
    const error30 = compare(at30, at60), error120 = compare(at60, at120);
    assert.ok(error30 < .025, `30/60 Hz maximum skin-pose RMS difference ${error30.toFixed(4)} m`);
    assert.ok(error120 < .015, `60/120 Hz maximum skin-pose RMS difference ${error120.toFixed(4)} m`);
    t.diagnostic(`Maximum skin-pose RMS difference: 30/60 Hz ${error30.toFixed(6)} m; 60/120 Hz ${error120.toFixed(6)} m`);
  });
});
