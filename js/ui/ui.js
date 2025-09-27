/**
 * Module: ui.js
 * Purpose: Manages user interactions with the control panel, such as starting/pausing the simulation,
 * adding/removing aircraft, and toggling display options. Keeps UI logic separate for easy adaptation.
 * Interactions: Updates simulation.js for simulation state, radar.js for range, and display.js for options.
 * @module UI
 */
import { THEME_COLORS } from '../config.js';

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
    this.altitudeGraphClickableRegions = [];
    this.theme = {};

    // Altitude Graph elements
    this.altitudeCanvas = document.getElementById('altitudeGraphVerticalCanvas');
    this.altitudeCtx = this.altitudeCanvas.getContext('2d');    

    // UI elements
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

    this._loadThemeColors();
    this._setupEventListeners();
  }

  /** Reads theme colors from CSS variables to use in canvas drawing. */
  _loadThemeColors() {
    const style = getComputedStyle(document.body);
    this.theme.bgDark = style.getPropertyValue('--bg-dark').trim();
    this.theme.panelDark = style.getPropertyValue('--panel-dark').trim();
    this.theme.border = style.getPropertyValue('--border-color').trim();
    this.theme.textMedium = style.getPropertyValue('--text-medium').trim();
    this.theme.textLight = style.getPropertyValue('--text-light').trim();
    this.theme.accentGreen = style.getPropertyValue('--accent-green').trim();
    this.theme.accentOrange = style.getPropertyValue('--accent-orange').trim();
    this.theme.leaderLine = THEME_COLORS.leaderLine;
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

  /**
   * Renders a dynamic vertical graph of all aircraft altitudes on the left of the radar.
   * @param {Array<Aircraft>} aircraftList - The list of all aircraft in the simulation.
   * @param {Aircraft} selected - The currently selected aircraft.
   */
  updateVerticalAltitudeGraph(aircraftList, selected) {
    const ctx = this.altitudeCtx;
    const canvas = this.altitudeCanvas;
    const { width, height } = canvas;
    const padding = { top: 20, bottom: 20, left: 50, right: 10 };

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.theme.bgDark;
    ctx.fillRect(0, 0, width, height);

    // Determine dynamic scale
    const currentMaxAlt = Math.max(10000, ...aircraftList.map(a => a.altitudeFt)); // Use 10k ft as a minimum scale
    const scaleMax = Math.ceil(currentMaxAlt / 1000) * 1000; // Round up to the nearest 1000 ft

    this._drawAltitudeGraphAxis(ctx, height, padding, scaleMax);

    if (aircraftList.length === 0) {
      return;
    }

    this.altitudeGraphClickableRegions = []; // Clear old regions
    this._drawAltitudeGraphAircraft(ctx, width, height, padding, scaleMax, aircraftList, selected);
  }

  _drawAltitudeGraphAxis(ctx, height, padding, scaleMax) {
    ctx.strokeStyle = this.theme.border;
    ctx.fillStyle = this.theme.textMedium;
    ctx.font = "10px 'Segoe UI'";
    ctx.textAlign = 'right';
    
    const numTicks = 10; // Always show 10 tick marks
    for (let i = 0; i <= numTicks; i++) {
        const alt = (scaleMax / numTicks) * i;
        const y = (height - padding.bottom) - (alt / scaleMax) * (height - padding.top - padding.bottom);
        ctx.beginPath();
        ctx.moveTo(padding.left - 4, y);
        ctx.lineTo(padding.left, y);
        ctx.stroke();
        ctx.fillText(Math.round(alt), padding.left - 8, y + 3);
    }
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.stroke();
  }

  _drawAltitudeGraphAircraft(ctx, width, height, padding, scaleMax, aircraftList, selected) {
    const sortedAircraft = [...aircraftList].sort((a, b) => b.altitudeFt - a.altitudeFt);
    let lastLabelBottomY = -Infinity; // Keep track of the last label's position

    sortedAircraft.forEach(ac => {
      const isSelected = selected && selected.id === ac.id;
      const displayData = ac.toDisplayData();
      const trueY = (height - padding.bottom) - (ac.altitudeFt / scaleMax) * (height - padding.top - padding.bottom);

      // Draw indicator line and label
      const indicatorLineEndX = padding.left + 8;
      const textStartX = indicatorLineEndX + 8;

      // --- Label Collision and Positioning Logic ---
      const labelHeight = 18;
      const labelPadding = 4;
      const minGap = 2;

      const labelText = ac.callsign;
      
      // Calculate initial label position (centered on trueY)
      let labelTopY = trueY - labelHeight / 2;

      // Check for collision and adjust if necessary
      if (labelTopY < lastLabelBottomY + minGap) {
        labelTopY = lastLabelBottomY + minGap;
      }
      lastLabelBottomY = labelTopY + labelHeight; // Update for next iteration

      // --- Drawing ---
      // 1. Draw the true altitude indicator line
      ctx.strokeStyle = isSelected ? '#ff0' : (ac.type === 'hypersonic' ? this.theme.accentOrange : this.theme.accentGreen);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, trueY);
      ctx.lineTo(indicatorLineEndX, trueY);
      ctx.stroke();

      // 2. Draw the label box
      ctx.strokeStyle = this.theme.leaderLine;
      const labelWidth = width - textStartX - padding.right;
      ctx.strokeRect(textStartX, labelTopY, labelWidth, labelHeight);

      // 3. Draw the label text
      ctx.fillStyle = isSelected ? '#ff0' : this.theme.textLight;
      ctx.font = "11px 'Segoe UI'";
      ctx.textAlign = 'left';
      const textX = textStartX + labelPadding;
      const textY = labelTopY + labelHeight - 5;
      ctx.fillText(labelText, textX, textY);

      // Define a smaller, more precise clickable region just around the text
      const textMetrics = ctx.measureText(labelText);
      this.altitudeGraphClickableRegions.push({
        x: textX, y: labelTopY, // Use the box's top for y-start
        width: textMetrics.width, height: labelHeight, // Use the box's height
        callsign: ac.callsign
      });

      // 4. Draw the leader line connecting indicator to label
      ctx.strokeStyle = this.theme.leaderLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(indicatorLineEndX, trueY);
      ctx.lineTo(textStartX, labelTopY + labelHeight / 2);
      ctx.stroke();
    });
  }

  /** Sets up all event listeners for the UI. */
  _setupEventListeners() {
    // Main controls
    this.addAircraftBtn.addEventListener('click', () => this.simulation.addAircraft(false));
    this.addVGHSAircraftBtn.addEventListener('click', () => this.simulation.addAircraft(true));
    this.removeAircraftBtn.addEventListener('click', () => this.simulation.removeSelectedOrLast());
    this.radarRangeInput.addEventListener('change', (e) => this.radar.setRange(parseFloat(e.target.value)));

    // Command line
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

    // Radar canvas click for selection
    const canvas = document.getElementById('radarCanvas');
    canvas.addEventListener('click', (ev) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      const cx = canvas.width / 2, cy = canvas.height / 2;
      const kmPerPx = this.radar.range / (canvas.width / 2);
      const posKm = { x: (x - cx) * kmPerPx, y: (cy - y) * kmPerPx };
      this.simulation.selectByPosition(posKm);
    });

    // Collapsible sections
    document.querySelectorAll('.collapsible-header').forEach(header => {
      header.addEventListener('click', () => {
        header.classList.toggle('active');
        const content = header.nextElementSibling;
        content.style.maxHeight = content.style.maxHeight ? null : content.scrollHeight + "px";
      });
    });

    // GUI Command Panel
    this.guiSendHeading.addEventListener('click', () => {
      const callsign = this.simulation.selected?.callsign;
      const heading = this.guiCmdHeading.value;
      if (callsign && heading) {
        this.simulation.processCommand(`${callsign} C ${heading.padStart(3, '0')}`);
        this.guiCmdHeading.value = '';
      }
    });

    this.guiSendAltitude.addEventListener('click', () => {
      const callsign = this.simulation.selected?.callsign;
      const altitude = parseInt(this.guiCmdAltitude.value, 10);
      if (callsign && !isNaN(altitude)) {
        this.simulation.processCommand(`${callsign} C ${Math.round(altitude / 1000)}`);
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

    // Altitude Graph Listeners
    this.altitudeCanvas.addEventListener('click', (e) => {
      const rect = this.altitudeCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      for (let i = this.altitudeGraphClickableRegions.length - 1; i >= 0; i--) {
        const region = this.altitudeGraphClickableRegions[i];
        if (x >= region.x && x <= region.x + region.width &&
            y >= region.y && y <= region.y + region.height) {
          this.simulation.selectByCallsign(region.callsign);
          break;
        }
      }
    });

    this.altitudeCanvas.addEventListener('mousemove', (e) => {
      const rect = this.altitudeCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let onTarget = false;
      for (let i = this.altitudeGraphClickableRegions.length - 1; i >= 0; i--) {
        const region = this.altitudeGraphClickableRegions[i];
        if (x >= region.x && x <= region.x + region.width &&
            y >= region.y && y <= region.y + region.height) {
          onTarget = true;
          break;
        }
      }
      this.altitudeCanvas.style.cursor = onTarget ? 'pointer' : 'default';
    });
  }
};