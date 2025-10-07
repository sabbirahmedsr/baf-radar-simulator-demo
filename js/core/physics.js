/**
 * Module: physics.js
 *
 * This module contains all the core physics and mathematical utility functions
 * for the simulator. It handles position integration, turn rates, speed/altitude
 * changes, and conflict detection. It is designed to be a pure, state-free
 * library of functions.
 */

const KNOTS_TO_KMS = 0.000514444; // Knots to Kilometers per Second

/**
 * Integrates an aircraft's position over a time delta (dt).
 * This function now correctly uses navigational bearings (0° is North).
 * @param {Aircraft} aircraft - The aircraft object.
 * @param {number} dt - Delta time in seconds.
 * @param {Object} env - Environment data (e.g., wind).
 * @returns {Object} - New position {x, y}.
 */
export function integratePosition(aircraft, dt, env){
  const speedKms = aircraft.speedKts * KNOTS_TO_KMS; // Convert speed from knots to km/s
  const headingRad = aircraft.heading * Math.PI / 180; // Convert heading to radians

  // For navigational bearings (0=N, 90=E): vx uses sin, vy uses cos.
  let dx = Math.sin(headingRad) * speedKms * dt;
  let dy = Math.cos(headingRad) * speedKms * dt;

  // Apply wind effect (wind direction is also navigational)
  if (env.wind && env.wind.speedKts > 0) {
    const windSpeedKms = env.wind.speedKts * KNOTS_TO_KMS;
    const windHeadingRad = env.wind.dirDeg * Math.PI / 180;
    dx += Math.sin(windHeadingRad) * windSpeedKms * dt;
    dy += Math.cos(windHeadingRad) * windSpeedKms * dt;
  }

  return { x: aircraft.posKm.x + dx, y: aircraft.posKm.y + dy };
}

/**
 * Computes the new heading for an aircraft turning towards a target.
 * @param {Aircraft} ac - The aircraft object.
 * @param {number} targetHeading - The target heading in degrees.
 * @param {number} dt - Delta time in seconds.
 * @param {Object} profile - The aircraft's performance profile.
 * @returns {number} - The new heading in degrees.
 */
export function computeTurn(ac, targetHeading, dt, profile){
  const from = ac.heading;
  const to = (targetHeading + 360) % 360;
  // Calculate the shortest angle between the two headings
  let d = ((to - from + 540) % 360) - 180;
  const maxTurn = (profile.turnRateDegPerSec || 3) * dt;
  if (Math.abs(d) <= maxTurn) return to;
  return (from + Math.sign(d) * maxTurn + 360) % 360;
}

/**
 * Computes the new speed for an aircraft accelerating/decelerating.
 * @param {Aircraft} ac - The aircraft object.
 * @param {number} targetSpeed - The target speed in knots.
 * @param {number} dt - Delta time in seconds.
 * @param {Object} profile - The aircraft's performance profile.
 * @returns {number} - The new speed in knots.
 */
export function computeSpeedChange(ac, targetSpeed, dt, profile){
  if (typeof targetSpeed === 'undefined') return ac.speedKts;
  const diff = targetSpeed - ac.speedKts;
  const accel = diff > 0 ? profile.accel : profile.decel;
  const change = Math.sign(diff) * Math.min(Math.abs(diff), accel * dt);
  return ac.speedKts + change;
}

/**
 * Computes the new altitude for a climbing/descending aircraft.
 * @param {Aircraft} ac - The aircraft object.
 * @param {number} targetAlt - The target altitude in feet.
 * @param {number} dt - Delta time in seconds.
 * @param {Object} profile - The aircraft's performance profile.
 * @returns {number} - The new altitude in feet.
 */
export function computeAltitudeChange(ac, targetAlt, dt, profile){
  if (typeof targetAlt === 'undefined') return ac.altitudeFt;
  const diff = targetAlt - ac.altitudeFt;
  const max = profile.maxClimb || 2000; // fpm
  const change = Math.sign(diff) * Math.min(Math.abs(diff), (max / 60) * dt); // dt is in seconds, so convert fpm to fps
  return ac.altitudeFt + change;
}

/**
 * Calculates the distance between two points in kilometers.
 * @param {Object} p1 - Point 1 {x, y}.
 * @param {Object} p2 - Point 2 {x, y}.
 * @returns {number} - Distance in km.
 */
export function distanceKm(p1, p2){
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates the navigational bearing from point 1 to point 2.
 * @param {Object} p1 - Point 1 {x, y}.
 * @param {Object} p2 - Point 2 {x, y}.
 * @returns {number} - Bearing in degrees (0-359).
 */
export function bearingTo(p1, p2){
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  // Use atan2(dx, dy) for navigational bearing
  const rad = Math.atan2(dx, dy);
  let deg = rad * 180 / Math.PI;
  return (deg + 360) % 360; // Normalize to 0-359
}

/**
 * Detects potential conflicts between aircraft using CPA (Closest Point of Approach).
 * @param {Array<Aircraft>} list - The list of all aircraft.
 * @returns {Array<Object>} - A list of conflict objects.
 */
export function detectConflicts(list, lookaheadTime = 300, lateralSepKm = 5, verticalSepFt = 1000){
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];

      // Relative position
      const relX = b.posKm.x - a.posKm.x;
      const relY = b.posKm.y - a.posKm.y;

      // Relative velocity
      const va = velocityKmPerSec(a);
      const vb = velocityKmPerSec(b);
      const rvx = vb.vx - va.vx;
      const rvy = vb.vy - va.vy;

      // Time to closest point of approach (TCA)
      const r2 = rvx * rvx + rvy * rvy;
      if (r2 === 0) continue; // No relative velocity, no collision course
      const tca = -(relX * rvx + relY * rvy) / r2;

      // Ignore conflicts in the past or too far in the future
      if (tca < 0 || tca > lookaheadTime) continue;

      // Position at TCA
      const caX = relX + rvx * tca;
      const caY = relY + rvy * tca;
      const distAtCPA = Math.sqrt(caX * caX + caY * caY);
      const altDiff = Math.abs(a.altitudeFt - b.altitudeFt);

      // Check if separation minima are violated
      if (distAtCPA < lateralSepKm && altDiff < verticalSepFt) {
        out.push({ a, b, ttc: tca, distAtCPA });
      }
    }
  }
  return out;
}

/**
 * Helper to get an aircraft's velocity vector in km/s.
 * @param {Aircraft} ac - The aircraft object.
 * @returns {Object} - Velocity vector {vx, vy}.
 */
function velocityKmPerSec(ac){
  const speedKms = ac.speedKts * KNOTS_TO_KMS;
  const rad = ac.heading * Math.PI / 180;
  // Navigational bearing: sin for x, cos for y
  return { vx: Math.sin(rad) * speedKms, vy: Math.cos(rad) * speedKms };
}
