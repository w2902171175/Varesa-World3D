import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as THREE from 'three';
import { createPhysics } from '../src/world-physics.js';
import { createCameraFollow } from '../src/camera-follow.js';

const indoor = { inside: true, doorOpen: true, backDoorOpen: true };
const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const unobstructed = { cameraClip: (_target, desired) => desired.clone() };

function assertSafe(physics, target, result, preferredYaw, flags = {}) {
  assert.ok([...result.position.toArray(), result.effectiveYaw, result.offset].every(Number.isFinite));
  assert.ok(physics.cameraClip(target, result.position, flags).distanceTo(result.position) < 0.00001,
    'Rendered camera must already have a clear target-to-camera segment');
  assert.ok(Math.abs(angleDelta(result.effectiveYaw, preferredYaw)) < 0.00001,
    'Collision must never choose a different orbit yaw');
  assert.ok(Math.abs(result.offset) < 0.00001, 'There must be no automatic angular avoidance offset');
  if (flags.inside) assert.ok(result.position.y <= 3.620001);
  const horizontal = vector(result.position.x - target.x, 0, result.position.z - target.z);
  const preferred = vector(Math.sin(preferredYaw), 0, Math.cos(preferredYaw));
  assert.ok(horizontal.dot(preferred) >= -0.00001, 'The camera must not swap to the opposite side of the player');
}

