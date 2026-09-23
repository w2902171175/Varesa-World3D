import * as THREE from 'three';

const RECOVERY_RATE = 6;
const EPSILON = 1e-7;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * User-controlled third-person orbit with a retractable camera arm.
 * Yaw and pitch are supplied by the controller; obstacles only shorten the
 * arm on that ray. The target is followed directly, without lateral lag.
 */
export function createCameraFollow({ physics }) {
  if (!physics || typeof physics.cameraClip !== 'function') {
    throw new TypeError('createCameraFollow requires physics.cameraClip(target, desired, flags)');
  }

  let initialized = false;
  let armLength = 0;
  let previousYaw = 0;

  function reset() {
    initialized = false;
    armLength = previousYaw = 0;
  }

  // The manual option remains accepted for compatibility. User orbit input
  // always owns the angle, so it requires no separate avoidance-reset mode.
  function solve(target, preferredYaw, pitch, distance, dt, flags = {}, { snap = false } = {}) {
    const focus = new THREE.Vector3(finite(target?.x), finite(target?.y, 1.3), finite(target?.z));
    const yaw = finite(preferredYaw, previousYaw);
    const elevation = clamp(finite(pitch, 0.33), -0.35, 1.15);
    const distanceRequested = clamp(finite(distance, 4.5), 0.5, 20);
    const step = clamp(finite(dt, 1 / 60), 0, 0.1);
    previousYaw = yaw;

    const desired = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(elevation) * distanceRequested,
      Math.sin(elevation) * distanceRequested,
      Math.cos(yaw) * Math.cos(elevation) * distanceRequested,
    ).add(focus);
    if (flags.inside) desired.y = Math.min(desired.y, 3.62);
    const ray = desired.clone().sub(focus);
    const idealLength = ray.length();
    const direction = idealLength > EPSILON ? ray.divideScalar(idealLength) : new THREE.Vector3();
    const floorMargin = clamp(finite(flags.cameraRadius, 0.12), 0, 0.5);

    function safeLength(requestedLength) {
      let length = Math.max(0, requestedLength);
      // Re-check after a contraction: the endpoint can have moved from the
      // road to the raised pavement, where its required floor height changes.
      for (let pass = 0; pass < 4; pass++) {
        const point = focus.clone().addScaledVector(direction, length);
        const clipped = physics.cameraClip(focus, point, flags);
        let next = clamp(clipped.clone().sub(focus).dot(direction), 0, length);
        if (typeof physics.floorAt === 'function' && direction.y < -EPSILON) {
          const endpoint = focus.clone().addScaledVector(direction, next);
          const floor = finite(physics.floorAt(endpoint.x, endpoint.z), 0.045) + floorMargin;
          if (endpoint.y < floor) next = Math.min(next, Math.max(0, (focus.y - floor) / -direction.y));
        }
        if (length - next <= EPSILON) return next;
        length = next;
      }
      return length;
    }

    const availableLength = safeLength(idealLength);
    if (!initialized || snap || availableLength < armLength) {
      // A new wall or a closer user zoom retracts immediately; interpolating
      // inward would leave the camera behind the obstruction for a few frames.
      armLength = availableLength;
    } else {
      armLength += (availableLength - armLength) * (1 - Math.exp(-RECOVERY_RATE * step));
    }

    // Reclip the rendered arm after filtering. There is no interpolation chord
    // between orbit positions and no automatically selected alternate angle.
    armLength = safeLength(Math.min(armLength, availableLength));
    const position = focus.clone().addScaledVector(direction, armLength);
    initialized = true;
    const dx = position.x - focus.x;
    const dz = position.z - focus.z;
    const effectiveYaw = dx * dx + dz * dz > EPSILON ? Math.atan2(dx, dz) : yaw;
    return { position, effectiveYaw, offset: wrap(effectiveYaw - yaw) };
  }

  return { solve, reset };
}
