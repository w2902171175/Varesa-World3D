// A fully furnished, unoccupied convenience store. Units are metres.
export function buildInterior(ctx) {
  const { THREE, group, box, cyl, sphere, tube, label, plane, mat, add } = ctx;
  const F = 0.49;
  const cream = '#f3e9c9', metal = '#b8d6d5', teal = '#388c86';
  const ink = '#24444d', shelf = '#ece8d9', coral = '#f08e7d';
  const pastel = ['#efab83', '#7cbfba', '#e9d278', '#b4a7cd', '#ef9daf', '#a7c785'];
  const refs = { products: [], fridges: [], magazines: [], baskets: [] };
  // Movable stock is deliberately separate from the baked architecture.
  function capture(start, position, data = {}) {
    const objects = group.children.slice(start);
    const dynamic = new THREE.Group(); dynamic.userData.dynamic = true;
    dynamic.name = data.id || data.kind || 'interactive-store-object';
    for (const object of objects) {
      object.traverse(o => { o.userData.dynamic = true; });
      dynamic.add(object);
    }
    group.add(dynamic);
    return { ...data, group: dynamic, position: new THREE.Vector3(...position) };
  }

  // The visible floor, its fine tile seams and a few modest queue markings.
  box(8.96, .025, 6.40, -1, F - .014, -2.09, '#e5cfa8', {emissive:'#c79d57',emissiveIntensity:.08});
  for (let x = -5.44; x < 3.5; x += .75) box(.012, .003, 6.37, x, F + .002, -2.1, '#cecbbc');
  for (let z = -5.25; z < 1.11; z += .75) box(8.9, .003, .012, -1, F + .003, z, '#cecbbc');
  // Low inlaid route markings are part of the model, rather than viewer UI.
  for (const z of [-.3, -1.2]) {
    box(.40, .007, .032, .54, F + .007, z, '#cf9968');
    box(.032, .007, .22, .34, F + .007, z + .10, '#cf9968');
    box(.032, .007, .22, .74, F + .007, z + .10, '#cf9968');
  }

  // Refrigerated drinks: illuminated white housings, individual shelf lips,
  // four full rows of miniature labelled bottles and clear sliding doors.
  function bottle(x, y, z, color, i, bay) {
    const start = group.children.length;
    const h = i % 4 === 0 ? .25 : .29;
    cyl(.066, .070, h, x, y + h / 2, z, color, { emissive: color, emissiveIntensity: .045 });
    cyl(.037, .046, .043, x, y + h + .016, z, i % 3 === 0 ? '#f5eee0' : '#597f79');
    box(.095, .09, .009, x, y + h * .53, z + .067, i % 2 ? '#fff0c5' : '#eef6ea');
    refs.products.push(capture(start, [x, y + h / 2, z], { id: `drink-${refs.products.length}`, kind: 'drink', name: bay === 1 ? '冰绿茶' : bay === 2 ? '果味牛奶' : '柚子汽水', price: 150, color, containerId: `fridge-${bay}` }));
  }
  const drinkNames = ['冷たいドリンク', 'TEA  /  お茶', 'MILK  &  JUICE'];
  for (let bay = 0; bay < 3; bay++) {
    const x = -4.41 + bay * 1.78;
    box(1.69, 2.68, .63, x, F + 1.34, -4.96, '#e1e6dd');
    box(1.51, 2.24, .025, x, F + 1.33, -4.62, '#bbdbd4', { emissive: '#a9dad9', emissiveIntensity: .30 });
    box(1.55, .11, .66, x, F + .14, -4.95, '#768f8c');
    box(1.61, .25, .65, x, F + 2.58, -4.94, '#f3f5de', { emissive: '#ffffdb', emissiveIntensity: .48 });
    label(drinkNames[bay], 1.45, .20, x, F + 2.58, -4.602, { bg: '#f3f5de', fg: '#4c8b84' });
    for (let row = 0; row < 4; row++) {
      const y = F + .27 + row * .54;
      box(1.53, .045, .48, x, y, -4.74, '#dcebe1');
      box(1.54, .068, .028, x, y + .019, -4.48, '#edf0d7');
      for (let col = 0; col < 5; col++) {
        bottle(x - .58 + col * .287, y + .026, -4.64, pastel[(row + col + bay * 2) % pastel.length], row + col + bay, bay);
        box(.105, .026, .008, x - .58 + col * .287, y + .015, -4.46, '#809b85');
      }
    }
    for (const dx of [-.81, 0, .81]) box(.034, 2.37, .065, x + dx, F + 1.34, -4.40, '#b3c9be');
    const fridge = { id: `fridge-${bay}`, position: new THREE.Vector3(x, 1.3, -4.37), doors: [] };
    for (const dx of [-.42, .42]) {
      const start = group.children.length;
      plane(.76, 2.26, x + dx, F + 1.33, -4.388, '#c6e9df', { transparent: true, opacity: .07 });
      box(.028, .40, .040, x + dx + (dx < 0 ? .29 : -.29), F + 1.34, -4.357, '#819996');
      fridge.doors.push({ ...capture(start, [x + dx, F + 1.33, -4.388]), slide: dx < 0 ? .72 : -.72 });
    }
    refs.fridges.push(fridge);
    box(.025, 2.20, .025, x - .76, F + 1.31, -4.35, '#efffe6', { emissive: '#deffe8', emissiveIntensity: .8 });
  }

  // Narrow stocked gondolas leave the warm rear wall and counter visible.
  // Every package has a coloured sleeve, a contrasting front and a price tab.
  function grocery(x, y, z, side, color, i) {
    const start = group.children.length;
    const h = .21 + (i % 3) * .031;
    const m = box(.16, h, .27, x, y + h / 2, z, color);
    if (i % 3 === 0) m.rotation.z = side * -.035;
    box(.012, h * .53, .20, x + side * .085, y + h * .54, z, '#fff0cd');
    if (i % 4 === 1) box(.017, .034, .16, x + side * .093, y + h * .6, z, color);
    refs.products.push(capture(start, [x, y + h / 2, z], { id: `snack-${refs.products.length}`, kind: 'snack', name: ['海盐薯片', '草莓饼干', '抹茶巧克力'][i % 3], price: 130 + i % 3 * 30, color }));
  }
  for (let gondola = 0; gondola < 2; gondola++) {
    const x = -3.57 + gondola * 2.36, z = -2.11;
    box(.90, .17, 2.74, x, F + .14, z, '#64958d');
    box(.10, 1.04, 2.62, x, F + .66, z, '#d7dfc9');
    for (const dz of [-1.30, 1.30]) box(.09, 1.20, .06, x, F + .71, z + dz, '#d4dfce');
    for (let row = 0; row < 3; row++) {
      const y = F + .26 + row * .36;
      box(.96, .043, 2.70, x, y, z, shelf);
      for (const side of [-1, 1]) {
        box(.022, .064, 2.71, x + side * .473, y + .018, z, row === 2 ? coral : '#f6d98b');
        for (let col = 0; col < 5; col++) {
          const pz = z - 1.06 + col * .52;
          grocery(x + side * .28, y + .023, pz, side, pastel[(col + row * 2 + gondola) % 6], col + row);
          box(.006, .023, .106, x + side * .487, y + .023, pz, '#64877e');
        }
      }
    }
    box(.10, .055, 2.77, x, F + 1.26, z, '#c0ba92');
    label(gondola === 0 ? 'お菓子' : '新発売', .73, .32, x, F + .91, z + 1.392,
      { bg: gondola === 0 ? '#d08c82' : '#568f84', fg: '#fff5db' });
    label(gondola === 0 ? 'SNACKS' : 'FRESH DAILY', .72, .17, x, F + .58, z + 1.393,
      { bg: '#ece8d9', fg: '#648177' });
  }

  // A long chilled lunch display on the left, with rice, vegetables and a
  // recognisable little triangular seaweed-wrapped onigiri selection.
  box(.66, .63, 3.37, -5.13, F + .365, -2.48, '#cad6bd');
  box(.73, .065, 3.42, -5.13, F + .706, -2.48, '#f1e9c5');
  box(.045, .31, 3.40, -5.48, F + .88, -2.48, '#d6d7bc');
  for (let i = 0; i < 5; i++) {
    const start = group.children.length;
    const z = -3.78 + i * .61;
    box(.48, .05, .45, -5.08, F + .755, z, '#38534f');
    box(.21, .045, .34, -5.18, F + .796, z, '#fff3d2');
    box(.16, .058, .13, -4.96, F + .80, z - .104, '#cb9b5d');
    box(.14, .066, .12, -4.96, F + .804, z + .10, i % 2 ? '#729e65' : '#e4956c');
    // The clear lid catches the cabinet lights.
    box(.49, .012, .46, -5.08, F + .85, z, '#cce6dc', { transparent: true, opacity: .16 });
    refs.products.push(capture(start, [-5.08, F + .80, z], { id: `bento-${i}`, kind: 'bento', name: i % 2 ? '照烧鸡肉便当' : '时蔬便当', price: 420, color: '#d79c68' }));
  }
  label('お弁当  •  毎日できたて', 2.74, .20, -4.755, F + .45, -2.48,
    { bg: '#cad6bd', fg: '#486a59', rotationY: Math.PI / 2 });
  box(.69, .038, 2.66, -5.13, F + 1.22, -2.61, '#e4e1c7');
  const riceShape = new THREE.Shape();
  riceShape.moveTo(-.095, 0); riceShape.lineTo(.095, 0); riceShape.quadraticCurveTo(.12, .015, .099, .06);
  riceShape.lineTo(.023, .20); riceShape.quadraticCurveTo(0, .233, -.023, .20);
  riceShape.lineTo(-.099, .06); riceShape.quadraticCurveTo(-.12, .015, -.095, 0);
  const riceGeo = new THREE.ExtrudeGeometry(riceShape, { depth: .065, bevelEnabled: true, bevelThickness: .008, bevelSize: .008, bevelSegments: 1, steps: 1 });
  const riceMat = mat('#fff8dd');
  for (let i = 0; i < 8; i++) {
    const start = group.children.length;
    const z = -3.71 + i * .315;
    const m = new THREE.Mesh(riceGeo, riceMat); m.position.set(-5.1, F + 1.244, z); m.rotation.y = Math.PI / 2; add(m);
    box(.016, .101, .077, -5.020, F + 1.29, z, '#36584b');
    refs.products.push(capture(start, [-5.05, F + 1.32, z], { id: `onigiri-${i}`, kind: 'onigiri', name: i % 2 ? '鲑鱼饭团' : '梅子饭团', price: 140, color: '#f7e8c6' }));
  }
  label('おにぎり', 1.45, .20, -4.748, F + 1.225, -2.48, { bg: '#eddec0', fg: '#5f7e64', rotationY: Math.PI / 2 });

  // Backroom door, noticeboard and a raised little clock.
  const backDoorStart = group.children.length;
  box(1.29, 2.39, .085, 2.47, F + 1.195, -5.23, '#7caaa0');
  box(1.11, 2.20, .025, 2.47, F + 1.20, -5.176, '#b4c7b1');
  label('STAFF ONLY', .72, .18, 2.47, F + 1.54, -5.15, { bg: '#b4c7b1', fg: '#5c7568' });
  sphere(.041, 2.87, F + 1.10, -5.112, '#be9d6a');
  refs.backDoor = capture(backDoorStart, [2.47, F + 1.1, -5.23], { id: 'back-door' });
  const hinge = new THREE.Group(); hinge.position.set(1.82, F, -5.23); hinge.userData.dynamic = true;
  group.add(hinge); hinge.attach(refs.backDoor.group); refs.backDoor.pivot = hinge;
  box(.91, 1.02, .055, .97, F + 1.89, -5.19, '#aa9c71');
  box(.83, .94, .014, .97, F + 1.89, -5.15, '#d3c394');
  label('夜のおすすめ', .66, .29, .97, F + 2.13, -5.13, { bg: '#f2d18f', fg: '#986951' });
  label('HOT COFFEE\nいつでも淹れたて', .63, .40, .97, F + 1.71, -5.13, { bg: '#eeeee0', fg: '#689582' });
  const clockFace = cyl(.18, .18, .046, 2.45, F + 2.91, -5.1, '#f5ead1');
  clockFace.rotation.x = Math.PI / 2;
  box(.008, .12, .012, 2.45, F + 2.946, -5.063, '#536f65');
  const hand = box(.075, .010, .012, 2.483, F + 2.91, -5.064, '#536f65'); hand.rotation.z = -.25;

  // Checkout lies behind the entrance, opening a clear walkway through the
  // front-right glass. A warming cabinet, coffee machine and oden tray sit on it.
  box(1.39, .91, 2.20, 2.60, F + .49, -2.36, '#bdc6a6');
  box(1.43, .115, 2.26, 2.60, F + .985, -2.36, '#eae2b9');
  box(.065, .61, 2.08, 1.88, F + .49, -2.36, '#7c9d88');
  label('レジ', .52, .25, 2.60, F + .57, -1.22, { bg: '#bdc6a6', fg: '#4b735f' });
  // Point-of-sale terminal and its glowing customer display.
  box(.46, .055, .37, 2.15, F + 1.066, -1.63, '#5c7770');
  box(.08, .19, .07, 2.17, F + 1.19, -1.72, '#506961');
  const screen = box(.39, .28, .060, 2.17, F + 1.37, -1.72, '#536e68'); screen.rotation.x = -.17;
  const screenGlow = plane(.325, .217, 2.17, F + 1.37, -1.682, '#8cbcaf', { emissive: '#94e2c5', emissiveIntensity: .55 }); screenGlow.rotation.x = -.17;
  box(.29, .04, .20, 2.64, F + 1.07, -1.57, '#dca16a');
  box(.21, .018, .14, 2.64, F + 1.1, -1.57, '#f4e8c4');
  // Coffee machine with hopper, illuminated selector and a tiny waiting cup.
  box(.52, .58, .44, 2.71, F + 1.34, -2.87, '#51665f');
  box(.44, .42, .029, 2.71, F + 1.38, -2.633, '#bac8b9');
  box(.30, .17, .032, 2.71, F + 1.49, -2.61, '#477a72', { emissive: '#78c8aa', emissiveIntensity: .3 });
  box(.32, .14, .042, 2.71, F + 1.27, -2.602, '#324f4b');
  cyl(.10, .085, .13, 2.71, F + 1.672, -2.91, '#92745b');
  const cupStart = group.children.length;
  cyl(.06, .044, .105, 2.70, F + 1.112, -2.54, '#f5dfac');
  const coffeeFill = cyl(.051, .051, .005, 2.70, F + 1.167, -2.54, '#806451');
  refs.coffee = capture(cupStart, [2.70, F + 1.14, -2.54], { id: 'coffee', fill: coffeeFill });
  refs.coffee.position.set(1.92, 1.6, -2.95);
  label('COFFEE', .44, .11, 2.71, F + 1.76, -2.62, { bg: '#ecdfbf', fg: '#628778' });
  // Oden broth, metal dividers and assorted simmering ingredients.
  box(.65, .09, .60, 2.52, F + 1.082, -2.13, '#90aaa0');
  box(.57, .016, .52, 2.52, F + 1.135, -2.13, '#a47d4c');
  box(.014, .025, .53, 2.52, F + 1.15, -2.13, '#cbd6bd');
  box(.59, .025, .014, 2.52, F + 1.15, -2.13, '#cbd6bd');
  for (let i = 0; i < 4; i++) {
    const start = group.children.length;
    const x = 2.38 + (i % 2) * .28, z = -2.28 + Math.floor(i / 2) * .27;
    const radish = cyl(.069, .064, .040, x, F + 1.155, z, i % 2 ? '#ded8a4' : '#edd9a4');
    if (i % 2) radish.rotation.z = .3;
    sphere(.045, x + .064, F + 1.177, z + .06, '#cba268');
    refs.products.push(capture(start, [x, F + 1.17, z], { id: `oden-${i}`, kind: 'oden', name: '热关东煮', price: 200, color: '#ead5a0' }));
  }
  label('おでん', .51, .15, 2.52, F + .945, -1.824, { bg: '#e7c77e', fg: '#816c4a' });
  // Clear hot-food case beside the espresso station.
  box(.52, .05, .48, 3.05, F + 1.066, -3.1, '#cbbd91');
  for (const dx of [-.25, .25]) box(.025, .50, .44, 3.05 + dx, F + 1.32, -3.1, '#d1cbaa');
  box(.53, .045, .47, 3.05, F + 1.59, -3.1, '#eadbaf');
  plane(.47, .47, 3.05, F + 1.32, -2.862, '#e4edcf', { transparent: true, opacity: .13 });
  box(.46, .027, .40, 3.05, F + 1.30, -3.1, '#d7d8b7');
  for (let i = 0; i < 4; i++) sphere(.083, 2.92 + (i % 2) * .23, F + 1.13 + Math.floor(i / 2) * .25, -3.07, '#d69c55');
  // Hanging checkout lightbox and two small commercial ceiling fixtures.
  box(1.00, .35, .14, 2.10, F + 2.76, -1.35, '#f4e5b8', { emissive: '#ffe9aa', emissiveIntensity: .4 });
  label('お会計  /  CASHIER', .92, .27, 2.10, F + 2.76, -1.27, { bg: '#f4e5b8', fg: '#5b8673' });
  for (const x of [1.78, 2.43]) box(.012, .28, .012, x, F + 3.05, -1.35, '#b9c7b3');

  // Low ice-cream chest freezer, visible through the right side glazing.
  box(.91, .67, 1.10, 2.78, F + .385, -.39, '#87b4ad');
  box(.98, .09, 1.16, 2.78, F + .765, -.39, '#e5e7c9');
  box(.82, .018, .98, 2.78, F + .722, -.39, '#cbdfd0', { emissive: '#daf2d4', emissiveIntensity: .13 });
  for (let i = 0; i < 6; i++) {
    const start = group.children.length, x = 2.56 + (i % 2) * .42, z = -.70 + Math.floor(i / 2) * .32;
    box(.26, .11, .23, x, F + .713, z, pastel[i]);
    refs.products.push(capture(start, [x, F + .713, z], { id: `icecream-${i}`, kind: 'icecream', name: '北海道冰淇淋', price: 180, color: pastel[i], containerId: 'freezer' }));
  }
  const freezerStart = group.children.length;
  box(.029, .027, 1.03, 2.78, F + .823, -.39, '#b5c4ac');
  box(.87, .012, 1.05, 2.78, F + .824, -.39, '#b7d6cd', { transparent: true, opacity: .22 });
  refs.freezer = capture(freezerStart, [2.78, F + .824, -.39], { id: 'freezer' });
  label('ICE CREAM', .81, .23, 2.78, F + .46, .184, { bg: '#87b4ad', fg: '#fff4c9' });

  // Magazine stand hugs the front-left window, covers facing the rainy street.
  box(1.77, .15, .51, -4.37, F + .1, .61, '#7b9683');
  box(1.69, .77, .07, -4.37, F + .56, .46, '#c9d4bb');
  for (let row = 0; row < 2; row++) {
    const y = F + .21 + row * .35;
    box(1.81, .045, .31, -4.37, y, .63, '#e8dfbc');
    box(1.83, .093, .03, -4.37, y + .045, .80, '#96b09a');
    for (let i = 0; i < 5; i++) {
      const start = group.children.length;
      const x = -5.06 + i * .347;
      box(.275, .29, .031, x, y + .172, .667, pastel[(i + row * 2) % 6]);
      label(['旅', '暮', '週刊', 'CAFE', '本'][i], .223, .11, x, y + .24, .685,
        { bg: pastel[(i + row * 2) % 6], fg: '#fff8dd' });
      box(.17, .096, .006, x, y + .126, .686, i % 2 ? '#e7dbb3' : '#719991');
      refs.magazines.push(capture(start, [x, y + .17, .667], { id: `magazine-${row}-${i}`, kind: 'magazine', name: ['夜行旅记', '日常生活', '月见周刊', '咖啡时光', '街角书店'][i], color: pastel[(i + row * 2) % 6] }));
    }
  }
  label('MAGAZINES  /  雑誌', 1.64, .145, -4.37, F + .925, .513, { bg: '#e8dfbc', fg: '#608270' });

  // Tiny baskets, a services placard, and a wall mounted seasonal poster.
  for (let i = 0; i < 3; i++) {
    const start = group.children.length;
    box(.49, .067, .37, -2.90, F + .11 + i * .085, .68, '#6b9c8e');
    box(.42, .014, .30, -2.90, F + .15 + i * .085, .68, '#c5d3b6');
    refs.baskets.push(capture(start, [-2.90, F + .15 + i * .085, .68], { id: `basket-${i}` }));
  }
  label('宅配便  /  ATM', .86, .27, -.30, F + 2.73, -5.135, { bg: '#d48e7c', fg: '#fff1d4' });
  label('秋の味覚\nほっとする、ひととき。', .88, .83, -5.473, F + 2.17, -1.31,
    { bg: '#e8c99b', fg: '#8c7854', rotationY: Math.PI / 2 });

  // Light is deliberately warm and broad so stock stays legible from outside.
  for (const [x, z] of [[-3.37, -2.28], [.25, -2.83]]) {
    box(1.72, .075, .38, x, 3.88, z, '#f6edca', { emissive: '#fff4cd', emissiveIntensity: 1.8 });
  }
  const glow = new THREE.PointLight('#ffd194', 17.0, 10, 2);
  glow.position.set(-1.2, 3.25, -1.25); group.add(glow);
  const backGlow = new THREE.PointLight('#ffe3ad', 6.5, 7, 2);
  backGlow.position.set(-2.5, 2.7, -3.55); group.add(backGlow);
  return { ...refs, doorway: { x: [.2, 1.7], z: [.3, 1.2] }, stocked: true };
}