describe('User-controlled orbit and retractable camera arm', () => {
  test('the former shelf-route regression preserves the requested yaw on both sides of the 2 cm change', () => {
    const physics = createPhysics();
    const follow = createCameraFollow({ physics });
    const target = vector(0.7, 1.56, -4.07);
    let result = follow.solve(target, -3, 0.33, 3.3, 1 / 60, indoor, { snap: true });
    assertSafe(physics, target, result, -3, indoor);
    let previous = result.position.clone();
    for (let frame = 0; frame < 180; frame++) {
      target.z = Math.floor(frame / 15) % 2 ? -4.07 : -4.05;
      result = follow.solve(target, -3, 0.33, 3.3, 1 / 60, indoor);
      assert.ok(result.position.distanceTo(previous) < 0.5, 'A small route change must not cause a multi-metre sideways swing');
      assertSafe(physics, target, result, -3, indoor);
      previous.copy(result.position);
    }
  });

  test('yaw and pitch remain exactly user-controlled in open space, including large turns', () => {
    const follow = createCameraFollow({ physics: unobstructed });
    const target = vector(0, 1.3, 6);
    for (const yaw of [0, 0.8, Math.PI, -2.4, -0.6, 12.3]) {
      const pitch = 0.25;
      const result = follow.solve(target, yaw, pitch, 4.5, 1 / 60, {}, { manual: true });
      const expected = vector(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      assert.ok(result.position.clone().sub(target).normalize().distanceTo(expected) < 0.00001);
      assertSafe(unobstructed, target, result, yaw);
    }
  });

  test('side glass retracts the arm immediately on its preferred ray instead of orbiting around the shop', () => {
    const physics = createPhysics();
    const follow = createCameraFollow({ physics });
    const target = vector(4.3, 1.7, -3);
    const open = follow.solve(target, Math.PI / 2, 0.15, 4.5, 1 / 60, {}, { snap: true });
    assert.ok(open.position.distanceTo(target) > 4.4);
    const blocked = follow.solve(target, -Math.PI / 2, 0.15, 4.5, 1 / 60);
    assert.ok(blocked.position.distanceTo(target) < 0.5, 'First blocked frame must retract before the glass');
    assert.ok(blocked.position.x > 3.95);
    assertSafe(physics, target, blocked, -Math.PI / 2);
  });

  test('the arm restores distance smoothly and monotonically when the user turns toward clear space', () => {
    const physics = createPhysics();
    const follow = createCameraFollow({ physics });
    const target = vector(4.3, 1.7, -3);
    const blocked = follow.solve(target, -Math.PI / 2, 0.15, 4.5, 1 / 60, {}, { snap: true });
    let previousLength = blocked.position.distanceTo(target);
    for (let frame = 0; frame < 120; frame++) {
      const result = follow.solve(target, Math.PI / 2, 0.15, 4.5, 1 / 60);
      const length = result.position.distanceTo(target);
      assert.ok(length >= previousLength - 0.00001 && length <= 4.50001);
      if (frame === 0) assert.ok(length < 1, 'Clearance must not instantly expand the camera to its full radius');
      assertSafe(physics, target, result, Math.PI / 2);
      previousLength = length;
    }
    assert.ok(previousLength > 4.49);
  });

  test('a newly introduced obstacle contracts the actual rendered arm on the same frame', () => {
    const physics = createPhysics();
    const follow = createCameraFollow({ physics });
    const target = vector(0, 1.3, 6);
    follow.solve(target, 0, 0, 4.5, 1 / 60, {}, { snap: true });
    const flags = { dynamicColliders: [{
      id: 'newly-parked-obstacle', minX: -0.8, maxX: 0.8, minZ: 7.5, maxZ: 8, minY: 0.045, maxY: 2,
    }] };
    const result = follow.solve(target, 0, 0, 4.5, 1 / 60, flags);
    assert.ok(result.position.z < 7.38);
    assert.ok(result.position.distanceTo(target) < 1.38);
    assertSafe(physics, target, result, 0, flags);
  });

  test('outward recovery is consistent at 15, 30, and 60 fps', () => {
    const endings = [];
    for (const fps of [15, 30, 60]) {
      let blocked = true;
      const physics = { cameraClip: (target, desired) => {
        const ray = desired.clone().sub(target);
        if (blocked && ray.length() > 0.6) ray.setLength(0.6);
        return target.clone().add(ray);
      } };
      const follow = createCameraFollow({ physics });
      const target = vector(0, 1.3, 0);
      follow.solve(target, 0.4, 0.2, 4.5, 1 / fps, {}, { snap: true });
      blocked = false;
      let result;
      for (let frame = 0; frame < fps; frame++) {
        result = follow.solve(target, 0.4, 0.2, 4.5, 1 / fps);
        assertSafe(physics, target, result, 0.4);
      }
      endings.push(result.position.distanceTo(target));
    }
    for (const length of endings) assert.ok(Math.abs(length - endings[0]) < 0.00001);
    assert.ok(endings[0] > 4.48 && endings[0] < 4.5);
  });

  test('player movement advects the camera immediately without lateral follow lag', () => {
    const follow = createCameraFollow({ physics: unobstructed });
    const target = vector(0, 1.3, 0);
    const first = follow.solve(target, 0.4, 0.2, 4.5, 1 / 60, {}, { snap: true });
    const relative = first.position.clone().sub(target);
    for (let frame = 0; frame < 60; frame++) {
      target.add(vector(0.06, 0.003, -0.04));
      const result = follow.solve(target, 0.4, 0.2, 4.5, 1 / 60);
      assert.ok(result.position.clone().sub(target).distanceTo(relative) < 0.00001);
      assertSafe(unobstructed, target, result, 0.4);
    }
  });

  test('floor clearance and indoor height limits preserve the orbit yaw', () => {
    const physics = createPhysics();
    const follow = createCameraFollow({ physics });
    const lowTarget = vector(0, 1.3, 6);
    const low = follow.solve(lowTarget, 0, -0.35, 9, 1 / 30, {}, { snap: true });
    assert.ok(low.position.y >= physics.floorAt(low.position.x, low.position.z) + 0.12 - 0.00001);
    assertSafe(physics, lowTarget, low, 0);
    const target = vector(0.7, 1.56, -0.5);
    for (let frame = 0; frame < 90; frame++) {
      const result = follow.solve(target, 0, frame < 45 ? 1.1 : -0.35, 6.3, 1 / 30, indoor);
      assertSafe(physics, target, result, 0, indoor);
    }
  });

  test('reset and snap set a fresh safe arm, and returned positions do not alias controller state', () => {
    const follow = createCameraFollow({ physics: unobstructed });
    const target = vector(0, 1.3, 6);
    const first = follow.solve(target, 0.2, 0.3, 4.5, 1 / 60, {}, { snap: true });
    const expected = first.position.clone();
    first.position.set(999, 999, 999);
    assert.ok(follow.solve(target, 0.2, 0.3, 4.5, 1 / 60).position.distanceTo(expected) < 0.00001);
    follow.reset();
    const restarted = follow.solve(target, -0.5, 0.3, 3, 1 / 60);
    assert.ok(Math.abs(restarted.position.distanceTo(target) - 3) < 0.00001);
    assertSafe(unobstructed, target, restarted, -0.5);
    const snapped = follow.solve(target, 0.7, 0.3, 7, 1 / 60, {}, { snap: true });
    assert.ok(Math.abs(snapped.position.distanceTo(target) - 7) < 0.00001);
  });

  test('malformed numeric input and zero-length updates remain finite', () => {
    const physics = createPhysics();
    const follow = createCameraFollow({ physics });
    const first = follow.solve({ x: NaN, y: Infinity, z: NaN }, NaN, NaN, Infinity, NaN);
    assert.ok([...first.position.toArray(), first.effectiveYaw, first.offset].every(Number.isFinite));
    const target = vector(0, 1.3, 6);
    const result = follow.solve(target, 0, 0.33, 6, 0);
    assertSafe(physics, target, result, 0);
  });
});
