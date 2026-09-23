import * as THREE from 'three';

// Semantic collision volumes follow the shop and prop dimensions, independent
// of rendering, batching, glass opacity, roof fading, or decorative triangles.
const EDGE = 8.65;
const EPSILON = 1e-6;
const MAX_SUBSTEP = 0.055;
const ROAD_Y = 0.045;
const SIDEWALK_Y = 0.30;
const SHOP_Y = 0.49;

function box(id, minX, maxX, minZ, maxZ, minY, maxY, extra = {}) {
  return Object.freeze({ id, type: 'aabb', minX, maxX, minZ, maxZ, minY, maxY, ...extra });
}

const COLLIDERS = Object.freeze([
  box('shop-left-wall', -5.83, -5.61, -5.74, 1.62, 0.30, 4.50),
  box('shop-right-glass', 3.59, 3.83, -5.74, 1.62, 0.30, 4.50),
  box('shop-rear-wall-left', -5.83, 1.80, -5.74, -5.53, 0.30, 4.50),
  box('shop-rear-wall-right', 3.12, 3.83, -5.74, -5.53, 0.30, 4.50),
  box('shop-front-glass', -5.83, 0.55, 1.32, 1.62, 0.30, 4.50),
  box('shop-front-right-jamb', 2.75, 3.83, 1.32, 1.62, 0.30, 4.50),
  box('automatic-doors', 0.55, 2.75, 1.44, 1.60, 0.30, 3.54, { disabledBy: 'doorOpen' }),
  box('rear-service-door', 1.80, 3.12, -5.79, -5.13, 0.045, 2.94, { disabledBy: 'backDoorOpen' }),

  box('drinks-refrigerators', -5.27, 0.015, -5.29, -4.33, 0.49, 3.25),
  box('snack-shelf', -4.05, -3.09, -3.495, -0.725, 0.49, 1.82),
  box('fresh-food-shelf', -1.69, -0.73, -3.495, -0.725, 0.49, 1.82),
  box('bento-and-onigiri-case', -5.495, -4.765, -4.19, -0.77, 0.49, 1.96),
  box('checkout-and-coffee', 1.845, 3.325, -3.49, -1.23, 0.49, 2.29),
  box('ice-cream-freezer', 2.29, 3.27, -0.97, 0.19, 0.49, 1.35),
  box('magazine-rack', -5.285, -3.455, 0.355, 0.90, 0.49, 1.48),
  box('shopping-baskets', -3.145, -2.655, 0.495, 0.865, 0.49, 0.86),

  box('vending-machine', -5.25, -4.05, 1.59, 2.58, 0.30, 2.72),
  box('parked-bicycle', 4.12, 4.87, -2.57, 0.065, 0.30, 1.96, { bicycle: true }),
  box('umbrella-rack', 3.07, 3.71, 1.89, 2.42, 0.30, 1.57),
  box('recycling-cans', 4.025, 4.675, -4.015, -3.385, 0.30, 1.23),
  box('recycling-bottles', 4.025, 4.675, -4.645, -4.015, 0.30, 1.23),
  box('refuse-bin', 4.025, 4.675, -5.275, -4.645, 0.30, 1.23),
  box('streetlamp-post', 4.99, 5.45, 2.79, 3.25, 0.30, 6.26),
  box('one-way-sign-post', 5.26, 5.36, 1.89, 1.99, 0.30, 2.75),
  box('front-guardrail', -2.02, 0.98, 3.475, 3.605, 0.30, 1.03),
  box('side-guardrail', 5.515, 5.645, -3.12, -0.72, 0.30, 0.99),
  box('front-utility-pole', -7.94, -7.30, 2.53, 3.17, 0.045, 7.93),
  box('rear-utility-pole', -7.94, -7.30, -7.34, -6.70, 0.045, 7.66),
  box('neighborhood-noticeboard', -7.355, -5.925, -0.44, -0.10, 0.045, 2.43),
  box('outside-ac-left', -5.64, -4.42, -6.64, -5.88, 0.045, 1.15),
  box('outside-ac-right', -4.29, -3.07, -6.64, -5.88, 0.045, 1.15),
  box('delivery-crates', -6.93, -5.88, -4.055, -3.465, 0.045, 0.70),
  // Pedestrians step onto this low stop; a bicycle must go around it.
  box('parking-wheel-stop', -4.91, -3.39, 4.82, 5.06, 0.045, 0.212, { onlyWhen: 'riding' }),
]);

