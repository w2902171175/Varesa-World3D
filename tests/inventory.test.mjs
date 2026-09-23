import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as THREE from 'three';
import { createStoreEconomy, createInteractions } from '../src/interactions.js';

const rice = { id: 'rice', name: '鲑鱼饭团', kind: 'onigiri', price: 140, color: '#eedbb0' };
const tea = { id: 'tea', name: '冰绿茶', kind: 'drink', price: 150, color: '#8aaf91' };

describe('Stored inventory and equipped items', () => {
  test('stowing clears the hand without transferring unpaid goods into owned inventory', () => {
    const economy = createStoreEconomy();
    const unpaid = economy.add(rice);
    assert.equal(economy.stow(), unpaid);
    assert.equal(economy.held(), null);
    assert.deepEqual(economy.state.basket, [unpaid]);
    assert.equal(economy.state.inventory.length, 0);
    assert.equal(economy.state.yen, 2000);
    const paid = economy.add(tea, true);
    assert.equal(economy.stow(), paid);
    assert.deepEqual(economy.state.inventory, [paid]);
    assert.equal(economy.held(), null);
  });

  test('checkout moves purchases into storage and never automatically fills the hand', () => {
    const economy = createStoreEconomy();
    const items = [economy.add(rice), economy.add(tea)];
    assert.equal(economy.checkout().total, 290);
    assert.equal(economy.state.yen, 1710);
    assert.equal(economy.held(), null);
    assert.equal(economy.state.basket.length, 0);
    assert.deepEqual(economy.state.inventory.map(item => item.id), items.map(item => item.id));
    assert.equal(economy.select(items[0].id), true);
    assert.equal(economy.held().id, items[0].id);
    economy.stow();
    assert.equal(economy.state.inventory.length, 2);
  });

  test('using a selected stored item consumes it once and does not auto-equip the remaining stack', () => {
    const economy = createStoreEconomy();
    const first = economy.add(rice, true), second = economy.add(rice, true), drink = economy.add(tea, true);
    assert.equal(economy.held().id, drink.id);
    assert.equal(economy.consume(first.id).item.id, first.id);
    assert.equal(economy.held(), null);
    assert.deepEqual(economy.state.inventory.map(item => item.id), [second.id, drink.id]);
    assert.equal(economy.state.wrappers, 1);
    assert.deepEqual(economy.consume(first.id), { ok: false, reason: 'empty' });
    assert.equal(economy.state.wrappers, 1);
    assert.equal(economy.select(second.id), true);
    assert.equal(economy.consume().item.id, second.id);
    assert.equal(economy.held(), null);
    assert.equal(economy.state.inventory.length, 1);
  });

  test('the paid gate still applies to a stowed item addressed directly by id', () => {
    const economy = createStoreEconomy();
    const item = economy.add(rice); economy.stow();
    assert.deepEqual(economy.consume(item.id), { ok: false, reason: 'unpaid' });
    assert.equal(economy.state.basket.length, 1);
    assert.equal(economy.state.inventory.length, 0);
    assert.equal(economy.state.wrappers, 0);
    assert.equal(economy.held(), null);
  });
});

