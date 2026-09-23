// Inventory/economy has no DOM or renderer dependency and is independently testable.
export function createStoreEconomy(initialYen = 2000) {
  let sequence = 0;
  const state = { yen: initialYen, basket: [], inventory: [], heldId: null, wrappers: 0, receipt: null, receipts: [] };
  const held = () => [...state.basket, ...state.inventory].find(i => i.id === state.heldId) || null;
  function add(product, paid = false) {
    const item = { id: `${product.id || product.kind}-${++sequence}`, sourceId: product.id, name: product.name,
      price: product.price, paid, kind: product.kind, color: product.color || '#dfb480' };
    (paid ? state.inventory : state.basket).push(item); state.heldId = item.id; return item;
  }
  function spend(amount) {
    if (!Number.isFinite(amount) || amount < 0 || state.yen < amount) return false;
    state.yen -= amount; return true;
  }
  function checkout() {
    if (!state.basket.length) return { ok: false, reason: 'empty' };
    const total = state.basket.reduce((n, item) => n + item.price, 0);
    if (!spend(total)) return { ok: false, reason: 'funds', total };
    const items = state.basket.splice(0); items.forEach(item => { item.paid = true; });
    state.inventory.push(...items);
    state.heldId = null;
    state.receipt = { items: items.map(item => ({ id: item.id, name: item.name, price: item.price })), total, balance: state.yen };
    state.receipts.push(state.receipt); return { ok: true, ...state.receipt };
  }
  function consume(id) {
    const item = id ? [...state.inventory, ...state.basket].find(item => item.id === id) : held();
    if (!item) return { ok: false, reason: 'empty' };
    if (!item.paid) return { ok: false, reason: 'unpaid' };
    state.inventory.splice(state.inventory.indexOf(item), 1); state.wrappers++;
    state.heldId = null;
    return { ok: true, item };
  }
  function returnHeld() {
    const item = held(); if (!item || item.paid) return null;
    state.basket.splice(state.basket.indexOf(item), 1);
    state.heldId = null; return item;
  }
  function select(id) {
    if (![...state.inventory, ...state.basket].some(item => item.id === id)) return false;
    state.heldId = id; return true;
  }
  function stow() { const item = held(); state.heldId = null; return item; }
  return { state, add, spend, checkout, consume, held, returnHeld, select, stow };
}