const CAMERA_ONLY = Object.freeze([
  box('shop-roof', -6.04, 4.04, -5.90, 1.90, 4.47, 4.94),
  box('entrance-canopy', -6.10, 4.10, 1.17, 2.23, 3.44, 3.69),
  box('door-header', 0.48, 2.82, 1.36, 1.70, 3.34, 3.66),
  box('rear-door-lintel', 1.80, 3.12, -5.74, -5.53, 2.94, 4.50),
  box('lamp-head', 4.92, 5.52, 3.25, 4.03, 6.09, 6.36),
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

function active(collider, flags) {
  const ignored = flags.ignoreIds;
  if (ignored instanceof Set ? ignored.has(collider.id) : Array.isArray(ignored) && ignored.includes(collider.id)) return false;
  if (collider.disabledBy && flags[collider.disabledBy]) return false;
  if (collider.onlyWhen && !flags[collider.onlyWhen]) return false;
  if (collider.bicycle && (flags.riding || flags.bicycleMoved || flags.ignoreBicycle)) return false;
  return true;
}

function validDynamicBox(collider) {
  if (!collider || typeof collider !== 'object') return false;
  return ['X', 'Y', 'Z'].every((axis) => {
    const min = collider[`min${axis}`];
    const max = collider[`max${axis}`];
    return Number.isFinite(min) && Number.isFinite(max) && min <= max;
  });
}

function floorAt(x, z) {
  if (x >= -5.70 && x <= 3.70 && z >= -5.60 && z <= 1.53) return SHOP_Y;
  if (x >= -5.90 && x <= 5.80 && z >= 1.40 && z <= 3.70) return SIDEWALK_Y;
  if (x >= 3.70 && x <= 5.80 && z >= -6.40 && z <= 3.70) return SIDEWALK_Y;
  if (x >= -4.91 && x <= -3.39 && z >= 4.82 && z <= 5.06) return 0.212;
  return ROAD_Y;
}

function radiusFor(flags) {
  const radius = clamp(finite(flags.radius, 0.23), 0.04, 1.5);
  return flags.riding ? Math.max(0.31, radius) : radius;
}

function clampToPlinth(position, radius) {
  const limit = EDGE - radius;
  position.x = clamp(position.x, -limit, limit);
  position.z = clamp(position.z, -limit, limit);
}

// Recover a position when a door closes, a ride ends, or a spawn was initially
// placed against scenery. Rounded corner projection avoids invisible square
// extensions at the ends of furniture and railings.
function depenetrate(position, radius, colliders) {
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const collider of colliders) {
      const closestX = clamp(position.x, collider.minX, collider.maxX);
      const closestZ = clamp(position.z, collider.minZ, collider.maxZ);
      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= radius * radius - EPSILON * EPSILON) continue;
      changed = true;
      if (distanceSquared > EPSILON * EPSILON) {
        const distance = Math.sqrt(distanceSquared);
        const correction = (radius - distance + EPSILON) / distance;
        position.x += dx * correction;
        position.z += dz * correction;
      } else {
        const sides = [
          [position.x - collider.minX + radius, 'x', collider.minX - radius - EPSILON],
          [collider.maxX - position.x + radius, 'x', collider.maxX + radius + EPSILON],
          [position.z - collider.minZ + radius, 'z', collider.minZ - radius - EPSILON],
          [collider.maxZ - position.z + radius, 'z', collider.maxZ + radius + EPSILON],
        ];
        sides.sort((a, b) => a[0] - b[0]);
        position[sides[0][1]] = sides[0][2];
      }
    }
    clampToPlinth(position, radius);
    if (!changed) break;
  }
  return position;
}