function worldFixture() {
  const scene = new THREE.Scene(), player = new THREE.Group(), hand = new THREE.Group();
  scene.add(player); hand.position.set(-.20, .80, .08); player.add(hand);
  const sourceUmbrella = new THREE.Group(); sourceUmbrella.name = 'source-umbrella'; scene.add(sourceUmbrella);
  const sourceBasket = new THREE.Group(); scene.add(sourceBasket);
  const crateGroup = new THREE.Group(); crateGroup.position.set(-6.67, .045, -3.76); scene.add(crateGroup);
  const crate = { group: crateGroup, position: crateGroup.position.clone() };
  const products = [rice, tea].map((item, index) => {
    const group = new THREE.Group(); scene.add(group);
    return { ...item, group, position: new THREE.Vector3(-1 + index * .35, 1.30, -1.0) };
  });
  const messages = [];
  const game = createInteractions({ THREE, scene, playerRoot: player, handSocket: hand,
    interiorRefs: { products, baskets: [{ group: sourceBasket, position: new THREE.Vector3(-2.9, .8, .68) }] },
    propsRefs: { umbrellas: [sourceUmbrella], crates: [crate] }, notify: message => messages.push(message) });
  function tick(seconds = .30) { for (let t = 0; t < seconds; t += .05) game.update(.05); scene.updateMatrixWorld(true); }
  function stand(x, z, tx, tz, y = .49) { player.position.set(x, y, z); player.rotation.y = Math.atan2(tx - x, tz - z); scene.updateMatrixWorld(true); }
  function borrow() { stand(3.35, 1.55, 3.35, 2.15, .30); assert.equal(game.interact('umbrella'), true); tick(); }
  function pick(id = 'rice') { stand(-1, -.2, -1, -1); assert.equal(game.interact(id), true); tick(); return game.getState().held; }
  function checkout() { stand(1.15, -1, 1.89, -1.46); assert.equal(game.interact('checkout'), true); tick(); }
  return { scene, player, hand, sourceUmbrella, crateGroup, products, game, messages, tick, stand, borrow, pick, checkout };
}

