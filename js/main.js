/**
 * Module: main.js (formerly simulation.js)
 *
 * This is the main entry point for the BAF RADAR SIMULATOR.
 * It orchestrates the entire simulation by initializing all modules,
 * managing the central game loop (update and render), and handling
 * the flow of data between different parts of the application.
 */
import { SIM_CONFIG } from './config.js';
import { Radar } from './core/radar.js';
import { Display } from './rendering/display.js';
import * as Physics from './core/physics.js';
import { Aircraft, HypersonicAircraft } from './core/aircraft.js';
import * as Command from './ui/command.js';
import { UI } from './ui/ui.js';

/**
 * Simulation manager - main loop, state, metrics
 */
class Simulation {
  constructor() {
    this.aircraft = [];
    this.lastTime = null;
    this.accumulator = 0;
    this.step = SIM_CONFIG.physicsStep;
    this.radarConfig = { rangeKm: 100, sweepRateDps: SIM_CONFIG.radarSweepRateDps };
    this.env = { wind: { dirDeg: 0, speedKts: 0 } };
    this.selected = null;
    this.isRunning = true;

    // Instantiate modules
    this.radar = new Radar(0, 0, this.radarConfig.rangeKm, this.radarConfig.sweepRateDps);
    this.display = new Display(document.getElementById('radarCanvas'));
    this.ui = new UI(this, this.radar); // Pass instances to UI

    this.init();
  }

  init() {
    // add a few starter aircraft
    for (let i=0;i<6;i++) this.addAircraft(i===0?true:false);
    this.start();
  }

  start() {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame.bind(this));
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
      // auto-resolve simple
      c.a.autoResolveConflict && c.a.autoResolveConflict(c);
      c.b.autoResolveConflict && c.b.autoResolveConflict(c);
    }
    // radar detection update
    this.radar.updateSweep(dt);
  }

  render(now) {
    // Pass the live state of all aircraft directly to the display, bypassing radar tracking logic.
    const allAircraftStates = this.aircraft.map(ac => ac.toDisplayData());
    this.display.render(allAircraftStates, this.radar, this.selected, this.ui.getDisplayOptions());
    this.ui.updateVerticalAltitudeGraph(this.aircraft, this.selected);
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
      altitudeFt: 3000 + Math.random() * 6500, // All aircraft now spawn between 3,000 and 9,500 ft
    };
    const ac = isHypersonic ? new HypersonicAircraft(params) : new Aircraft(params);
    this.aircraft.push(ac);
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
    if (!ok) { console.error(`CMD_PARSE_ERR: ${error}`); return; }

    for (const command of commands) {
      const commandWithTarget = { ...command, callsign };
      const v = Command.validateCommand(commandWithTarget, this);
      if (!v.ok) { console.warn(`CMD_INVALID: ${v.reason}`); continue; } // Log and continue to next command
      Command.dispatchCommand(commandWithTarget, this);
    }
  }
}

const SIM = new Simulation();