import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryGroups} from '../src/inventory-ui.js';
test('identical paid items stack without losing individual equip/use ids',()=>{
 const items=[{id:'a',name:'冰绿茶',kind:'drink',paid:true,price:150},{id:'b',name:'冰绿茶',kind:'drink',paid:true,price:150}];
 const state={inventoryItems:items,equipmentId:'b',basket:[]};const groups=inventoryGroups(state);
 assert.equal(groups.length,1);assert.equal(groups[0].count,2);assert.equal(groups[0].equippedId,'b');assert.deepEqual(groups[0].entries.map(i=>i.id),['a','b']);assert.equal(items[0].count,undefined);
});
test('unpaid groceries remain a different category from owned copies',()=>{
 const groups=inventoryGroups({inventoryItems:[{id:'p',name:'饭团',kind:'onigiri',price:140,paid:true}],basket:[{id:'u',name:'饭团',kind:'onigiri',price:140,paid:false}],equipmentId:'u'});
 assert.equal(groups.length,2);assert.equal(groups.find(i=>i.category==='basket').paid,false);assert.equal(groups.find(i=>i.category==='food').equipped,false);
});
test('umbrella ownership and equipment are independent, with one gadget entry',()=>{
 const state={inventoryItems:[{id:'umbrella',name:'透明雨伞',kind:'umbrella',paid:true}],umbrellaOwned:true,umbrellaEquipped:false,wrappers:2,basket:[]};
 let groups=inventoryGroups(state);assert.equal(groups.filter(i=>i.kind==='umbrella').length,1);assert.equal(groups.find(i=>i.kind==='umbrella').equipped,false);assert.equal(groups.find(i=>i.kind==='wrappers').count,2);
 state.umbrellaEquipped=true;state.equipmentId='umbrella';groups=inventoryGroups(state);assert.equal(groups.find(i=>i.kind==='umbrella').equipped,true);
});