describe('Visible equipment and umbrella storage', () => {
  test('a newly borrowed umbrella is closed, hand-mounted and points down beside the leg', () => {
    const world = worldFixture(); world.borrow();
    const state = world.game.getState(), umbrella = world.scene.getObjectByName('equipped-umbrella');
    const tip = world.scene.getObjectByName('umbrella-tip'), canopy = world.scene.getObjectByName('umbrella-canopy');
    assert.equal(state.umbrellaOwned, true); assert.equal(state.umbrellaEquipped, true);
    assert.equal(state.umbrella, false); assert.equal(state.umbrellaOpen, false);
    assert.equal(state.equipmentId, 'umbrella'); assert.equal(state.held, null);
    assert.equal(world.sourceUmbrella.visible, false); assert.equal(umbrella.parent, world.hand);
    assert.equal(umbrella.visible, true); assert.equal(canopy.visible, false);
    const gripY = umbrella.getWorldPosition(new THREE.Vector3()).y, tipY = tip.getWorldPosition(new THREE.Vector3()).y;
    assert.ok(tipY < gripY - .60 && tipY > gripY - .75, 'Closed umbrella tip must be below the grip, within compact shaft length');
    world.game.dispose();
  });

  test('stowing hides the entire umbrella, keeps ownership and requires explicit re-equipping before U', () => {
    const world = worldFixture(); world.borrow();
    assert.equal(world.game.toggleUmbrella(), true); world.tick(.8);
    const umbrella = world.scene.getObjectByName('equipped-umbrella'), tip = world.scene.getObjectByName('umbrella-tip');
    assert.ok(tip.getWorldPosition(new THREE.Vector3()).y > umbrella.getWorldPosition(new THREE.Vector3()).y + .9);
    assert.equal(world.game.stowHeld(), true);
    assert.equal(umbrella.visible, false); assert.equal(world.sourceUmbrella.visible, false);
    assert.equal(world.game.getState().umbrellaOwned, true); assert.equal(world.game.getState().umbrellaEquipped, false);
    assert.equal(world.game.getState().umbrellaOpen, false); assert.equal(world.game.getState().equipmentId, null);
    const gadget = world.game.getInventoryItems().find(item => item.id === 'umbrella');
    assert.equal(gadget.stored, true); assert.equal(gadget.equipped, false); assert.equal(gadget.canUse, false);
    assert.equal(world.game.toggleUmbrella(), false); assert.match(world.messages.at(-1), /从背包装备/);
    assert.equal(world.game.equipItem('umbrella'), true); world.tick();
    assert.equal(world.game.getState().umbrellaOpen, false); assert.equal(umbrella.visible, true);
    assert.ok(tip.getWorldPosition(new THREE.Vector3()).y < umbrella.getWorldPosition(new THREE.Vector3()).y - .6);
    world.game.dispose();
  });

  test('food and umbrella are exclusive, while paid storage and the unpaid basket stay separate', () => {
    const world = worldFixture(); world.borrow(); world.game.toggleUmbrella(); world.tick();
    const picked = world.pick();
    assert.equal(world.game.getState().umbrellaEquipped, false); assert.equal(world.game.getState().umbrellaOpen, false);
    assert.equal(world.game.getState().equipmentId, picked.id); assert.equal(world.products[0].group.visible, false);
    assert.equal(world.game.getInventoryItems().some(item => item.id === picked.id), false, 'Unpaid stock must not appear in owned bag items');
    assert.equal(world.scene.getObjectByName('unpaid-basket-contents').children.length, 1);
    assert.equal(world.game.stowHeld(), true); assert.equal(world.game.getState().held, null);
    assert.equal(world.game.getState().basket.length, 1); assert.equal(world.game.useItem(picked.id), false);
    world.checkout();
    let state = world.game.getState();
    assert.equal(state.inventory.length, 1); assert.equal(state.basket.length, 0);
    assert.equal(state.equipmentId, null); assert.equal(state.held, null); assert.equal(state.yen, 1860);
    assert.equal(world.scene.getObjectByName('unpaid-basket-contents').children.length, 0, 'Paid stored goods must not remain displayed in the shopping basket');
    assert.equal(world.game.equipItem(picked.id), true);
    assert.equal(world.game.equipItem('umbrella'), true); assert.equal(world.game.getState().held, null);
    assert.equal(world.game.getState().inventory.length, 1); assert.equal(world.game.getState().equipmentId, 'umbrella');
    assert.equal(world.game.useItem(picked.id), true); world.tick(1);
    state = world.game.getState();
    assert.equal(state.inventory.length, 0); assert.equal(state.wrappers, 1); assert.equal(state.equipmentId, null);
    assert.equal(state.umbrellaEquipped, false); assert.equal(state.umbrellaOwned, true);
    assert.equal(world.scene.getObjectByName('equipped-grocery').children.length, 0);
    assert.equal(world.game.useItem(picked.id), false); assert.equal(world.game.getState().wrappers, 1);
    world.game.dispose();
  });

  test('taking a brewed coffee switches the equipped hand and it can then be stored', () => {
    const world = worldFixture(); world.borrow(); world.game.toggleUmbrella(); world.tick();
    world.stand(1, -2.95, 1.9, -2.95); assert.equal(world.game.interact('coffee'), true); world.tick(4);
    assert.equal(world.game.interact('coffee'), true); world.tick();
    const coffee = world.game.getState().held;
    assert.equal(coffee.kind, 'coffee'); assert.equal(coffee.paid, true); assert.equal(world.game.getState().yen, 1880);
    assert.equal(world.game.getState().umbrellaEquipped, false); assert.equal(world.game.getState().umbrellaOwned, true);
    assert.equal(world.game.stowHeld(), true); assert.equal(world.game.getState().held, null);
    assert.equal(world.game.getInventoryItems().some(item => item.id === coffee.id && item.stored), true);
    world.game.dispose();
  });

  test('large carried crates cannot disappear into the backpack', () => {
    const world = worldFixture(); world.borrow();
    world.stand(-6.67, -3.0, -6.67, -3.76, .045); assert.equal(world.game.interact('crate-0'), true); world.tick();
    assert.equal(world.game.getState().crate, true); assert.equal(world.game.getState().umbrellaEquipped, false);
    assert.equal(world.game.stowHeld(), false); assert.match(world.messages.at(-1), /搬运箱请放到地面/);
    assert.equal(world.game.getState().crate, true); assert.equal(world.crateGroup.parent, world.player);
    world.game.dispose();
  });
});
