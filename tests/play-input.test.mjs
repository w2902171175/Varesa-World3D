import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPlayInput } from '../src/play-input.js';

describe('Latched sprint input', () => {
  test('one Shift press latches sprint through key releases until the next physical press', () => {
    const input = createPlayInput();
    assert.equal(input.sprinting, false);
    assert.equal(input.pressShift(), true);
    assert.equal(input.sprinting, true);
    input.releaseShift('ShiftLeft');
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp']) {
      assert.equal(input.pressShift(code), false, 'Movement keys cannot change the sprint mode');
      input.releaseShift(code);
      assert.equal(input.sprinting, true, 'Stopping movement must not unlatch sprint');
    }
    assert.equal(input.pressShift('ShiftLeft'), true);
    assert.equal(input.sprinting, false);
    input.releaseShift('ShiftLeft');
    assert.equal(input.sprinting, false);
  });

  test('auto-repeat and duplicate keydown events do not toggle again', () => {
    const input = createPlayInput();
    assert.equal(input.pressShift('ShiftLeft', true), false, 'A repeated event alone must not turn sprint on');
    assert.equal(input.sprinting, false);
    input.releaseShift('ShiftLeft');
    assert.equal(input.pressShift('ShiftLeft', false), true);
    for (let i = 0; i < 8; i++) assert.equal(input.pressShift('ShiftLeft', true), false);
    assert.equal(input.pressShift('ShiftLeft', false), false, 'Duplicate down events need a release before another toggle');
    assert.equal(input.sprinting, true);
    input.releaseShift('ShiftLeft');
    assert.equal(input.pressShift('ShiftRight', false), true);
    assert.equal(input.sprinting, false);
  });

  test('holding both Shift keys produces one toggle and waits until both are released', () => {
    const input = createPlayInput();
    assert.equal(input.pressShift('ShiftLeft'), true);
    assert.equal(input.pressShift('ShiftRight'), false);
    assert.equal(input.sprinting, true);
    input.releaseShift('ShiftLeft');
    assert.equal(input.pressShift('ShiftLeft'), false, 'The second Shift is still physically held');
    input.releaseShift('ShiftLeft'); input.releaseShift('ShiftRight');
    assert.equal(input.pressShift('ShiftRight'), true);
    assert.equal(input.sprinting, false);
  });
});

describe('Mouse look without a held mouse button', () => {
  test('ordinary pointer coordinates produce movement after one baseline sample, with no buttons parameter', () => {
    const input = createPlayInput();
    assert.equal(input.lookEnabled, true);
    assert.equal(input.pointerDelta(300, 200), null);
    assert.deepEqual(input.pointerDelta(313.5, 194.25), { x: 13.5, y: -5.75 });
    assert.deepEqual(input.pointerDelta(309, 208), { x: -4.5, y: 13.75 });
  });

  test('UI suspension suppresses look and resuming takes a fresh baseline instead of jumping', () => {
    const input = createPlayInput();
    input.pressShift(); input.releaseShift('ShiftLeft');
    input.pointerDelta(100, 100);
    assert.deepEqual(input.pointerDelta(110, 104), { x: 10, y: 4 });
    input.suspendLook();
    assert.equal(input.lookEnabled, false);
    assert.equal(input.pointerDelta(800, 650), null);
    assert.equal(input.lockedDelta(250, -100), null);
    assert.equal(input.sprinting, true, 'Opening a panel only suspends looking, not the selected sprint mode');
    input.resumeLook();
    assert.equal(input.lookEnabled, true);
    assert.equal(input.pointerDelta(920, 740), null);
    assert.deepEqual(input.pointerDelta(925, 733), { x: 5, y: -7 });
    assert.equal(input.lockedDelta(200, -200), null, 'The first resumed locked sample must also be discarded');
    assert.deepEqual(input.lockedDelta(2, -3), { x: 2, y: -3 });
  });

  test('pointer reset discards stale absolute positions and the first locked relative sample', () => {
    const input = createPlayInput();
    input.pointerDelta(10, 20); input.pointerDelta(12, 24);
    assert.equal(input.lockedDelta(500, 500), null);
    assert.deepEqual(input.lockedDelta(-6, 4), { x: -6, y: 4 });
    input.resetPointer();
    assert.equal(input.pointerDelta(-700, 900), null);
    assert.deepEqual(input.pointerDelta(-698, 905), { x: 2, y: 5 });
    assert.equal(input.lockedDelta(-1000, 1000), null);
    assert.deepEqual(input.lockedDelta(.5, -1.25), { x: .5, y: -1.25 });
  });

  test('non-finite and non-numeric input is rejected without poisoning a valid baseline', () => {
    const input = createPlayInput();
    const invalid = [NaN, Infinity, -Infinity, undefined, null, '12'];
    for (const value of invalid) {
      assert.equal(input.pointerDelta(value, 10), null);
      assert.equal(input.pointerDelta(10, value), null);
      assert.equal(input.lockedDelta(value, 1), null);
      assert.equal(input.lockedDelta(1, value), null);
    }
    assert.equal(input.pointerDelta(50, 60), null);
    assert.equal(input.lockedDelta(100, 100), null);
    for (const value of invalid) {
      assert.equal(input.pointerDelta(value, 62), null);
      assert.equal(input.lockedDelta(1, value), null);
    }
    assert.deepEqual(input.pointerDelta(53, 58), { x: 3, y: -2 });
    assert.deepEqual(input.lockedDelta(-2, 5), { x: -2, y: 5 });
  });
});

