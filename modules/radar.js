/**
 * Module: radar.js
 * Purpose: Manages the radar station's properties, sweep animation, and target detection logic.
 * Calculates which aircraft are within range and field of view, providing data for display.
 * Interactions: Receives aircraft data from simulation.js, sends tracked targets to display.js.
 * @module Radar
 */

/**
 * Class representing the radar station.
 * @class
 */
export class Radar {
  /**
   * Initializes radar with configurable range and sweep speed.
   * @param {number} x - Radar x-coordinate (km).
   * @param {number} y - Radar y-coordinate (km).
   * @param {number} range - Detection range (km).
   * @param {number} sweepSpeed - Sweep rotation speed (degrees/second).
   */
  constructor(x = 0, y = 0, range = 100, sweepSpeed = 60) {
    this.x = x;
    this.y = y;
    this.range = range;
    this.sweepSpeed = sweepSpeed;
    this.sweepAngle = 0; // Current sweep angle (degrees)
    this.trackedTargets = new Map(); // Key: aircraft.id, Value: { state, lastSeen }
  }

  /**
   * Updates radar sweep angle based on time.
   * @param {number} deltaTime - Time since last update (seconds).
   */
  updateSweep(deltaTime) {
    this.sweepAngle = (this.sweepAngle + this.sweepSpeed * deltaTime) % 360;
  }

  /**
   * Detects aircraft within the sweep's field of view and prunes old targets to simulate persistence.
   * @param {Array<Aircraft>} aircraftList - List of aircraft to check.
   * @param {number} currentTime - The current simulation time in seconds.
   */
  detectAircraft(aircraftList, currentTime) {
    const fov = 30; // Field of view in degrees
    const persistenceTime = 360 / this.sweepSpeed; // Time for one full rotation

    // Prune targets that haven't been seen for a full sweep
    for (const [id, target] of this.trackedTargets.entries()) {
      if (currentTime - target.lastSeen > persistenceTime) {
        this.trackedTargets.delete(id);
      }
    }

    // Detect new/updated targets
    for (const aircraft of aircraftList) {
      const state = aircraft.getState();
      const dx = state.x - this.x;
      const dy = state.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= this.range) {
        const angleToAircraft = (Math.atan2(dy, dx) * 180) / Math.PI;
        const angleDiff = Math.abs((angleToAircraft - this.sweepAngle + 180) % 360 - 180);
        // If the sweep hits a target, update it in our map
        if (angleDiff <= fov / 2) {
          // detection probability drops with range and clutter
          const snr = Math.max(0, 1 - distance / this.range);
          const detectProb = snr * (1 - 0.02); // 0.02 is the flicker rate
          const rand = Math.random();
          if (rand < detectProb) {
            this.trackedTargets.set(state.id, { state: state, lastSeen: currentTime });
          }
        }
      } else {
        // If an aircraft goes out of range, remove it immediately
        this.trackedTargets.delete(state.id);
      }
    }
  }

  /**
   * Updates radar range.
   * @param {number} newRange - New range in km.
   */
  setRange(newRange) {
    this.range = Math.max(50, Math.min(500, newRange));
  }

  /**
   * Returns radar state for rendering.
   * @returns {Object} - Radar properties (x, y, range, sweepAngle, trackedTargets).
   */
  getState() {
    return {
      x: this.x,
      y: this.y,
      range: this.range,
      sweepAngle: this.sweepAngle,
      trackedTargets: Array.from(this.trackedTargets.values(), (value) => value.state),
    };
  }
}