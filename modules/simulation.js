/**
 * Module: simulation.js
 * Purpose: Manages the main simulation loop, coordinating updates to aircraft positions, radar detection,
 * and rendering. Handles time deltas for accurate high-speed movements and pause/start states.
 * Interactions: Calls aircraft.js to update positions, radar.js to detect targets, display.js to render,
 * and ui.js for user input handling.
 * @module Simulation
 */

import { Radar } from './radar.js';
import { Display } from './display.js';
import * as Physics from './physics.js';
import { Aircraft, HypersonicAircraft } from './aircraft.js';
import * as Command from './command.js';
import { UI } from './ui.js';

/**
 * Simulation manager - main loop, state, metrics
 */
class Simulation {
  constructor() {
    this.aircraft = [];
    this.lastTime = null;
    this.accumulator = 0;
    this.step = 1 / 30; // fixed-step 30 Hz for physics
    this.metrics = { nearMiss: 0, resolved: 0, commands: 0 };
    this.log = [];
    this.radarConfig = { rangeKm: 100, fovDeg: 360, sweepRateDps: 30, flickerRate: 0.02 };
    this.env = { wind: { dirDeg: 0, speedKts: 0 } };
    this.selected = null;
    this.isRunning = false;

    // Instantiate modules
    this.radar = new Radar(0, 0, this.radarConfig.rangeKm, this.radarConfig.sweepRateDps);
    this.display = new Display(document.getElementById('radarCanvas'));
    this.ui = new UI(this, this.radar); // Pass instances to UI

    this.init();
  }

  init() {
    // add a few starter aircraft
    for (let i=0;i<6;i++) this.addAircraft(i===0?true:false);
    this.ui.updateMetrics(this.metrics);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame.bind(this));
    this.ui.setRunning(true);
  }

  pause() {
    this.isRunning = false;
    this.ui.setRunning(false);
  }

  toggleRunning() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  frame(now) {
    if (!this.isRunning) return;
    const dtSec = (now - (this.lastTime||now))/1000;
    this.lastTime = now;
    this.accumulator += dtSec;
    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
    }
    this.render(now);
    if (this.isRunning) requestAnimationFrame(this.frame.bind(this));
  }

  update(dt) {
    // physics update each aircraft
    for (const ac of this.aircraft) {
      ac.update(dt, { env: this.env, physics: Physics });
    }
    // conflict detection
    const conflicts = Physics.detectConflicts(this.aircraft);
    for (const c of conflicts) {
      this.metrics.nearMiss++;
      this.logMessage(`CONFLICT between ${c.a.callsign} and ${c.b.callsign} ttc:${Math.round(c.ttc*100)/100}s`);
      // auto-resolve simple
      c.a.autoResolveConflict && c.a.autoResolveConflict(c);
      c.b.autoResolveConflict && c.b.autoResolveConflict(c);
    }
    this.ui.updateMetrics(this.metrics);
    // radar detection update
    this.radar.updateSweep(dt);
    this.radar.detectAircraft(this.aircraft, performance.now() / 1000);
  }

  render(now) {
    this.display.render(this.aircraft, this.radar, this.selected, this.ui.getDisplayOptions());
    this.ui.updateAircraftList(this.aircraft, this.selectByCallsign.bind(this));
    this.ui.updateLog(this.log);
    this.ui.updateSelection(this.selected ? this.selected.toDisplayData() : null);
  }

  addAircraft(isHypersonic=false) {
    const idx = this.aircraft.length + 1;
    const callsign = (isHypersonic ? 'HX' : 'AC') + String(100 + idx); // HX for Hypersonic
    const start = { x: Math.random()*140 - 70, y: Math.random()*140 - 70 }; // km relative to center
    const params = {
      id: Date.now()+Math.random(),
      callsign,
      type: isHypersonic ? 'hypersonic' : 'generic',
      posKm: start,
      heading: Math.random()*360,
      speedKts: isHypersonic ? 4000 : (200 + Math.random()*350),
      altitudeFt: isHypersonic ? 80000 + Math.random()*60000 : 10000 + Math.random()*30000,
    };
    const ac = isHypersonic ? new HypersonicAircraft(params) : new Aircraft(params);
    this.aircraft.push(ac);
    this.logMessage(`ADDED ${callsign}`);
  }

  removeSelectedOrLast() {
    if (this.selected) {
      const idx = this.aircraft.indexOf(this.selected);
      if (idx>=0) this.aircraft.splice(idx,1);
      this.selected = null;
    } else {
      this.aircraft.pop();
    }
  }

  getAircraftByCallsign(callsign){ return this.aircraft.find(a=>a.callsign.toUpperCase()===callsign.toUpperCase()); }

  selectByCallsign(callsign){
    const a = this.getAircraftByCallsign(callsign);
    if (a) this.selected = a;
  }

  selectByPosition(posKm){
    // pick nearest within threshold
    let best = null, bestD = 1e9;
    for (const a of this.aircraft){
      const d = Physics.distanceKm(a.posKm, posKm);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best && bestD < 5) this.selected = best;
    else this.selected = null;
  }

  processCommand(raw) {
    const { ok, callsign, commands, error } = Command.parseRawCommand(raw);
    if (!ok) { this.logMessage(`CMD_PARSE_ERR: ${error}`); return; }

    for (const command of commands) {
      const commandWithTarget = { ...command, callsign };
      const v = Command.validateCommand(commandWithTarget, this);
      if (!v.ok) { this.logMessage(`CMD_INVALID: ${v.reason}`); continue; } // Log and continue to next command
      Command.dispatchCommand(commandWithTarget, this);
      this.metrics.commands++;
    }

    this.logMessage(`CMD_OK: ${raw}`);
    this.ui.updateMetrics(this.metrics);
  }

  logMessage(msg){ this.log.unshift(`${new Date().toLocaleTimeString()} ${msg}`); if (this.log.length>500) this.log.pop(); }
}

const SIM = new Simulation();
// export default SIM; // This is not needed if UI doesn't import it.

// auto-start paused
SIM.pause();