/** Proximity- and facing-gated, animated world interactions. No DOM/UI is created. */
export function createInteractions(options) {
  const { THREE, scene, playerRoot, interiorRefs = {}, propsRefs = {}, door,
    notify = () => {}, audio = () => {}, onRide = () => {} } = options;
  const economy = createStoreEconomy(options.initialYen ?? 2000), state = economy.state;
  Object.assign(state, { basketEquipped: false, umbrella: false, umbrellaOwned: false, umbrellaEquipped: false, bike: false,
    reading: null, coffee: { status: 'idle', progress: 0 }, lampOn: true, fansOn: true, crate: null });
  const dynamic = new THREE.Group(); dynamic.name = 'live-world-interactions'; dynamic.userData.dynamic = true; scene.add(dynamic);
  const targets = [], animations = [], containers = new Map(), products = new Map();
  const materials = new Map(), unitBox = new THREE.BoxGeometry(1, 1, 1);
  const tmp = new THREE.Vector3(), forward = new THREE.Vector3(), facingPoint = new THREE.Vector3(), playerPosition = new THREE.Vector3();
  let focused = null, elapsed = 0, selectedDrink = 0, vendingBusy = false, heldVisual = null, heldVisualId = null;
  let readingRef = null, readingVisual = null, readingPage = null, readingPageMaterial = null;
  let coffeeTime = 0, eatTime = 0, fanRotation = 0, basketSource = null, umbrellaSource = null;
  let cooldown = 0, actionTime = 0, currentAction = null;
  let droppingCrateIndex = null;
  let consumptionVisual = null, handActionEpoch = 0;
  const drinks = [
    { id: 'vending-soda', name: '柚子汽水', kind: 'drink', price: 150, color: '#e5b773' },
    { id: 'vending-tea', name: '冰绿茶', kind: 'drink', price: 140, color: '#81baa4' },
    { id: 'vending-coffee', name: '罐装咖啡', kind: 'drink', price: 120, color: '#b68569' }
  ];
  const readingPages = [
    ['月见町 · 雨夜散步', '便利店暖灯照着归家的路。', '转过街角，听雨落在雨伞上。'],
    ['街角咖啡笔记', '热咖啡 ¥120，现磨后慢慢享用。', '饭团与热关东煮是雨夜的搭配。'],
    ['本周社区消息', '9 月 28 日：月见町秋日祭。', '星期日：小巷旧书交换会。']
  ];
  function material(color, extra = {}) {
    const key = color + JSON.stringify(extra); if (!materials.has(key)) materials.set(key, new THREE.MeshToonMaterial({ color, ...extra }));
    return materials.get(key);
  }
  function mesh(geo, color, parent, x = 0, y = 0, z = 0, extra = {}) {
    const object = new THREE.Mesh(geo, material(color, extra)); object.position.set(x, y, z);
    object.castShadow = true; object.receiveShadow = true; object.userData.dynamic = true; parent.add(object); return object;
  }
  function box(w, h, d, color, parent, x = 0, y = 0, z = 0, extra = {}) {
    const object = mesh(unitBox, color, parent, x, y, z, extra); object.scale.set(w, h, d); return object;
  }
  function cylinder(r, rb, h, color, parent, x = 0, y = 0, z = 0, extra = {}) {
    return mesh(new THREE.CylinderGeometry(r, rb, h, 12), color, parent, x, y, z, extra);
  }
  function vec(value, fallback = [0, 0, 0]) {
    if (value?.isVector3) return value;
    return new THREE.Vector3(...(Array.isArray(value) ? value : fallback));
  }
  function animate(duration, update, complete = () => {}) {
    animations.push({ duration, elapsed: 0, update, complete });
  }
  function say(message, sound = 'interact') { notify(message); audio(sound); }
  function register(id, label, position, action, extra = {}) {
    const target = { id, label, position: vec(position), action, range: 1.5, ...extra }; targets.push(target); return target;
  }
  function prompt(target) { return typeof target.prompt === 'function' ? target.prompt() : target.prompt || target.label; }
  function allowed(target) {
    if (target.enabled && !target.enabled()) return false;
    if (state.bike && target.id !== 'bicycle') return false;
    if (target.positionProvider) target.position.copy(target.positionProvider());
    playerRoot.getWorldPosition(playerPosition);
    const inside = playerPosition.x > -5.58 && playerPosition.x < 3.57 && playerPosition.z > -5.49 && playerPosition.z < 1.52;
    if (target.inside && !inside) return false;
    if (target.outside && inside) return false;
    tmp.copy(target.position).sub(playerPosition); tmp.y = 0;
    const distance = tmp.length(); if (distance > target.range) return false;
    forward.set(0, 0, 1).applyQuaternion(playerRoot.quaternion); forward.y = 0; forward.normalize();
    return distance < .26 || forward.dot(tmp.normalize()) >= .10;
  }
  function nearest() {
    let winner = null, score = Infinity;
    for (const target of targets) {
      if (!allowed(target)) continue;
      // Slight vertical weighting makes an upper shelf and the lunch trays below
      // it individually reachable, without selecting through several fixtures.
      const distance = target.position.distanceToSquared(facingPoint.set(playerPosition.x, playerPosition.y + .98, playerPosition.z));
      const rank = distance + (target.priority ?? 0);
      if (rank < score) { score = rank; winner = target; }
    }
    return winner;
  }
  function createItemVisual(item) {
    const g = new THREE.Group(); g.userData.dynamic = true;
    if (item.kind === 'drink') {
      cylinder(.066, .066, .24, item.color, g, 0, .03, 0);
      cylinder(.068, .068, .016, '#e7e1cb', g, 0, .16, 0);
      box(.095, .080, .010, '#fff2d6', g, 0, .02, .067);
    } else if (item.kind === 'coffee' || item.kind === 'oden' || item.kind === 'icecream') {
      cylinder(.092, .067, .17, '#eee3c3', g, 0, .02, 0);
      cylinder(.085, .085, .009, item.kind === 'coffee' ? '#78523c' : item.color, g, 0, .107, 0);
      if (item.kind === 'oden') mesh(new THREE.SphereGeometry(.058, 10, 6), '#e8d2a1', g, .01, .13, 0);
    } else if (item.kind === 'onigiri') {
      const shape = new THREE.Shape(); shape.moveTo(-.12, -.10); shape.lineTo(.12, -.10); shape.lineTo(0, .14); shape.closePath();
      mesh(new THREE.ExtrudeGeometry(shape, { depth: .07, bevelEnabled: true, bevelSize: .008, bevelThickness: .008, bevelSegments: 1 }), '#fff1d0', g);
      box(.09, .11, .015, '#365747', g, 0, -.06, .084);
    } else if (item.kind === 'bento') {
      box(.35, .06, .28, '#405b54', g);
      box(.17, .028, .21, '#f9edcf', g, -.064, .043, 0);
      box(.095, .045, .16, '#caa169', g, .09, .05, 0);
    } else {
      box(.17, .23, .09, item.color, g);
      box(.13, .14, .009, '#fff0cf', g, 0, 0, .05);
      box(.09, .028, .012, item.color, g, 0, .024, .059);
    }
    return g;
  }
  const handSocket = options.handSocket || options.sockets?.rightHand;
  const handAnchor = new THREE.Group();
  handAnchor.name = 'equipped-grocery';
  handAnchor.position.set(...(handSocket ? [0, .015, .035] : [.31, .96, .39]));
  (handSocket || playerRoot).add(handAnchor);
  const basketVisual = new THREE.Group(); basketVisual.name = 'shopping-basket'; basketVisual.position.set(-.42, .66, .14); playerRoot.add(basketVisual);
  box(.39, .025, .31, '#53897e', basketVisual);
  for (const x of [-.19, .19]) box(.025, .22, .32, '#7fa99b', basketVisual, x, .11, 0);
  for (const z of [-.15, .15]) box(.39, .20, .023, '#7fa99b', basketVisual, 0, .1, z);
  const basketHandle = new THREE.Mesh(new THREE.TorusGeometry(.17, .012, 5, 16, Math.PI), material('#365c57'));
  basketHandle.position.y = .22; basketVisual.add(basketHandle); basketVisual.visible = false;
  const basketContents = new THREE.Group(); basketContents.name = 'unpaid-basket-contents'; basketVisual.add(basketContents);
  let basketContentsKey = '';
  function refreshHeld() {
    const item = economy.held();
    if ((item?.id || null) !== heldVisualId) {
      if (heldVisual) handAnchor.remove(heldVisual);
      heldVisual = item ? createItemVisual(item) : null; heldVisualId = item?.id || null;
      if (heldVisual) handAnchor.add(heldVisual);
    }
    handAnchor.visible = !state.reading && !state.crate && !state.bike && !state.umbrellaEquipped;
    basketVisual.visible = state.basketEquipped && !state.bike;
    const key = state.basket.map(i => i.id).join(',');
    if (key !== basketContentsKey) {
      basketContentsKey = key; basketContents.clear();
      state.basket.slice(0, 5).forEach((item, i) => {
        const m = createItemVisual(item); m.scale.setScalar(.52); m.position.set((i % 2 - .5) * .14, .12 + Math.floor(i / 4) * .08, (Math.floor(i / 2) % 2 - .5) * .13); basketContents.add(m);
      });
    }
  }
  function cancelHandAnimation() {
    handActionEpoch++; consumptionVisual?.removeFromParent(); consumptionVisual = null; eatTime = 0;
    handAnchor.position.set(...(handSocket ? [0, .015, .035] : [.31, .96, .39]));
    if (currentAction === 'eat' || currentAction === 'drink') { currentAction = null; actionTime = 0; }
  }
  function clearEquipment() {
    cancelHandAnimation(); economy.stow(); putUmbrellaAway(); refreshHeld();
  }
  function acceptItem(product, paid = false) {
    putUmbrellaAway();
    const item = economy.add(product, paid);
    if (state.crate || state.bike || eatTime > 0) economy.stow();
    else cancelHandAnimation();
    refreshHeld(); return item;
  }
  function stowHeld() {
    if (state.crate) { say('搬运箱请放到地面。'); return false; }
    const held = economy.held(), wasUmbrella = state.umbrellaEquipped;
    closeReading(); clearEquipment();
    if (held) say(held.paid ? `已将${held.name}收进背包。` : `已将${held.name}放入待结账购物篮。`);
    else if (wasUmbrella) say('雨伞已收进背包。', 'umbrella');
    return !!held || wasUmbrella;
  }
  function equipItem(id) {
    if (state.crate) { say('搬运箱请放到地面。'); return false; }
    if (state.bike) { say('请先停车，再取出随身物品。'); return false; }
    if (id === 'umbrella') {
      if (!state.umbrellaOwned) return false;
      closeReading(); clearEquipment(); state.umbrellaEquipped = true; state.umbrella = false;
      syncUmbrella(0); refreshHeld(); say('取出收拢的雨伞。按 U 撑开。', 'umbrella'); return true;
    }
    if (![...state.inventory, ...state.basket].some(item => item.id === id)) return false;
    closeReading(); clearEquipment(); economy.select(id); refreshHeld();
    say(`取出${economy.held().name}${economy.held().paid ? '。' : '（待结账）。'}`, 'pickup'); return true;
  }

  function setContainer(container, open) {
    container.open = open;
    say(open ? '柜门打开了，可以挑选商品。' : '柜门已关好。', 'door');
  }
  for (const fridge of interiorRefs.fridges || []) {
    const container = { ref: fridge, open: false, value: 0, kind: 'fridge' }; containers.set(fridge.id, container);
    register(fridge.id, '饮料冷柜', fridge.position, () => setContainer(container, !container.open),
      { inside: true, priority: .25, prompt: () => `${container.open ? '关闭' : '打开'}饮料冷柜` });
  }
  if (interiorRefs.freezer) {
    const ref = interiorRefs.freezer, container = { ref, open: false, value: 0, kind: 'freezer' }; containers.set('freezer', container);
    register('freezer', '冰淇淋柜', ref.position, () => setContainer(container, !container.open),
      { inside: true, priority: .20, prompt: () => `${container.open ? '关上' : '推开'}冰柜玻璃盖` });
  }
  for (const product of interiorRefs.products || []) {
    products.set(product.id, product); product.available = true;
    register(product.id, product.name, product.position, () => {
      if (state.crate) { say('搬运箱请放到地面。'); return; }
      const held = economy.held();
      if (!product.available) {
        if (held?.sourceId === product.id && !held.paid) {
          economy.returnHeld(); product.available = true; product.group.visible = true; refreshHeld(); say(`已把${product.name}放回原处。`);
        }
        return;
      }
      const container = containers.get(product.containerId);
      if (container && !container.open) { setContainer(container, true); return; }
      if (state.basket.length >= (state.basketEquipped ? 16 : 6)) { say('手上拿满了，先去收银台结账，或取一个购物篮。'); return; }
      product.available = false; product.group.visible = false; acceptItem(product); closeReading(); refreshHeld();
      say(`拿起${product.name} · ¥${product.price}，到收银台结账后可食用。`, 'pickup');
      if (heldVisual) { const pickedVisual = heldVisual; pickedVisual.scale.setScalar(.1); animate(.22, t => pickedVisual.scale.setScalar(.1 + .9 * t)); }
    }, { inside: true, enabled: () => product.available || (economy.held()?.sourceId === product.id && !economy.held()?.paid),
      prompt: () => !product.available ? `放回${product.name}` : containers.get(product.containerId)?.open === false ? `打开柜门 · ${product.name}` : `拿取${product.name} · ¥${product.price}` });
  }

  const receiptVisual = new THREE.Group(); receiptVisual.position.set(2.15, 1.57, -1.49); dynamic.add(receiptVisual); receiptVisual.visible = false;
  box(.16, .007, .30, '#fff6d6', receiptVisual);
  for (let i = 0; i < 7; i++) box(i === 6 ? .12 : .10, .009, .005, '#718575', receiptVisual, 0, .002, -.105 + i * .031);
  register('checkout', '收银台', [1.89, 1.46, -1.46], () => {
    const result = economy.checkout();
    if (!result.ok) { say(result.reason === 'funds' ? `余额不足：合计 ¥${result.total}，钱包 ¥${state.yen}。可以把未付款商品放回原处。` : '购物篮是空的，先挑选喜欢的商品。'); return; }
    clearEquipment(); receiptVisual.visible = true; receiptVisual.scale.z = .01;
    animate(.8, t => { receiptVisual.scale.z = Math.max(.01, t); }); refreshHeld();
    say(`付款成功：${result.items.length} 件商品，合计 ¥${result.total}。余额 ¥${state.yen}。商品已收进背包，按 B 取出或使用。`, 'checkout');
  }, { inside: true, prompt: () => state.basket.length ? `结账 · ${state.basket.length} 件 / ¥${state.basket.reduce((n, i) => n + i.price, 0)}` : '收银台 · 购物篮为空' });
  const coffeeRef = interiorRefs.coffee;
  const coffeeStream = cylinder(.009, .009, .13, '#9b6d45', dynamic, 2.70, 1.72, -2.54); coffeeStream.visible = false;
  const steam = new THREE.Group(); dynamic.add(steam); steam.visible = false;
  for (let i = 0; i < 3; i++) {
    const puff = mesh(new THREE.SphereGeometry(.037, 6, 4), '#fff5df', steam, 2.7, 1.77 + i * .06, -2.54,
      { transparent: true, opacity: .19, depthWrite: false }); puff.scale.set(.7, 1.5, .7);
  }
  register('coffee', '现磨咖啡机', coffeeRef?.position || [1.9, 1.6, -2.95], () => {
    if (state.coffee.status === 'brewing') { say('咖啡正在萃取，等咖啡流停止后再取杯。', 'brew'); return; }
    if (state.coffee.status === 'ready') {
      acceptItem({ id: 'fresh-coffee', kind: 'coffee', name: '现磨热咖啡', price: 120, color: '#987047' }, true);
      state.coffee.status = 'idle'; state.coffee.progress = 0; if (coffeeRef?.group) coffeeRef.group.visible = false;
      steam.visible = false; refreshHeld(); say('拿到了热咖啡，按 R 慢慢喝。', 'pickup'); return;
    }
    if (!economy.spend(120)) { say('热咖啡需要 ¥120，余额不足。'); return; }
    state.coffee.status = 'brewing'; state.coffee.progress = 0; coffeeTime = 0; coffeeStream.visible = true;
    if (coffeeRef?.group) coffeeRef.group.visible = true;
    say('投入 ¥120，咖啡机开始磨豆、萃取。', 'brew');
  }, { inside: true, priority: -.12, prompt: () => state.coffee.status === 'ready' ? '取走热咖啡' : state.coffee.status === 'brewing' ? '萃取中…' : '冲泡现磨咖啡 · ¥120' });

  register('basket', '购物篮', [-2.9, .81, .68], () => {
    if (state.basketEquipped) {
      if (state.basket.length) { say('篮子里还有待结账商品，请先结账或放回货架。'); return; }
      state.basketEquipped = false; if (basketSource) basketSource.group.visible = true; say('购物篮归还到架子上。');
    } else {
      basketSource = interiorRefs.baskets?.at(-1); if (basketSource) basketSource.group.visible = false;
      state.basketEquipped = true; say('提起购物篮，可以装更多商品。', 'pickup');
    }
    refreshHeld();
  }, { inside: true, prompt: () => state.basketEquipped ? '归还购物篮' : '取一个购物篮' });

  function pageTexture(lines) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 1024;
    const g = canvas.getContext('2d'); g.fillStyle = '#f3e8c8'; g.fillRect(0, 0, 768, 1024);
    g.fillStyle = '#53796d'; g.fillRect(48, 60, 672, 245);
    g.fillStyle = '#c8d6bb'; g.beginPath(); g.arc(555, 167, 77, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#839b82'; g.fillRect(110, 158, 168, 147); g.fillRect(297, 202, 102, 103);
    g.font = 'bold 47px "Microsoft YaHei", sans-serif'; g.fillStyle = '#435e52';
    g.fillText(lines[0], 49, 400, 674); g.font = '32px "Microsoft YaHei", sans-serif';
    lines.slice(1).forEach((line, i) => g.fillText(line, 49, 490 + i * 65, 670));
    for (let i = 0; i < 7; i++) { g.fillStyle = '#c5c0a8'; g.fillRect(51, 696 + i * 27, 580 - i % 3 * 73, 6); }
    g.fillStyle = '#658273'; g.font = '25px sans-serif'; g.fillText('AMAYADORI · TSUKIMI', 49, 970);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }
  function refreshPage() {
    if (!state.reading) return;
    const page = readingPages[state.reading.page % readingPages.length];
    if (readingPageMaterial?.map) readingPageMaterial.map.dispose();
    if (readingPageMaterial) { readingPageMaterial.map = pageTexture(page); readingPageMaterial.needsUpdate = true; }
    state.reading.content = page.slice(1).join('\n'); state.reading.body = state.reading.content;
    say(`${state.reading.title} · 第 ${state.reading.page + 1}/${state.reading.total} 页：${page[1]} ${page[2]} R 翻页，F 放回。`, 'page');
  }
  function closeReading() {
    if (!state.reading) return;
    if (readingRef?.group) readingRef.group.visible = true;
    readingVisual?.removeFromParent(); if (readingPageMaterial?.map) readingPageMaterial.map.dispose();
    readingRef = null; readingVisual = null; readingPage = null; readingPageMaterial = null; state.reading = null;
    refreshHeld();
  }
  function openReading(ref, title) {
    if (state.reading) { closeReading(); say('读物已放回。'); return; }
    if (state.crate) { say('搬运箱请放到地面。'); return; }
    clearEquipment();
    readingRef = ref; if (ref?.group) ref.group.visible = false;
    state.reading = { title, page: 0, total: readingPages.length };
    readingVisual = new THREE.Group(); readingVisual.position.set(0, 1.11, .47); readingVisual.rotation.x = -.65; playerRoot.add(readingVisual);
    box(.43, .55, .025, '#9cad92', readingVisual);
    readingPageMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    readingPage = new THREE.Mesh(new THREE.PlaneGeometry(.405, .53), readingPageMaterial); readingPage.position.z = .016; readingVisual.add(readingPage);
    refreshHeld(); refreshPage();
  }
  for (const magazine of interiorRefs.magazines || []) register(magazine.id, magazine.name, magazine.position,
    () => openReading(magazine, magazine.name), { inside: true, priority: .06, prompt: `翻阅《${magazine.name}》` });
  register('noticeboard', '社区公告栏', [-6.64, 1.45, -.05], () => openReading(null, '月见町社区公告'), { prompt: '阅读社区公告' });

  let backOpen = door?.getBackOpen?.() || false, backValue = backOpen ? 1 : 0;
  function toggleBackDoor() { backOpen = !backOpen; door?.setBackOpen?.(backOpen); say(backOpen ? '后场门打开了，可以通往后巷。' : '后场门已经关好。', 'door'); }
  register('back-door', '后场门', [2.47, 1.45, -5.15], toggleBackDoor, { inside: true, prompt: () => `${backOpen ? '关闭' : '打开'}后场门` });
  register('back-door-outside', '后巷入口', [2.47, 1.45, -5.91], toggleBackDoor, { outside: true, prompt: () => `${backOpen ? '关闭' : '打开'}后巷入口` });

  const vendPosition = vec(propsRefs.vending?.position, [-4.65, 1.55, 2.52]).clone();
  if (vendPosition.y < .8) { vendPosition.y = 1.4; vendPosition.z += .48; }
  const vendDispense = vec(propsRefs.vending?.dispensePosition, [-4.73, .7, 2.61]);
  register('vending', '自动贩卖机', vendPosition, () => {
    if (vendingBusy) { say('饮料正在掉落，稍等一下。'); return; }
    const drink = drinks[selectedDrink]; if (!economy.spend(drink.price)) { say(`余额不足，需要 ¥${drink.price}。`); return; }
    vendingBusy = true; const can = createItemVisual(drink); can.position.copy(vendDispense).add(new THREE.Vector3(0, .21, 0)); dynamic.add(can);
    say(`投入 ¥${drink.price}，${drink.name}正在出货。`, 'vending');
    animate(1.15, t => { can.position.y = vendDispense.y + .21 - Math.min(t * 2, 1) * .18 + Math.sin(t * Math.PI * 3) * .025 * (1 - t); can.rotation.z = t * .22; }, () => {
      dynamic.remove(can); acceptItem(drink, true); vendingBusy = false; refreshHeld(); say(`拿到了${drink.name}。可按 B 收入背包；R 饮用，面向贩卖机时 R 切换饮料。`, 'pickup');
    });
  }, { outside: true, prompt: () => vendingBusy ? '饮料出货中…' : `购买${drinks[selectedDrink].name} · ¥${drinks[selectedDrink].price} · R 换一种` });

  // The grip is the origin of the actual hand socket. Closed, the compact
  // umbrella points down beside the leg. Opening rotates and extends the shaft.
  const umbrella = new THREE.Group(); umbrella.name = 'equipped-umbrella';
  umbrella.position.set(...(handSocket ? [0, -.012, .015] : [-.22, .79, .08]));
  (handSocket || playerRoot).add(umbrella); umbrella.visible = false;
  const umbrellaPivot = new THREE.Group(); umbrellaPivot.name = 'umbrella-opening-pivot'; umbrella.add(umbrellaPivot);
  cylinder(.013, .013, .94, '#b9c5bb', umbrellaPivot, 0, .44, 0);
  cylinder(.026, .022, .075, '#637a79', umbrellaPivot, 0, 0, 0);
  const tip = cylinder(.018, .009, .052, '#738d91', umbrellaPivot, 0, .965, 0); tip.name = 'umbrella-tip';
  const canopy = new THREE.Group(); canopy.name = 'umbrella-canopy'; canopy.position.y = .83; umbrellaPivot.add(canopy);
  const cover = mesh(new THREE.ConeGeometry(.86, .30, 12, 1, true), '#c8e5dd', canopy, 0, 0, 0, { side: THREE.DoubleSide, transparent: true, opacity: .28, depthWrite: false });
  cover.castShadow=false;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, .15, 0), new THREE.Vector3(Math.cos(a) * .86, -.15, Math.sin(a) * .86)]);
    canopy.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#526f77' })));
  }
  const folded = cylinder(.025, .075, .63, '#86a9b1', umbrellaPivot, 0, .55, 0); folded.name = 'umbrella-folded-fabric';
  cylinder(.053, .053, .036, '#637b86', umbrellaPivot, 0, .49, 0);
  let umbrellaValue = 0;
  function syncUmbrella(dt) {
    if (dt > 0) umbrellaValue = THREE.MathUtils.damp(umbrellaValue, state.umbrella ? 1 : 0, 9, dt);
    const opening = umbrellaValue * umbrellaValue * (3 - 2 * umbrellaValue);
    umbrella.visible = state.umbrellaEquipped && !state.bike && !state.crate && !state.reading;
    umbrellaPivot.rotation.z = Math.PI * (1 - opening);
    umbrellaPivot.scale.y = .70 + .30 * opening;
    canopy.visible = umbrellaValue > .05; folded.visible = umbrellaValue < .80;
    canopy.scale.set(Math.max(.04, opening), .50 + .50 * opening, Math.max(.04, opening));
  }
  function putUmbrellaAway() {
    state.umbrella = false; state.umbrellaEquipped = false; umbrellaValue = 0;
    syncUmbrella(0);
  }
  function toggleUmbrella() {
    if (!state.umbrellaOwned) { say('门口的伞架可以借一把雨伞。'); return false; }
    if (!state.umbrellaEquipped) { say('请先从背包装备雨伞。'); return false; }
    if (state.crate || state.bike || state.reading) return false;
    state.umbrella = !state.umbrella;
    say(state.umbrella ? '撑开雨伞。' : '收拢雨伞，垂放在身侧。', 'umbrella'); return true;
  }
  register('umbrella', '雨伞架', [3.35, 1.1, 2.15], () => {
    if (state.crate) { say('搬运箱请放到地面。'); return; }
    if (!state.umbrellaOwned) {
      state.umbrellaOwned = true; umbrellaSource = propsRefs.umbrellas?.[0];
      if (umbrellaSource) umbrellaSource.visible = false;
      equipItem('umbrella');
    } else {
      putUmbrellaAway(); state.umbrellaOwned = false; if (umbrellaSource) umbrellaSource.visible = true;
      say('收好雨伞，放回伞架。', 'umbrella');
    }
  }, { prompt: () => state.umbrellaOwned ? '归还雨伞' : '借一把收拢的雨伞' });

  function disposeWrapper(index) {
    const amount = state.wrappers;
    if (!amount) { say('手上没有空包装；吃完或喝完后可以来分类丢弃。'); return; }
    state.wrappers = 0; const lid = propsRefs.binLids?.[index];
    const y = lid?.position.y || 0;
    if (lid) animate(.8, t => { lid.position.y = y + Math.sin(t * Math.PI) * .15; }, () => { lid.position.y = y; });
    const trash = box(.12, .06, .09, '#dbc69b', dynamic, 4.55, 1.28, -3.7 - index * .63);
    animate(.55, t => { trash.position.y = 1.28 - t * .46; trash.rotation.z = t * 3; }, () => trash.removeFromParent());
    say(`已投入 ${amount} 件空包装，街角保持干净。`, 'trash');
  }
  for (let i = 0; i < 3; i++) register(`trash-${i}`, ['罐瓶回收箱', '塑料瓶回收箱', '可燃垃圾箱'][i], [4.64, 1.0, -3.70 - i * .63], () => disposeWrapper(i), { prompt: () => state.wrappers ? `投放空包装 ×${state.wrappers}` : '查看分类垃圾箱' });

  const bicyclePosition = new THREE.Vector3(4.5, .8, -1.15);
  function currentBicyclePosition() {
    if (state.bike) return playerRoot.getWorldPosition(bicyclePosition);
    if (propsRefs.bicycle) { propsRefs.bicycle.getWorldPosition(bicyclePosition); bicyclePosition.y += .5; }
    return bicyclePosition;
  }
  register('bicycle', '薄荷绿自行车', currentBicyclePosition().clone(), () => {
    if (state.crate) { say('先放下搬运箱再骑车。'); return; }
    closeReading(); if (!state.bike) clearEquipment(); state.bike = !state.bike;
    if (propsRefs.bicycle) propsRefs.bicycle.visible = !state.bike;
    onRide(state.bike); refreshHeld(); say(state.bike ? '跨上自行车，WASD 骑行；F 或 R 下车。' : '停好自行车，回到步行。', 'bicycle');
  }, { positionProvider: currentBicyclePosition, prompt: () => state.bike ? '停车下车' : '骑上自行车', range: 1.9 });

  const lampLight = propsRefs.lampLight, initialLampIntensity = lampLight?.intensity ?? 20;
  register('street-lamp', '路灯检修开关', [5.22, 1.35, 3.02], () => {
    state.lampOn = !state.lampOn; if (lampLight) lampLight.intensity = state.lampOn ? initialLampIntensity : 0;
    for (const glow of propsRefs.lampGlow || []) { if (!glow.userData.liveLampMaterial) { glow.material = glow.material.clone(); glow.userData.liveLampMaterial = true; glow.userData.lampEmissive = glow.material.emissiveIntensity; } glow.material.emissiveIntensity = state.lampOn ? glow.userData.lampEmissive : 0; }
    say(state.lampOn ? '暖黄色的街灯重新亮起。' : '路灯熄灭，雨夜更暗了。', 'switch');
  }, { prompt: () => `${state.lampOn ? '关闭' : '打开'}街灯` });
  for (let i = 0; i < 2; i++) register(`air-conditioner-${i}`, '空调外机', [-5.03 + i * 1.35, .82, -6.6], () => {
    state.fansOn = !state.fansOn; say(state.fansOn ? '外机风扇转动起来。' : '外机风扇缓缓停止。', 'switch');
  }, { prompt: () => `${state.fansOn ? '关闭' : '启动'}空调风扇` });

  const fallbackCrates = [[-6.67, .045, -3.76], [-6.67, .335, -3.76], [-6.14, .045, -3.76]];
  const crates = propsRefs.crates?.length ? propsRefs.crates : fallbackCrates.map((p, i) => {
    const g = new THREE.Group(); g.position.copy(vec(p)); dynamic.add(g); box(.48, .29, .54, i === 2 ? '#ae8d62' : '#779c85', g, 0, .145, 0); return { group: g, position: g.position.clone() };
  });
  const floorAt = options.floorAt || ((x, z) => {
    if (x >= -5.7 && x <= 3.7 && z >= -5.6 && z <= 1.53) return .49;
    if (x >= -5.9 && x <= 5.8 && z >= 1.4 && z <= 3.7) return .30;
    if (x >= 3.7 && x <= 5.8 && z >= -6.4 && z <= 3.7) return .30;
    if (x >= -4.91 && x <= -3.39 && z >= 4.82 && z <= 5.06) return .212;
    return .045;
  });
  function dropCrate() {
    if (!state.crate) return false;
    const index = state.crate.index, ref = crates[index], target = playerRoot.getWorldPosition(new THREE.Vector3());
    forward.set(0, 0, 1).applyQuaternion(playerRoot.quaternion); target.addScaledVector(forward, .68);
    // Do not drop into the shop walls or off the square base.
    target.x = THREE.MathUtils.clamp(target.x, -8.15, 8.15); target.z = THREE.MathUtils.clamp(target.z, -8.15, 8.15);
    target.y = floorAt(target.x, target.z);
    if (options.resolveDrop) {
      const result = options.resolveDrop(target, .38);
      if (result === null || result === false) { say('这里放不下搬运箱，请换到空旷的地面。'); return true; }
      if (result?.isVector3) target.copy(result);
      else if (Array.isArray(result)) target.fromArray(result);
    }
    target.y = floorAt(target.x, target.z);
    if (![target.x, target.y, target.z].every(Number.isFinite)) { say('这里没有可放置的地面。'); return true; }
    const currentWorld = ref.group.getWorldPosition(new THREE.Vector3()); scene.attach(ref.group); ref.group.position.copy(currentWorld);
    const origin = ref.group.position.clone();
    droppingCrateIndex = index; ref.dropping = true; cooldown = Math.max(cooldown, .24);
    animate(.22, t => ref.group.position.lerpVectors(origin, target, t), () => { ref.position.copy(target); ref.dropping = false; droppingCrateIndex = null; });
    state.crate = null; refreshHeld(); say('搬运箱放下了。', 'drop'); return true;
  }
  crates.forEach((ref, i) => register(`crate-${i}`, '搬运箱', ref.position, () => {
    if (state.crate) { dropCrate(); return; }
    closeReading(); clearEquipment();
    playerRoot.attach(ref.group); ref.group.position.set(0, .90, .63); ref.group.rotation.set(0, 0, 0);
    state.crate = { index: i }; closeReading(); refreshHeld(); say('抱起搬运箱，走到合适的位置按 R 放下。', 'pickup');
  }, { positionProvider: () => state.crate?.index === i ? playerRoot.position : ref.position, enabled: () => !ref.dropping && (!state.crate || state.crate.index === i),
    prompt: () => state.crate?.index === i ? '放下搬运箱' : '抱起搬运箱' }));

  function interact(targetId) {
    if (cooldown > 0) return false;
    if (state.reading && !targetId) { closeReading(); say('读物已放回原处。'); return true; }
    const target = targetId ? targets.find(t => t.id === targetId) : nearest();
    if (!target || !allowed(target)) return false;
    cooldown = .24; actionTime = .45; currentAction = 'interact'; target.action(); refreshHeld(); return true;
  }
  function useItem(id = economy.held()?.id || (state.umbrellaEquipped ? 'umbrella' : null)) {
    if (id === 'umbrella') return toggleUmbrella();
    if (cooldown > 0 || eatTime > 0) return false;
    if (state.crate) { say('搬运箱请放到地面。'); return false; }
    if (state.bike) { say('请先停车，再使用随身物品。'); return false; }
    const item = [...state.inventory, ...state.basket].find(item => item.id === id);
    if (!item) return false;
    if (!item.paid) { say('这件商品还没有付款，请先到收银台结账。'); return false; }
    closeReading(); clearEquipment(); economy.select(id); refreshHeld();
    const result = economy.consume(id);
    if (!result.ok) return false;
    // A selected stored item is taken out for this animation, then hands stay
    // empty. No different item is silently equipped after consumption.
    const consumed = heldVisual; consumptionVisual = consumed; heldVisual = null; heldVisualId = null;
    const token = ++handActionEpoch, p = handAnchor.position.clone();
    eatTime = .85; cooldown = .88; actionTime = .88;
    currentAction = result.item.kind === 'drink' || result.item.kind === 'coffee' ? 'drink' : 'eat';
    animate(.8, t => {
      if (token !== handActionEpoch) return;
      if (!handSocket) handAnchor.position.set(p.x * (1 - Math.sin(t * Math.PI) * .7), p.y + Math.sin(t * Math.PI) * .32, p.z - Math.sin(t * Math.PI) * .17);
      if (consumed) consumed.rotation.x = -Math.sin(t * Math.PI) * .6;
    }, () => {
      if (token !== handActionEpoch) return;
      consumed?.removeFromParent(); consumptionVisual = null; handAnchor.position.copy(p); refreshHeld();
    });
    say(`${result.item.kind === 'drink' || result.item.kind === 'coffee' ? '喝完' : '吃完'}${result.item.name}了。留下 1 件空包装，可投入街角垃圾箱。`, 'eat');
    return true;
  }
  function actionSecondary() {
    if (cooldown > 0) return false;
    if (state.reading) { state.reading.page = (state.reading.page + 1) % state.reading.total; refreshPage(); return true; }
    if (state.bike) return interact('bicycle');
    if (dropCrate()) return true;
    const target = nearest();
    if (target?.id === 'vending') { selectedDrink = (selectedDrink + 1) % drinks.length; say(`选中${drinks[selectedDrink].name} · ¥${drinks[selectedDrink].price}。`, 'switch'); return true; }
    return useItem();
  }
  function update(dt, time) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0; elapsed = Number.isFinite(time) ? time : elapsed + dt;
    cooldown = Math.max(0, cooldown - dt); actionTime = Math.max(0, actionTime - dt); if (!actionTime) currentAction = null;
    for (let i = animations.length - 1; i >= 0; i--) {
      const a = animations[i]; a.elapsed += dt; const t = Math.min(a.elapsed / a.duration, 1); a.update(t);
      if (t === 1) { animations.splice(i, 1); a.complete(); }
    }
    for (const container of containers.values()) {
      container.value = THREE.MathUtils.damp(container.value, container.open ? 1 : 0, 7, dt);
      if (container.kind === 'fridge') for (const leaf of container.ref.doors || []) leaf.group.position.x = leaf.slide * container.value;
      else container.ref.group.position.z = -.72 * container.value;
    }
    if (door?.getBackOpen) backOpen = !!door.getBackOpen();
    backValue = THREE.MathUtils.damp(backValue, backOpen ? 1 : 0, 7, dt);
    if (interiorRefs.backDoor?.pivot) interiorRefs.backDoor.pivot.rotation.y = -Math.PI * .52 * backValue;
    if (state.coffee.status === 'brewing') {
      coffeeTime += dt; state.coffee.progress = Math.min(coffeeTime / 3.6, 1);
      coffeeStream.scale.x = .7 + Math.sin(elapsed * 25) * .2; steam.visible = coffeeTime > 1;
      if (coffeeRef?.fill) coffeeRef.fill.position.y = 1.605 + .052 * state.coffee.progress;
      if (state.coffee.progress >= 1) { state.coffee.status = 'ready'; coffeeStream.visible = false; say('咖啡已经冲好，回到咖啡机取杯。', 'ready'); }
    }
    steam.children.forEach((puff, i) => { puff.position.y = 1.75 + ((elapsed * .10 + i * .06) % .22); puff.position.x = 2.7 + Math.sin(elapsed * 2 + i) * .025; });
    syncUmbrella(dt);
    fanRotation = THREE.MathUtils.damp(fanRotation, state.fansOn ? 9 : 0, 2, dt);
    for (const fan of propsRefs.fans || []) fan.rotation.z += fanRotation * dt;
    eatTime = Math.max(0, eatTime - dt); if (!eatTime) refreshHeld();
    focused = nearest();
  }
  function getFocused() { focused = nearest(); return focused ? { id: focused.id, label: focused.label, prompt: prompt(focused), position: focused.position.clone(), range: focused.range } : null; }
  function getInventoryItems() {
    const items = state.inventory.map(item => ({ ...item, category: 'food', count: 1, equipped: state.heldId === item.id,
      stored: state.heldId !== item.id, canEquip: true, canUse: true, description: '已付款的便利店商品。可以收进背包、取出手持或直接使用。' }));
    if (state.umbrellaOwned) items.push({ id: 'umbrella', name: '透明雨伞', kind: 'umbrella', category: 'gadgets', count: 1, paid: true, price: 0,
      color: '#93c4c7', equipped: state.umbrellaEquipped, stored: !state.umbrellaEquipped, canEquip: true, canUse: state.umbrellaEquipped,
      description: '轻便的透明折伞。取出时保持收拢；装备后按 U 撑开，收进背包后不再占用双手。' });
    return items;
  }
  function getState() {
    return { yen: state.yen, basket: state.basket.map(i => ({ ...i, equipped: state.heldId === i.id, canEquip: true, canUse: false })), inventory: state.inventory.map(i => ({ ...i })), held: economy.held() ? { ...economy.held() } : null,
      equipmentId: state.umbrellaEquipped ? 'umbrella' : state.heldId, inventoryItems: getInventoryItems(),
      wrappers: state.wrappers, basketEquipped: state.basketEquipped, umbrella: state.umbrella, umbrellaOpen: state.umbrella,
      umbrellaOwned: state.umbrellaOwned, umbrellaEquipped: state.umbrellaEquipped, bike: state.bike,
      reading: state.reading ? { ...state.reading } : null, coffee: { ...state.coffee }, receipt: state.receipt, lampOn: state.lampOn, fansOn: state.fansOn,
      crate: !!state.crate, crateIndex: state.crate?.index ?? droppingCrateIndex, selectedDrink: drinks[selectedDrink].name, backDoorOpen: backOpen, action: currentAction };
  }
  refreshHeld();
  return { update, interact, actionSecondary, getFocused, getState, getInventoryItems, stowHeld, equipItem, useItem,
    getTargets: () => targets.map(t => { if (t.positionProvider) t.position.copy(t.positionProvider()); return { id: t.id, label: t.label, prompt: prompt(t), position: t.position.clone(), range: t.range, available: !t.enabled || t.enabled() }; }),
    selectHeld: equipItem, toggleUmbrella, closeReading,
    dispose: () => { dynamic.removeFromParent(); handAnchor.removeFromParent(); basketVisual.removeFromParent(); umbrella.removeFromParent(); closeReading(); }
  };
}