describe('Temporary Alt cursor mode', () => {
  test('holding Alt suppresses absolute and relative look, and release establishes fresh baselines', () => {
    const input = createPlayInput();
    assert.equal(input.cursorHeld, false);
    input.pointerDelta(100, 100);
    assert.deepEqual(input.pointerDelta(106, 103), { x: 6, y: 3 });
    input.lockedDelta(0, 0);
    assert.deepEqual(input.lockedDelta(3, -2), { x: 3, y: -2 });
    assert.equal(input.pressAlt(), true);
    assert.equal(input.cursorHeld, true);
    assert.equal(input.lookEnabled, false);
    assert.equal(input.pointerDelta(900, 700), null);
    assert.equal(input.lockedDelta(350, -200), null);
    assert.equal(input.releaseAlt('AltLeft'), true);
    assert.equal(input.cursorHeld, false);
    assert.equal(input.lookEnabled, true);
    assert.equal(input.pointerDelta(1000, 800), null, 'Releasing Alt must not apply cursor travel to the view');
    assert.deepEqual(input.pointerDelta(1004, 795), { x: 4, y: -5 });
    assert.equal(input.lockedDelta(800, -600), null, 'The first relative sample after release is discarded too');
    assert.deepEqual(input.lockedDelta(-1, 2), { x: -1, y: 2 });
  });

  test('duplicate and two-key Alt presses change cursor mode only on the first press and last release', () => {
    const input = createPlayInput();
    for (const code of ['KeyW', 'ControlLeft', 'ShiftLeft', '', null]) {
      assert.equal(input.pressAlt(code), false);
      assert.equal(input.releaseAlt(code), false);
    }
    assert.equal(input.cursorHeld, false);
    assert.equal(input.pressAlt('AltLeft'), true);
    for (let repeat = 0; repeat < 5; repeat++) assert.equal(input.pressAlt('AltLeft'), false);
    assert.equal(input.pressAlt('AltRight'), false, 'A second held Alt does not enter cursor mode twice');
    assert.equal(input.releaseAlt('AltLeft'), false, 'The right Alt still keeps cursor mode active');
    assert.equal(input.releaseAlt('AltLeft'), false, 'Releasing a key that is not held is not a mode change');
    assert.equal(input.cursorHeld, true);
    assert.equal(input.lookEnabled, false);
    assert.equal(input.releaseAlt('AltRight'), true);
    assert.equal(input.releaseAlt('AltRight'), false);
    assert.equal(input.cursorHeld, false);
    assert.equal(input.lookEnabled, true);
  });

  test('releasing Alt while a panel has suspended look does not resume the paused view', () => {
    const input = createPlayInput();
    input.pressAlt('AltLeft'); input.suspendLook();
    assert.equal(input.cursorHeld, true, 'Opening a panel must not forget a physically held Alt');
    assert.equal(input.releaseAlt('AltLeft'), true);
    assert.equal(input.cursorHeld, false);
    assert.equal(input.lookEnabled, false);
    assert.equal(input.pointerDelta(450, 500), null);
    assert.equal(input.lockedDelta(5, 4), null);
    input.resumeLook();
    assert.equal(input.lookEnabled, true);
    assert.equal(input.pointerDelta(800, 900), null);
    assert.deepEqual(input.pointerDelta(804, 902), { x: 4, y: 2 });
  });

  test('resuming the base view while Alt is still held keeps both look paths suppressed', () => {
    const input = createPlayInput();
    input.pressAlt('AltRight'); input.suspendLook(); input.resumeLook();
    assert.equal(input.cursorHeld, true);
    assert.equal(input.lookEnabled, false);
    assert.equal(input.pointerDelta(200, 250), null);
    assert.equal(input.lockedDelta(-20, 30), null);
    assert.equal(input.releaseAlt('AltRight'), true);
    assert.equal(input.lookEnabled, true);
    assert.equal(input.pointerDelta(750, 800), null);
    assert.deepEqual(input.pointerDelta(752, 797), { x: 2, y: -3 });
  });

  test('clearing held Alt on blur resets pointer state, respects suspension, and preserves latched sprint', () => {
    const input = createPlayInput();
    input.pressShift(); input.releaseShift('ShiftLeft');
    input.pointerDelta(40, 50); input.pointerDelta(43, 52);
    input.pressAlt('AltLeft'); input.pressAlt('AltRight'); input.clearAlt();
    assert.equal(input.cursorHeld, false);
    assert.equal(input.lookEnabled, true);
    assert.equal(input.pointerDelta(600, 700), null);
    assert.deepEqual(input.pointerDelta(605, 701), { x: 5, y: 1 });
    input.pressAlt('AltRight'); input.suspendLook(); input.clearAlt();
    assert.equal(input.cursorHeld, false);
    assert.equal(input.lookEnabled, false, 'Clearing Alt must not undo blur or panel suspension');
    assert.equal(input.releaseAlt('AltRight'), false, 'A late keyup after blur must not reactivate look');
    assert.equal(input.lockedDelta(100, 100), null);
    assert.equal(input.sprinting, true, 'Temporary cursor handling must preserve the chosen sprint mode');
    input.resumeLook();
    assert.equal(input.lockedDelta(50, 50), null);
    assert.deepEqual(input.lockedDelta(2, -4), { x: 2, y: -4 });
    assert.equal(input.pressShift(), true);
    assert.equal(input.sprinting, false);
  });
});