// Sweep one axis against the exact cross-section of each rounded AABB.
// Testing the swept interval rather than just the destination prevents even
// large accidental movement deltas from tunnelling through the glass.
function sweepAxis(position, amount, axis, radius, colliders) {
  if (Math.abs(amount) < EPSILON) return;
  const other = axis === 'x' ? 'z' : 'x';
  const minKey = axis === 'x' ? 'minX' : 'minZ';
  const maxKey = axis === 'x' ? 'maxX' : 'maxZ';
  const otherMin = axis === 'x' ? 'minZ' : 'minX';
  const otherMax = axis === 'x' ? 'maxZ' : 'maxX';
  const start = position[axis];
  let destination = start + amount;
  for (const collider of colliders) {
    const offset = position[other] - clamp(position[other], collider[otherMin], collider[otherMax]);
    if (Math.abs(offset) >= radius) continue;
    const reach = Math.sqrt(Math.max(0, radius * radius - offset * offset));
    const low = collider[minKey] - reach;
    const high = collider[maxKey] + reach;
    if (amount > 0 && start <= low + EPSILON && destination > low) destination = Math.min(destination, low - EPSILON);
    if (amount < 0 && start >= high - EPSILON && destination < high) destination = Math.max(destination, high + EPSILON);
  }
  position[axis] = destination;
}

function segmentBoxEntry(origin, direction, collider, margin) {
  let first = 0;
  let last = 1;
  for (const axis of ['x', 'y', 'z']) {
    const min = collider[`min${axis.toUpperCase()}`] - margin;
    const max = collider[`max${axis.toUpperCase()}`] + margin;
    if (Math.abs(direction[axis]) < EPSILON) {
      if (origin[axis] < min || origin[axis] > max) return null;
      continue;
    }
    let entry = (min - origin[axis]) / direction[axis];
    let exit = (max - origin[axis]) / direction[axis];
    if (entry > exit) [entry, exit] = [exit, entry];
    first = Math.max(first, entry);
    last = Math.min(last, exit);
    if (first > last) return null;
  }
  return first >= 0 && first <= 1 ? first : null;
}

/**
 * Feet-based 2.5D movement. Jump height is owned by the character controller:
 * use the returned ground y plus its jump offset, and floorAt() for landing.
 * Doors and bicycle state are explicit flags, never inferred from meshes.
 */
export function createPhysics() {
  function getColliders(flags = {}) {
    const dynamic = Array.isArray(flags.dynamicColliders) ? flags.dynamicColliders : [];
    return [
      ...COLLIDERS.filter((collider) => active(collider, flags)),
      ...dynamic.filter((collider) => validDynamicBox(collider) && active(collider, flags)),
    ];
  }

  function resolve(position, flags = {}) {
    const radius = radiusFor(flags);
    const result = new THREE.Vector3(finite(position.x), 0, finite(position.z));
    clampToPlinth(result, radius);
    depenetrate(result, radius, getColliders(flags));
    result.y = floorAt(result.x, result.z);
    return result;
  }

  function move(position, delta, flags = {}) {
    const radius = radiusFor(flags);
    const colliders = getColliders(flags);
    const result = new THREE.Vector3(finite(position.x), 0, finite(position.z));
    clampToPlinth(result, radius);
    depenetrate(result, radius, colliders);
    const dx = finite(delta?.x);
    const dz = finite(delta?.z);
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_SUBSTEP));
    const sx = dx / steps;
    const sz = dz / steps;
    for (let step = 0; step < steps; step++) {
      sweepAxis(result, sx, 'x', radius, colliders);
      sweepAxis(result, sz, 'z', radius, colliders);
      clampToPlinth(result, radius);
    }
    result.y = floorAt(result.x, result.z);
    return result;
  }

  function cameraClip(target, desired, flags = {}) {
    const origin = new THREE.Vector3(finite(target.x), finite(target.y), finite(target.z));
    const destination = new THREE.Vector3(finite(desired.x), finite(desired.y), finite(desired.z));
    const direction = destination.clone().sub(origin);
    const length = direction.length();
    if (length < EPSILON) return destination;
    const margin = clamp(finite(flags.cameraRadius, 0.12), 0, 0.5);
    let nearest = 1;
    for (const collider of [...getColliders(flags), ...CAMERA_ONLY.filter((item) => active(item, flags))]) {
      const entry = segmentBoxEntry(origin, direction, collider, margin);
      if (entry !== null) nearest = Math.min(nearest, entry);
    }
    // Keep the camera above the actual floor as well as out of vertical walls.
    const groundClearance = floorAt(destination.x, destination.z) + margin;
    if (destination.y < groundClearance && direction.y < -EPSILON) {
      nearest = Math.min(nearest, Math.max(0, (groundClearance - origin.y) / direction.y));
    }
    if (nearest < 1) nearest = Math.max(0, nearest - 0.025 / length);
    return origin.addScaledVector(direction, nearest);
  }

  return { move, resolve, floorAt, getColliders, cameraClip, boundary: EDGE };
}
