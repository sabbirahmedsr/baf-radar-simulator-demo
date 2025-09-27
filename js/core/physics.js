/**
 * Physics utilities for the simulator
 */

/**
 * integratePosition - simple ground-track integration using heading, speed, wind
 * returns new position in km
 */
export function integratePosition(ac, dt, env){
  const speedKts = ac.speedKts;
  // convert knots to km/s (1 knot = 0.514444 m/s; 1 km = 1000 m)
  const mps = speedKts * 0.514444;
  const kmps = mps / 1000;
  const distKm = kmps * dt;
  const rad = ac.heading * Math.PI/180;
  let dx = Math.cos(rad) * distKm;
  let dy = Math.sin(rad) * distKm;
  // apply wind
  const windKts = env.wind.speedKts || 0;
  const windDir = (env.wind.dirDeg || 0) * Math.PI/180;
  const windMps = windKts * 0.514444;
  const windKmps = windMps/1000;
  dx += Math.cos(windDir) * windKmps * dt;
  dy += Math.sin(windDir) * windKmps * dt;
  return { x: ac.posKm.x + dx, y: ac.posKm.y + dy };
}

export function computeTurn(ac, targetHeading, dt, profile){
  // compute minimal angular difference
  const from = ac.heading;
  let to = (targetHeading + 360)%360;
  let d = ((to - from + 540)%360) - 180;
  const maxTurn = (profile.turnRateDegPerSec || 3) * dt;
  if (Math.abs(d) <= maxTurn) return to;
  return (from + Math.sign(d)*maxTurn + 360) % 360;
}

export function computeSpeedChange(ac, targetSpeed, dt, profile){
  if (typeof targetSpeed === 'undefined') return ac.speedKts;
  const diff = targetSpeed - ac.speedKts;
  const accel = diff>0 ? profile.accel : profile.decel;
  const change = Math.sign(diff) * Math.min(Math.abs(diff), accel * dt);
  return ac.speedKts + change;
}

export function computeAltitudeChange(ac, targetAlt, dt, profile){
  if (typeof targetAlt === 'undefined') return ac.altitudeFt;
  const diff = targetAlt - ac.altitudeFt;
  const max = profile.maxClimb || 2000; // fpm
  const change = Math.sign(diff) * Math.min(Math.abs(diff), (max / 60) * dt); // dt is in seconds, so convert fpm to fps
  return ac.altitudeFt + change;
}

export function distanceKm(p1,p2){
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  return Math.sqrt(dx*dx + dy*dy);
}

export function bearingTo(p1,p2){
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const rad = Math.atan2(dy,dx);
  let deg = rad*180/Math.PI;
  if (deg<0) deg += 360;
  return deg;
}

/**
 * detectConflicts - O(n^2) CPA check for simplicity
 * returns list of {a,b,ttc,distAtCPA}
 */
export function detectConflicts(list){
  const out = [];
  for (let i=0;i<list.length;i++){
    for (let j=i+1;j<list.length;j++){
      const a = list[i], b = list[j];
      const relX = b.posKm.x - a.posKm.x, relY = b.posKm.y - a.posKm.y;
      const va = velocityKmPerSec(a);
      const vb = velocityKmPerSec(b);
      const rvx = vb.vx - va.vx, rvy = vb.vy - va.vy;
      const r2 = rvx*rvx + rvy*rvy;
      const tca = r2 === 0 ? 0 : - (relX*rvx + relY*rvy) / r2;
      if (tca < 0 || tca > 300) continue; // only look ahead reasonable time (300s)
      const caX = relX + rvx * tca;
      const caY = relY + rvy * tca;
      const distAtCPA = Math.sqrt(caX*caX + caY*caY);
      const altDiff = Math.abs(a.altitudeFt - b.altitudeFt);
      if (distAtCPA < 2 && altDiff < 1000) { // threshold: 2 km lateral & 1000ft
        out.push({ a,b, ttc: tca, distAtCPA });
      }
    }
  }
  return out;
}

function velocityKmPerSec(ac){
  const speedKts = ac.speedKts;
  const mps = speedKts * 0.514444;
  const kmps = mps / 1000;
  const rad = ac.heading * Math.PI/180;
  return { vx: Math.cos(rad) * kmps, vy: Math.sin(rad) * kmps };
}