describe('Native Alt modifier reconciliation', () => {
  test('Alt reported by an event remains independent of physical left and right key events', () => {
    const input = createPlayInput();
    // The user pressed Alt outside the window, so only event.altKey is known.
    assert.equal(input.syncAlt(true), true);
    assert.equal(input.syncAlt(true), false);
    assert.equal(input.cursorHeld, true);
    assert.equal(input.lookEnabled, false);
    for (const code of ['AltRight', 'AltLeft']) {
      assert.equal(input.pressAlt(code), false);
      assert.equal(input.releaseAlt(code), false, 'Releasing a physical key cannot clear the independent event modifier');
      assert.equal(input.cursorHeld, true);
    }
    // A real keyup is processed as releaseAlt(code), then syncAlt(event.altKey).
    assert.equal(input.syncAlt(false), true);
    assert.equal(input.cursorHeld, false);
    assert.equal(input.lookEnabled, true);
    assert.equal(input.pointerDelta(700, 550), null);
    assert.deepEqual(input.pointerDelta(704, 548), { x: 4, y: -2 });
    assert.equal(input.pressAlt('AltRight'), true, 'No synthetic left-Alt entry may survive synchronization');
    assert.equal(input.releaseAlt('AltRight'), true);
    assert.equal(input.cursorHeld, false);
  });

  test('an event with Alt released clears missed keyups and cannot undo an Esc pause', () => {
    const input = createPlayInput();
    input.pointerDelta(30, 40); input.pointerDelta(35, 43);
    input.lockedDelta(0, 0); input.lockedDelta(2, 1);
    input.pressAlt('AltLeft'); input.pressAlt('AltRight');
    assert.equal(input.syncAlt(true), false);
    // Neither physical keyup reached the window, but a later mouse event is clear.
    assert.equal(input.syncAlt(false), true);
    assert.equal(input.releaseAlt('AltLeft'), false);
    assert.equal(input.releaseAlt('AltRight'), false);
    assert.equal(input.pointerDelta(950, 760), null);
    assert.deepEqual(input.pointerDelta(953, 755), { x: 3, y: -5 });
    assert.equal(input.lockedDelta(600, -400), null);
    assert.deepEqual(input.lockedDelta(-2, 3), { x: -2, y: 3 });
    input.pressAlt('AltRight'); input.syncAlt(true); input.suspendLook();
    assert.equal(input.releaseAlt('AltRight'), false);
    assert.equal(input.syncAlt(false), true);
    assert.equal(input.syncAlt(false), false);
    assert.equal(input.cursorHeld, false);
    assert.equal(input.lookEnabled, false, 'Native modifier reconciliation must preserve the independent Esc pause');
    assert.equal(input.pointerDelta(100, 100), null);
    assert.equal(input.lockedDelta(8, -6), null);
    input.resumeLook();
    assert.equal(input.pointerDelta(120, 115), null);
    assert.deepEqual(input.pointerDelta(121, 117), { x: 1, y: 2 });
  });
});
