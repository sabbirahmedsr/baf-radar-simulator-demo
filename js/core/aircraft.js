import * as Physics from './physics.js';
import { AIRCRAFT_PROFILES, SIM_CONFIG } from '../config.js';

/**
 * Module: aircraft.js
 *
 * This module defines the Aircraft class and its subclasses. It is responsible
 * for an aircraft's properties (like speed, altitude), its state, and how it
 * responds to physics updates and commands. This is the "brain" for each
 * object on the radar screen.
 */

/**
 * Generic Aircraft class
 */
export class Aircraft {
  constructor(opts){
    this.id = opts.id || Date.now()+Math.random();
    this.callsign = opts.callsign || ('AC'+Math.floor(Math.random()*900+100));
    this.type = opts.type || 'generic';
    this.posKm = opts.posKm || { x: opts.x||0, y: opts.y||0 };
    this.heading = opts.heading || 0; // degrees
    this.speedKts = opts.speedKts || 250;
    this.altitudeFt = opts.altitudeFt || 10000;
    this.vsFpm = 0;
    this.trail = [];
    this.lastTrailDropPos = { ...this.posKm }; // Position where the last trail dot was dropped
    this.TRAIL_DOT_DISTANCE_KM = SIM_CONFIG.trailDotDistanceKm;
    this.state = 'cruising';
    this.target = { heading: this.heading, speed: this.speedKts, altitude: this.altitudeFt, waypoint: null };
    // performance profile
    this.profile = AIRCRAFT_PROFILES.generic;
  }

  /**
   * Updates aircraft position based on physics calculations.
   * @param {number} dt - Delta time.
   * @param {Object} ctx - Context object containing environment data.
   */
  update(dt, ctx){
    // compute heading change
    const h = Physics.computeTurn(this, this.target.heading, dt, this.profile);
    this.heading = h;
    // speed
    this.speedKts = Physics.computeSpeedChange(this, this.target.speed, dt, this.profile);
    // climb
    const oldAltitude = this.altitudeFt;
    this.altitudeFt = Physics.computeAltitudeChange(this, this.target.altitude, dt, this.profile);
    this.vsFpm = (this.altitudeFt - oldAltitude) / (dt / 60); // Calculate vertical speed in ft/min
    // integrate position with wind
    const newPos = Physics.integratePosition(this, dt, ctx.env);
    this.posKm = newPos;

    // Update trail based on distance traveled
    if (Physics.distanceKm(this.posKm, this.lastTrailDropPos) > this.TRAIL_DOT_DISTANCE_KM) {
      this.trail.unshift({ ...this.posKm }); // Add new dot position
      this.lastTrailDropPos = { ...this.posKm }; // Update last drop position
      if (this.trail.length > SIM_CONFIG.maxTrailDots) this.trail.pop();
    }
  }

  /**
   * Applies a command to the aircraft, modifying its target parameters.
   * @param {Object} command - Command object.
   * @returns {Object} - Result of the command application.
   */
  applyCommand(command){
    // normalized command object: {type, target, params}
    switch(command.type){
      case 'set_heading': this.target.heading = command.params.heading; this.state='following_command'; break;
      case 'climb_to': this.target.altitude = command.params.altitude; this.state='climbing'; break;
      case 'descend_to': this.target.altitude = command.params.altitude; this.state='descending'; break;
      case 'set_speed': this.target.speed = command.params.speed; break;
      case 'maintain': this.target.altitude = command.params.altitude; break;
      case 'vector': this.target.waypoint = { x: command.params.x, y: command.params.y }; break;
      case 'hold': this.state='holding'; break;
      // squawk etc can be stored
      default: break;
    }
    return { accepted:true };
  }

  /**
   * Prepares aircraft data for display.
   * @returns {Object} - Display data.
   */
  toDisplayData(){
    return {
      id:this.id, callsign:this.callsign, type:this.type,
      posKm:this.posKm, heading:this.heading, speedKts:this.speedKts, altitudeFt:this.altitudeFt,
      trail: this.trail
    };
  }

  /**
   * Resolves conflicts with other aircraft.
   * @param {Object} conflict - Conflict object.
   */
  autoResolveConflict(conflict){
    // simple evasive: small heading change away from other
    const other = conflict.a === this ? conflict.b : conflict.a;
    const brg = Physics.bearingTo(this.posKm, other.posKm);
    this.target.heading = (brg + 90) % 360;
    this.target.altitude = this.altitudeFt + 2000;
    this.state = 'evasive';
  }
}

/**
 * VGHS Aircraft: supersonic/hypersonic with different profile
 */
export class HypersonicAircraft extends Aircraft {
  constructor(opts){
    super(opts);
    this.type = 'hypersonic';
    this.profile = AIRCRAFT_PROFILES.hypersonic;
    // ensure target speed exists
    this.target.speed = this.speedKts;
  }

  /**
   * Applies a command to the VGHS aircraft, with limitations for high speeds.
   * @param {Object} command - Command object.
   * @returns {Object} - Result of the command application.
   */
  applyCommand(command){
    // VGHS have limits - some commands take time or are refused
    if (command.type === 'set_heading'){
      // limit abrupt heading changes at high speed
      const diff = Math.abs(((command.params.heading - this.heading + 540)%360)-180);
      if (this.speedKts > 660 && diff > 30) {
        // large heading change at supersonic speed - queue instead of instant
        this.target.heading = (this.heading + (command.params.heading>this.heading?30:-30))%360;
        this.state = 'turning_limited';
        return { accepted:true, note:'Partial turn due to VGHS limits' };
      }
    }
    return super.applyCommand(command);
  }

  /**
   * Prepares VGHS aircraft data for display, including Mach number.
   * @returns {Object} - Display data.
   */
  toDisplayData(){
    const base = super.toDisplayData();
    base.isHypersonic = true;
    base.mach = Math.round((this.speedKts / 661.5) * 100)/100;
    return base;
  }
}