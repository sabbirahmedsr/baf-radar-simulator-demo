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
      // trackedTargets is no longer used for rendering aircraft
    };
  }
}