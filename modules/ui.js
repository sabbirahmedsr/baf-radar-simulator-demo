/**
 * Module: ui.js
 * Purpose: Manages user interactions with the control panel, such as starting/pausing the simulation,
 * adding/removing aircraft, and toggling display options. Keeps UI logic separate for easy adaptation.
 * Interactions: Updates simulation.js for simulation state, radar.js for range, and display.js for options.
 * @module UI
 */

/**
 * Class for handling UI interactions.
 * @class
 */
export class UI {
  /**
   * Initializes UI event listeners.
   * @param {Object} simulation - Simulation instance to control.
   * @param {Object} radar - Radar instance to update range.
   */
  constructor(simulation, radar) {
    this.simulation = simulation;
    this.radar = radar;

    // Event handler registry
    this.handlers = {};

    // UI elements
    this.startPauseBtn = document.getElementById("startPauseBtn");
    this.addAircraftBtn = document.getElementById("addAircraftBtn");
    this.addVGHSAircraftBtn = document.getElementById("addVGHSAircraftBtn");
    this.removeAircraftBtn = document.getElementById("removeAircraftBtn");
    this.radarRangeInput = document.getElementById("radarRangeInput");
    this.toggleID = document.getElementById("toggleID");
    this.toggleSpeed = document.getElementById("toggleSpeed");
    this.toggleAltitude = document.getElementById("toggleAltitude");
    this.toggleHeading = document.getElementById("toggleHeading");
    this.toggleTrails = document.getElementById("toggleTrails");

    // GUI Command Panel elements
    this.guiCommandPanel = document.getElementById('guiCommandPanel');
    this.guiCmdHeading = document.getElementById('guiCmdHeading');
    this.guiSendHeading = document.getElementById('guiSendHeading');
    this.guiCmdAltitude = document.getElementById('guiCmdAltitude');
    this.guiSendAltitude = document.getElementById('guiSendAltitude');
    this.guiCmdSpeed = document.getElementById('guiCmdSpeed');
    this.guiSendSpeed = document.getElementById('guiSendSpeed');
    this.guiSendHold = document.getElementById('guiSendHold');

    // Event listeners
    this.startPauseBtn.addEventListener('click', ()=> this.simulation.toggleRunning());
    this.addAircraftBtn.addEventListener('click', ()=> this.simulation.addAircraft(false));
    this.addVGHSAircraftBtn.addEventListener('click', ()=> this.simulation.addAircraft(true));
    this.removeAircraftBtn.addEventListener('click', ()=> this.simulation.removeSelectedOrLast());
    this.radarRangeInput.addEventListener('change', (e)=> this.radar.setRange(parseFloat(e.target.value)));
    
    // Command listeners
    const cmdInput = document.getElementById('cmdInput');
    const cmdSend = document.getElementById('cmdSend');
    const sendCommand = () => {
      if (cmdInput.value) {
        this.simulation.processCommand(cmdInput.value);
        cmdInput.value = '';
      }
    };
    cmdSend.addEventListener('click', sendCommand);
    cmdInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendCommand(); });

    const canvas = document.getElementById('radarCanvas');
    canvas.addEventListener('click', (ev)=> {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      const cx = canvas.width/2, cy = canvas.height/2;
      const kmPerPx = this.radar.range / (canvas.width / 2); // Dynamic scale
      const posKm = { x: (x - cx) * kmPerPx, y: (cy - y) * kmPerPx };
      this.simulation.selectByPosition(posKm);
    });

    // Collapsible section handler
    const collapsibles = document.querySelectorAll('.collapsible-header');
    collapsibles.forEach(header => {
      header.addEventListener('click', () => {
        header.classList.toggle('active');
        const content = header.nextElementSibling;
        if (content.style.maxHeight) {
          content.style.maxHeight = null;
        } else {
          content.style.maxHeight = content.scrollHeight + "px";
        }
      });
    });

    // GUI Command Listeners
    this.guiSendHeading.addEventListener('click', () => {
      const callsign = this.simulation.selected?.callsign;
      const heading = this.guiCmdHeading.value;
      if (callsign && heading) {
        const paddedHeading = heading.padStart(3, '0');
        this.simulation.processCommand(`${callsign} C ${paddedHeading}`);
        this.guiCmdHeading.value = '';
      }
    });

    this.guiSendAltitude.addEventListener('click', () => {
      const callsign = this.simulation.selected?.callsign;
      const altitude = parseInt(this.guiCmdAltitude.value, 10);
      if (callsign && !isNaN(altitude)) {
        const altParam = Math.round(altitude / 1000);
        this.simulation.processCommand(`${callsign} C ${altParam}`);
        this.guiCmdAltitude.value = '';
      }
    });

    this.guiSendSpeed.addEventListener('click', () => {
      const callsign = this.simulation.selected?.callsign;
      const speed = this.guiCmdSpeed.value;
      if (callsign && speed) {
        this.simulation.processCommand(`${callsign} S ${speed}`);
        this.guiCmdSpeed.value = '';
      }
    });

    this.guiSendHold.addEventListener('click', () => {
      const callsign = this.simulation.selected?.callsign;
      if (callsign) this.simulation.processCommand(`${callsign} H`);
    });
  }

  /**
   * Toggles simulation start/pause and updates button text.
   */
  toggleSimulation() {
    if (this.simulation.isRunning) { // This method is now redundant, but kept for reference
      this.simulation.pause();
      this.startPauseBtn.textContent = "Start";
    } else {
      this.simulation.start();
      this.startPauseBtn.textContent = "Pause";
    }
  }

  /**
   * Returns current display options based on UI toggles.
   * @returns {Object} - Display options (showID, showSpeed, showAltitude, showHeading, showTrails).
   */
  getDisplayOptions() {
    return {
      showID: this.toggleID.checked,
      showSpeed: this.toggleSpeed.checked,
      showAltitude: this.toggleAltitude.checked,
      showHeading: this.toggleHeading.checked,
      showTrails: this.toggleTrails.checked,
    };
  }

  _on(evt, cb){ this.handlers[evt] = this.handlers[evt] || []; this.handlers[evt].push(cb); }
  _emit(evt, arg){ (this.handlers[evt]||[]).forEach(cb=>cb(arg)); }

  setRunning(r){
    document.getElementById('startPauseBtn').textContent = r ? 'Pause' : 'Start';
  }

  updateLog(log){
    const el = document.getElementById('logPanel');
    el.innerHTML = log.slice(0,200).map(l => `<div>${l}</div>`).join('');
  }

  updateMetrics(metrics){
    document.getElementById('metricNearMiss').textContent = metrics.nearMiss||0;
    document.getElementById('metricResolved').textContent = metrics.resolved||0;
    document.getElementById('metricCommands').textContent = metrics.commands||0;
  }

  updateAircraftList(list, onSelect){
    const el = document.getElementById('aircraftList');
    el.innerHTML = '';
    for (const a of list){
      const div = document.createElement('div');
      div.textContent = `${a.callsign} ${Math.round(a.speedKts)}kts ${Math.round(a.altitudeFt)}ft`;
      div.style.cursor = 'pointer';
      div.onclick = ()=> onSelect(a.callsign);
      el.appendChild(div);
    }
  }

  updateSelection(data){
    const el = document.getElementById('dataPanel');
    if (!data) {
      el.textContent = 'No selection';
      this.guiCommandPanel.style.display = 'none'; // Hide command panel
      return;
    }
    // Show command panel if it was hidden
    this.guiCommandPanel.style.display = 'block';
    el.innerHTML = `
      <div><strong>${data.callsign}</strong> ${data.isHypersonic?'(Hypersonic)':''}</div>
      <div>Speed: ${Math.round(data.speedKts)} kts</div>
      <div>Alt: ${Math.round(data.altitudeFt)} ft</div>
      <div>Heading: ${Math.round(data.heading)}°</div>
    `;
  }
};