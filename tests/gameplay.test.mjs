import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPhysics } from '../src/world-physics.js';
import { createStoreEconomy } from '../src/interactions.js';

const point = (x, z, y = 0) => ({ x, y, z });
const closeTo = (actual, expected, epsilon = 0.001) => {
  assert.ok(Math.abs(actual - expected) < epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
};
const finitePoint = (position) => assert.ok(
  [position.x, position.y, position.z].every(Number.isFinite),
  `Non-finite position: ${JSON.stringify(position)}`,
);
function overlaps(position, collider, radius = 0.23) {
  const nearestX = Math.max(collider.minX, Math.min(collider.maxX, position.x));
  const nearestZ = Math.max(collider.minZ, Math.min(collider.maxZ, position.z));
  return Math.hypot(position.x - nearestX, position.z - nearestZ) < radius - 0.00001;
}
function assertClear(physics, position, flags = {}, radius = 0.23) {
  finitePoint(position);
  const collisions = physics.getColliders(flags).filter((collider) => overlaps(position, collider, radius));
  assert.deepEqual(collisions.map((collider) => collider.id), [], `Position ${position.x},${position.z} penetrates scenery`);
}
const droppedBox = (id = 'dropped-crate') => ({
  id, minX: -0.4, maxX: 0.4, minZ: 6.1, maxZ: 6.9, minY: 0.045, maxY: 1.2,
});

describe('Convenience-store world collision', () => {
  test('closed automatic doors stop entry even during a sprint', () => {
    const physics = createPhysics();
    const result = physics.move(point(1.65, 2.8), point(0, -3));
    closeTo(result.z, 1.83);
    assertClear(physics, result);
  });

  test('open front doors admit the character and automatically climb the sidewalk and shop floor', () => {
    const physics = createPhysics();
    const result = physics.move(point(1.65, 4.3), point(0, -3.4), { doorOpen: true });
    closeTo(result.x, 1.65);
    closeTo(result.z, 0.9);
    closeTo(result.y, 0.49);
    closeTo(physics.floorAt(1.65, 2.5), 0.30);
    closeTo(physics.floorAt(7, 7), 0.045);
    assertClear(physics, result, { doorOpen: true });
  });

  test('the narrowed doorway still blocks its jamb and the adjacent glass', () => {
    const physics = createPhysics();
    const flags = { doorOpen: true };
    const jamb = physics.move(point(0.65, 2.8), point(0, -3), flags);
    assert.ok(jamb.z > 1.8, 'The left jamb must remain solid beside the clear doorway');
    const glass = physics.move(point(-1.8, 2.6), point(0, -20), flags);
    closeTo(glass.z, 1.85);
    const side = physics.move(point(5, -3), point(-3, 0), flags);
    closeTo(side.x, 4.06);
    assertClear(physics, glass, flags);
    assertClear(physics, side, flags);
  });

  test('rear service-door state is independent of the front automatic doors', () => {
    const physics = createPhysics();
    const closed = physics.move(point(2.47, -7.4), point(0, 3), { doorOpen: true });
    closeTo(closed.z, -6.02);
    const open = physics.move(point(2.47, -6.9), point(0, 2), { backDoorOpen: true });
    closeTo(open.z, -4.9);
    closeTo(open.y, 0.49);
    assertClear(physics, open, { backDoorOpen: true });
  });

  test('a complete front-to-back store route clears furniture while walls stay solid', () => {
    const physics = createPhysics();
    const flags = { doorOpen: true, backDoorOpen: true };
    let position = point(1.65, 4.3);
    for (const [x, z] of [[1.65, 0.7], [0.7, 0.7], [0.7, -4], [2.47, -4], [2.47, -6.3]]) {
      position = physics.move(position, point(x - position.x, z - position.z), flags);
      closeTo(position.x, x);
      closeTo(position.z, z);
      assertClear(physics, position, flags);
    }
    closeTo(position.y, 0.045);
  });

  test('sprinting into a shelf stops while diagonal wall contact slides', () => {
    const physics = createPhysics();
    const shelf = physics.move(point(-2.4, -2.11), point(-4, 0), { doorOpen: true });
    closeTo(shelf.x, -2.86);
    const slide = physics.move(point(5.1, -5.6), point(-1.6, -1.3), { doorOpen: true });
    assert.ok(slide.z < -6.4, 'Tangential movement should continue around the outside corner');
    assertClear(physics, slide, { doorOpen: true });
  });

  test('guardrails block crossings away from the entrance and the plinth bounds contain the capsule', () => {
    const physics = createPhysics();
    const rail = physics.move(point(-0.5, 4.4), point(0, -2), { doorOpen: true });
    closeTo(rail.z, 3.835);
    for (const direction of [[99, 99], [-99, 99], [99, -99], [-99, -99]]) {
      const end = physics.move(point(7.9, 8), point(...direction));
      assert.ok(Math.abs(end.x) + 0.23 <= physics.boundary + 0.00001);
      assert.ok(Math.abs(end.z) + 0.23 <= physics.boundary + 0.00001);
      assertClear(physics, end);
    }
  });

  test('closing a door onto a character resolves the overlap to a finite clear position', () => {
    const physics = createPhysics();
    assertClear(physics, physics.resolve(point(1.65, 1.52)));
  });

  test('a moved bicycle clears its original parking spot and blocks its new location', () => {
    const physics = createPhysics();
    const original = physics.move(point(5.12, -1.2), point(-0.7, 0));
    closeTo(original.x, 5.10);
    const bike = { ...droppedBox('relocated-bicycle'), maxY: 1.96 };
    const flags = { ignoreIds: ['parked-bicycle'], dynamicColliders: [bike] };
    const clear = physics.move(point(5.12, -1.2), point(-0.7, 0), flags);
    closeTo(clear.x, 4.42);
    closeTo(physics.move(point(0, 8), point(0, -2.5), flags).z, 7.13);
    assert.equal(physics.getColliders({ riding: true }).some((c) => c.id === 'parked-bicycle'), false);
  });

  test('carried crates leave no old obstacle and dropped crates affect movement, resolution, and camera clipping', () => {
    const physics = createPhysics();
    const crate = droppedBox();
    const flags = { ignoreIds: ['delivery-crates'], dynamicColliders: [crate] };
    closeTo(physics.move(point(-6.5, -4.7), point(0, 1.1)).z, -4.285);
    closeTo(physics.move(point(-6.5, -4.7), point(0, 1.1), flags).z, -3.6);
    closeTo(physics.move(point(0, 8), point(0, -2.5), flags).z, 7.13);
    assertClear(physics, physics.resolve(point(0, 6.5), flags), flags);
    const camera = physics.cameraClip(point(0, 7.8, 0.7), point(0, 5, 0.7), flags);
    finitePoint(camera);
    assert.ok(camera.z > 7.02);
  });

  test('Set ignores and changed dynamic transforms do not retain stale collisions', () => {
    const physics = createPhysics();
    const crate = droppedBox();
    const flags = { ignoreIds: new Set(['delivery-crates']), dynamicColliders: [crate] };
    crate.minX = 6.6;
    crate.maxX = 7.4;
    closeTo(physics.move(point(0, 8), point(0, -2.5), flags).z, 5.5);
    closeTo(physics.move(point(7, 8), point(0, -2.5), flags).z, 7.13);
    flags.ignoreIds.add('dropped-crate');
    closeTo(physics.move(point(7, 8), point(0, -2.5), flags).z, 5.5);
    const ignoredCamera = physics.cameraClip(point(7, 7.8, 0.7), point(7, 5, 0.7), flags);
    closeTo(ignoredCamera.z, 5);
  });

  test('camera rays stop at glass and roofs, pass through open doors, and remain finite', () => {
    const physics = createPhysics();
    const wall = physics.cameraClip(point(4.3, -3, 1.7), point(0, -3, 2));
    const entrance = physics.cameraClip(point(1.65, 2.3, 1.6), point(1.65, 0.6, 1.6), { doorOpen: true });
    const roof = physics.cameraClip(point(0.5, -2, 1.7), point(0.5, -2, 7), { doorOpen: true });
    assert.ok(wall.x >= 3.95);
    closeTo(entrance.z, 0.6);
    assert.ok(roof.y < 4.36);
    for (const camera of [wall, entrance, roof, physics.cameraClip(point(1, 6, 2), point(1, 6, 2))]) finitePoint(camera);
  });

  test('8,000 deterministic sprint steps never penetrate a collider or leave the base', () => {
    const physics = createPhysics();
    const flags = { doorOpen: true, backDoorOpen: true };
    let seed = 41;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    let position = point(1.65, 4.4);
    for (let step = 0; step < 8000; step++) {
      position = physics.move(position, point((random() - 0.5) * 0.82, (random() - 0.5) * 0.82), flags);
      assertClear(physics, position, flags);
      assert.ok(Math.abs(position.x) + 0.23 <= physics.boundary + 0.00001);
      assert.ok(Math.abs(position.z) + 0.23 <= physics.boundary + 0.00001);
    }
  });
});

const onigiri = { id: 'rice-1', name: '鲑鱼饭团', kind: 'onigiri', price: 158 };
const bento = { id: 'lunch-1', name: '鸡肉便当', kind: 'bento', price: 480 };
const tea = { id: 'tea-1', name: '冰绿茶', kind: 'drink', price: 140 };

describe('Store inventory and checkout', () => {
  test('picked-up unpaid food cannot be consumed or generate wrappers', () => {
    const economy = createStoreEconomy(2000);
    const item = economy.add(onigiri);
    assert.equal(economy.held(), item);
    assert.deepEqual(economy.consume(), { ok: false, reason: 'unpaid' });
    assert.equal(economy.state.basket.length, 1);
    assert.equal(economy.state.inventory.length, 0);
    assert.equal(economy.state.wrappers, 0);
    assert.equal(economy.state.yen, 2000);
  });

  test('checkout charges the exact basket total and issues a matching receipt', () => {
    const economy = createStoreEconomy(2000);
    const items = [economy.add(onigiri), economy.add(bento), economy.add(tea)];
    const receipt = economy.checkout();
    assert.equal(receipt.ok, true);
    assert.equal(receipt.total, 778);
    assert.equal(receipt.balance, 1222);
    assert.equal(economy.state.yen, 1222);
    assert.equal(economy.state.basket.length, 0);
    assert.deepEqual(economy.state.inventory.map((item) => item.id), items.map((item) => item.id));
    assert.ok(economy.state.inventory.every((item) => item.paid));
    assert.deepEqual(receipt.items.map((item) => item.price), [158, 480, 140]);
    assert.equal(economy.state.receipts.length, 1);
  });

  test('repeating checkout after payment cannot charge again or duplicate the receipt', () => {
    const economy = createStoreEconomy(2000);
    economy.add(onigiri);
    economy.checkout();
    for (let repeat = 0; repeat < 3; repeat++) assert.deepEqual(economy.checkout(), { ok: false, reason: 'empty' });
    assert.equal(economy.state.yen, 1842);
    assert.equal(economy.state.inventory.length, 1);
    assert.equal(economy.state.receipts.length, 1);
  });

  test('insufficient funds leave the full unpaid basket, wallet, and receipt history untouched', () => {
    const economy = createStoreEconomy(100);
    const item = economy.add(bento);
    assert.deepEqual(economy.checkout(), { ok: false, reason: 'funds', total: 480 });
    assert.equal(economy.state.yen, 100);
    assert.equal(economy.held(), item);
    assert.equal(item.paid, false);
    assert.deepEqual(economy.state.basket, [item]);
    assert.equal(economy.state.inventory.length, 0);
    assert.equal(economy.state.receipts.length, 0);
  });

  test('paid consumption removes each item exactly once and leaves one wrapper per item', () => {
    const economy = createStoreEconomy(2000);
    const rice = economy.add(onigiri);
    const drink = economy.add(tea);
    economy.checkout();
    assert.equal(economy.select(rice.id), true);
    assert.equal(economy.consume().item.id, rice.id);
    assert.equal(economy.state.wrappers, 1);
    assert.equal(economy.held(), null, 'Consuming an item must leave the hands empty');
    assert.equal(economy.select(drink.id), true);
    assert.equal(economy.consume().item.id, drink.id);
    assert.equal(economy.state.wrappers, 2);
    assert.equal(economy.state.inventory.length, 0);
    assert.deepEqual(economy.consume(), { ok: false, reason: 'empty' });
    assert.equal(economy.state.wrappers, 2);
    assert.equal(economy.state.yen, 1702);
  });

  test('returning unpaid goods preserves their source identity and never changes the wallet', () => {
    const economy = createStoreEconomy(2000);
    const rice = economy.add(onigiri);
    const lunch = economy.add(bento);
    assert.equal(economy.returnHeld(), lunch);
    assert.equal(lunch.sourceId, bento.id);
    assert.equal(economy.held(), null, 'Returning an item must not equip a different item');
    assert.equal(economy.state.yen, 2000);
    const receipt = economy.checkout();
    assert.equal(receipt.total, 158);
    assert.equal(economy.select(rice.id), true);
    assert.equal(economy.returnHeld(), null, 'Paid items must not be returned as unpaid stock');
    assert.equal(economy.state.inventory.length, 1);
    assert.equal(economy.state.yen, 1842);
  });

  test('separately paid vending goods are consumable and do not get charged by checkout', () => {
    const economy = createStoreEconomy(500);
    assert.equal(economy.spend(tea.price), true);
    economy.add(tea, true);
    assert.deepEqual(economy.checkout(), { ok: false, reason: 'empty' });
    assert.equal(economy.consume().ok, true);
    assert.equal(economy.state.yen, 360);
    assert.equal(economy.state.wrappers, 1);
  });
});
