// The miniature's street and raised, jointed L-shaped pavement.
// All coordinates remain within the 18 m square plinth.
export function buildGround(ctx) {
  const { THREE, box, cyl, mat, add } = ctx;
  const ROAD = 0.062;
  const PAVEMENT = 0.304;
  const slate = '#6e7f89';
  const paint = '#bfc9bf';
  const dark = '#192c3a';

  function lines(points, color, opacity = 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false });
    const mesh = new THREE.LineSegments(geometry, material);
    add(mesh);
    return mesh;
  }

  function instances(geometry, color, transforms, options = {}) {
    const mesh = new THREE.InstancedMesh(geometry, mat(color, options), transforms.length);
    const transform = new THREE.Object3D();
    transforms.forEach((t, i) => {
      transform.position.set(t.x, t.y, t.z);
      transform.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
      transform.scale.set(t.sx || 1, t.sy || 1, t.sz || 1);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    add(mesh);
    return mesh;
  }

  // A single continuous cap makes the model read as a built piece of pavement.
  const outline = [
    [-5.9, 1.4], [3.7, 1.4], [3.7, -6.4], [5.8, -6.4],
    [5.8, 3.7], [-5.9, 3.7],
  ];
  const sidewalk = new THREE.Shape();
  outline.forEach(([x, z], i) => i ? sidewalk.lineTo(x, -z) : sidewalk.moveTo(x, -z));
  sidewalk.closePath();
  const pavementGeometry = new THREE.ExtrudeGeometry(sidewalk, { depth: 0.255, bevelEnabled: false });
  pavementGeometry.rotateX(-Math.PI / 2);
  const pavement = new THREE.Mesh(pavementGeometry, [mat(slate, { roughness: 0.64 }), mat('#526571', { roughness: 0.8 })]);
  pavement.position.y = 0.045;
  pavement.receiveShadow = true;
  pavement.castShadow = true;
  add(pavement);

  // Fine large-format slabs, with visible joints continuing over the kerb face.
  const joints = [];
  for (let x = -5.9; x <= 5.81; x += 0.65) {
    joints.push([x, PAVEMENT, 1.41], [x, PAVEMENT, 3.7]);
    joints.push([x, 0.07, 3.705], [x, 0.30, 3.705]);
  }
  for (let z = 1.4; z <= 3.71; z += 0.575) joints.push([-5.9, PAVEMENT, z], [5.8, PAVEMENT, z]);
  for (let x = 3.7; x <= 5.81; x += 0.7) joints.push([x, PAVEMENT, -6.4], [x, PAVEMENT, 1.4]);
  for (let z = -6.4; z <= 3.71; z += 0.65) {
    if (z < 1.4) joints.push([3.7, PAVEMENT, z], [5.8, PAVEMENT, z]);
    joints.push([5.805, 0.07, z], [5.805, 0.30, z]);
  }
  lines(joints, '#344c5c', 0.38);
  box(11.7, 0.012, 0.11, -0.05, 0.306, 3.645, '#94a5aa', { roughness: 0.55 });
  box(0.11, 0.012, 10.1, 5.745, 0.306, -1.35, '#8b9ea4', { roughness: 0.55 });
  box(0.11, 0.012, 2.3, -5.845, 0.306, 2.55, '#8499a0');
  const capJoints = [];
  for (let x = -5.9; x <= 5.81; x += 0.65) capJoints.push([x, 0.314, 3.587], [x, 0.314, 3.701]);
  for (let z = -6.4; z <= 3.71; z += 0.65) capJoints.push([5.687, 0.314, z], [5.801, 0.314, z]);
  lines(capJoints, '#324b57', 0.65);

  // The tactile route connects the entrance to the corner crossing.
  const tactileTiles = [];
  for (let x = -0.65; x <= 3.42; x += 0.34) tactileTiles.push({ x, y: 0.314, z: 3.18 });
  for (let z = 1.75; z <= 2.84; z += 0.34) tactileTiles.push({ x: 1.73, y: 0.314, z });
  instances(new THREE.BoxGeometry(0.316, 0.02, 0.316), '#bbac63', tactileTiles, { roughness: 0.7 });
  const tactileBars = [];
  const tactileDots = [];
  tactileTiles.forEach((tile) => {
    if (Math.abs(tile.x - 1.73) < 0.05 && tile.z > 3) {
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) tactileDots.push({ x: tile.x + i * 0.083, y: 0.331, z: tile.z + j * 0.083 });
    } else {
      for (let offset = -1; offset <= 1; offset++) tactileBars.push({
        x: tile.x + (tile.z < 3 ? offset * 0.078 : 0),
        y: 0.332,
        z: tile.z + (tile.z < 3 ? 0 : offset * 0.078),
        ry: tile.z < 3 ? Math.PI / 2 : 0,
      });
    }
  });
  instances(new THREE.BoxGeometry(0.242, 0.018, 0.021), '#d0bf73', tactileBars, { roughness: 0.62 });
  if (tactileDots.length) instances(new THREE.CylinderGeometry(0.021, 0.025, 0.013, 6), '#d0bf73', tactileDots);

  // Recessed gutters and cast metal drain gratings on both street edges.
  box(11.65, 0.008, 0.085, -0.025, 0.052, 3.755, '#182d3a', { roughness: 0.24 });
  box(0.085, 0.008, 10.1, 5.855, 0.052, -1.35, '#182d3a', { roughness: 0.24 });
  const drainPositions = [
    [-5.13, 3.79, false], [-1.13, 3.79, false], [4.85, 3.79, false],
    [5.89, -5.5, true], [5.89, -1.6, true], [5.89, 2.55, true],
  ];
  const grateBars = [];
  drainPositions.forEach(([x, z, turn]) => {
    box(turn ? 0.23 : 0.67, 0.016, turn ? 0.67 : 0.23, x, 0.060, z, '#111f2b', { roughness: 0.3 });
    box(turn ? 0.26 : 0.72, 0.008, turn ? 0.72 : 0.035, x, 0.065, z + (turn ? 0 : 0.125), '#5a7079', { metalness: 0.6, roughness: 0.3 });
    for (let n = -4; n <= 4; n++) grateBars.push({ x: x + (turn ? 0 : n * 0.068), y: 0.073, z: z + (turn ? n * 0.068 : 0), ry: turn ? Math.PI / 2 : 0 });
  });
  instances(new THREE.BoxGeometry(0.024, 0.014, 0.215), '#506a74', grateBars, { metalness: 0.65, roughness: 0.28 });

  // Zebra paint is slightly warm and translucent against the wet blacktop.
  const roadPaintMaterial = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.24, metalness: 0.12, transparent: true, opacity: 0.83, polygonOffset: true, polygonOffsetFactor: -2 });
  function roadRect(w, d, x, z, material = roadPaintMaterial, y = ROAD) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    add(mesh);
    return mesh;
  }
  for (let z = 4.14; z < 8.7; z += 0.72) roadRect(3.4, 0.39, 3.0, z);

  // A single compact parking place and its low concrete wheel stop.
  roadRect(0.075, 4.0, -5.8, 6.5);
  roadRect(0.075, 4.0, -2.5, 6.5);
  roadRect(3.3, 0.075, -4.15, 4.5);
  roadRect(0.64, 0.075, -5.48, 8.5);
  roadRect(0.64, 0.075, -2.82, 8.5);
  box(1.52, 0.15, 0.23, -4.15, 0.127, 4.94, '#7d8989', { roughness: 0.85 });
  box(0.24, 0.026, 0.15, -4.65, 0.211, 4.94, '#bfb98e', { roughness: 0.5 });
  box(0.24, 0.026, 0.15, -3.65, 0.211, 4.94, '#bfb98e', { roughness: 0.5 });

  function pavementText(text, width, depth, x, z, vertical = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = vertical ? 768 : 256;
    const c = canvas.getContext('2d');
    c.fillStyle = '#c5d0c9';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `800 ${vertical ? 206 : 222}px "Yu Gothic", "Hiragino Kaku Gothic ProN", Arial, sans-serif`;
    if (vertical) [...text].forEach((letter, i) => c.fillText(letter, 128, 138 + i * 244));
    else c.fillText(text, 128, 139);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, opacity: 0.69, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide });
    return roadRect(width, depth, x, z, material, 0.068);
  }
  pavementText('P', 0.84, 0.84, -4.15, 7.33);
  pavementText('止まれ', 0.77, 2.42, 7.35, 6.23, true);
  roadRect(2.35, 0.18, 7.32, 4.12);

  // Short edge lines imply the street continuing around the compact corner.
  const amberMaterial = new THREE.MeshStandardMaterial({ color: '#ad8850', transparent: true, opacity: 0.63, roughness: 0.28 });
  roadRect(5.8, 0.052, -5.62, 8.71, amberMaterial);
  roadRect(0.052, 7.9, 8.71, -1.15, amberMaterial);

  // Cast-iron manhole: double rim, sunken central plate, and engraved grid.
  cyl(0.43, 0.43, 0.027, -0.82, 0.061, 6.26, '#243e4b', { roughness: 0.27, metalness: 0.5, radialSegments: 48 });
  cyl(0.383, 0.383, 0.011, -0.82, 0.079, 6.26, '#39525d', { roughness: 0.3, metalness: 0.4, radialSegments: 48 });
  const manholeLines = [];
  for (let t = -0.28; t <= 0.281; t += 0.08) {
    const half = Math.sqrt(0.35 * 0.35 - t * t);
    manholeLines.push([-0.82 + t, 0.087, 6.26 - half], [-0.82 + t, 0.087, 6.26 + half]);
    manholeLines.push([-0.82 - half, 0.087, 6.26 + t], [-0.82 + half, 0.087, 6.26 + t]);
  }
  lines(manholeLines, '#182c3a', 0.95);
  box(0.085, 0.006, 0.026, -0.82, 0.087, 6.54, '#0f2330');
  box(0.085, 0.006, 0.026, -0.82, 0.087, 5.98, '#0f2330');

  // Irregular, almost transparent puddles preserve the live reflected scene.
  const puddles = [
    [-7.25, 6.35, 1.1, 0.61, 1.2], [-6.55, 4.18, 1.30, 0.32, 2.4],
    [-4.1, 8.35, 0.97, 0.29, 3.7], [-1.00, 8.06, 1.48, 0.45, 1.8],
    [1.3, 5.15, 0.69, 0.33, 0.1], [5.39, 7.78, 0.65, 0.77, 2.7],
    [6.88, 1.05, 0.57, 1.17, 1.9], [7.8, -3.73, 0.42, 1.30, 3.0],
    [-7.39, -0.95, 0.74, 1.49, 1.0], [-7.8, -5.49, 0.53, 0.75, 2.9],
    [2.67, -7.40, 1.32, 0.62, 1.6], [-2.28, -7.80, 1.13, 0.54, 3.1],
  ];
  const puddleMaterial = new THREE.MeshBasicMaterial({ color: '#557e91', transparent: true, opacity: 0.075, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const glints = [];
  puddles.forEach(([x, z, rx, rz, seed], index) => {
    const shape = new THREE.Shape();
    const points = [];
    const count = 30;
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const r = 1 + 0.13 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 7 + seed * 2);
      points.push([Math.cos(a) * rx * r, Math.sin(a) * rz * r]);
    }
    points.forEach(([px, pz], i) => i ? shape.lineTo(px, -pz) : shape.moveTo(px, -pz));
    shape.closePath();
    const patch = new THREE.Mesh(new THREE.ShapeGeometry(shape), puddleMaterial);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.056 + index * 0.00002, z);
    add(patch);
    // Small interrupted rims suggest pooling water without drawing full outlines.
    for (let i = 2; i < 8; i++) {
      const p = points[i], q = points[i + 1];
      glints.push([x + p[0], 0.063, z + p[1]], [x + q[0], 0.063, z + q[1]]);
    }
  });
  lines(glints, '#6b97a7', 0.27);

  // A few hairline repaired seams and little glancing highlights in the alley.
  lines([
    [-8.67, 0.063, 2.30], [-7.96, 0.063, 2.17],
    [-7.96, 0.063, 2.17], [-7.34, 0.063, 2.46],
    [-7.34, 0.063, 2.46], [-6.85, 0.063, 2.43],
    [6.67, 0.063, -6.87], [7.55, 0.063, -6.43],
    [7.55, 0.063, -6.43], [8.16, 0.063, -6.62],
    [-5.57, 0.063, -7.48], [-4.92, 0.063, -7.29],
    [-4.92, 0.063, -7.29], [-4.21, 0.063, -7.37],
  ], dark, 0.78);

  return { pavement, roadLevel: ROAD, sidewalkLevel: PAVEMENT };
}
