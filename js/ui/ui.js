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
    
    // Define the three-column layout
    const leftColumnWidth = 55;
    const axisColumnWidth = 50;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.theme.bgDark;
    ctx.fillRect(0, 0, width, height);

    // Determine dynamic scale
    const currentMaxAlt = Math.max(10000, ...aircraftList.map(a => a.altitudeFt)); // Use 10k ft as a minimum scale
    const scaleMax = Math.ceil(currentMaxAlt / 1000) * 1000; // Round up to the nearest 1000 ft

    this._drawAltitudeGraphAxis(ctx, width, height, { top: 20, bottom: 20 }, scaleMax, leftColumnWidth, axisColumnWidth);

    if (aircraftList.length === 0) {
      return;
    }

    this.altitudeGraphClickableRegions = []; // Clear old regions
    this._drawAltitudeGraphAircraft(ctx, width, height, { top: 20, bottom: 20 }, scaleMax, aircraftList, selected, leftColumnWidth, axisColumnWidth);
  }

  _drawAltitudeGraphAxis(ctx, width, height, padding, scaleMax, leftColumnWidth, axisColumnWidth) {
    ctx.strokeStyle = this.theme.border;
    ctx.fillStyle = this.theme.textMedium;
    ctx.font = "10px 'Segoe UI'";
    ctx.textAlign = 'right';
    
    const axisX = leftColumnWidth + (axisColumnWidth / 2);
    const numTicks = 10; // Always show 10 tick marks
    for (let i = 0; i <= numTicks; i++) {
        const alt = (scaleMax / numTicks) * i;
        const y = (height - padding.bottom) - (alt / scaleMax) * (height - padding.top - padding.bottom);
        ctx.beginPath();
        ctx.moveTo(axisX - 4, y);
        ctx.lineTo(axisX + 4, y);
        ctx.stroke();
        ctx.fillText(Math.round(alt), axisX - 8, y + 3);
    }
    ctx.beginPath();
    ctx.moveTo(axisX, padding.top);
    ctx.lineTo(axisX, height - padding.bottom);
    ctx.stroke();
  }

  _drawAltitudeGraphAircraft(ctx, width, height, padding, scaleMax, aircraftList, selected, leftColumnWidth, axisColumnWidth) {
    const leftAircraft = aircraftList.filter(ac => ac.posKm && ac.posKm.x < 0).sort((a, b) => b.altitudeFt - a.altitudeFt);
    const rightAircraft = aircraftList.filter(ac => ac.posKm && ac.posKm.x >= 0).sort((a, b) => b.altitudeFt - a.altitudeFt);
    const axisX = leftColumnWidth + (axisColumnWidth / 2);

    const createLabelData = (ac, side) => {
      const trueY = (height - padding.bottom) - (ac.altitudeFt / scaleMax) * (height - padding.top - padding.bottom);
      const isSelected = selected && selected.id === ac.id;

      const labelConfig = {
        height: 22,
        padding: 4,
        minGap: 2,  
        text: ac.callsign,
        side: side,
        columnWidth: leftColumnWidth,
        indicatorLineEndX: side === 'left' ? axisX - 8 : axisX + 8,
      };
      return { ac, trueY, isSelected, config: labelConfig, labelTopY: trueY - labelConfig.height / 2 };
    };

    const leftLabels = leftAircraft.map(ac => createLabelData(ac, 'left'));
    const rightLabels = rightAircraft.map(ac => createLabelData(ac, 'right'));

    this._resolveLabelCollisions(leftLabels);
    this._resolveLabelCollisions(rightLabels);

    // Draw all labels after positions have been finalized
    [...leftLabels, ...rightLabels].forEach(labelData => {
      const { ac, trueY, isSelected, config, labelTopY } = labelData;
      const labelWidth = config.columnWidth - (config.padding * 2);
      const labelX = (config.side === 'left') ? config.padding : config.indicatorLineEndX + 8;

      this._drawAltitudeIndicatorLine(ctx, axisX, trueY, config.indicatorLineEndX, ac, isSelected);
      this._drawAltitudeLeaderLine(ctx, trueY, labelTopY, config);
      this._drawAltitudeLabel(ctx, labelTopY, config, ac, isSelected, labelX, labelWidth);
      this._addClickableRegionForLabel(labelTopY, config, ac, labelX, labelWidth, isSelected);
    })
  }

  /**
   * Iterates through a list of labels sorted by altitude (desc) and resolves overlaps.
   * This method modifies the `labelTopY` property of the objects in the list.
   * @param {Array<Object>} labels - A list of label data objects.
   */
  _resolveLabelCollisions(labels) {
    if (labels.length < 2) return;

    // Iterate downwards from the second label
    for (let i = 1; i < labels.length; i++) {
      const upperLabel = labels[i - 1];
      const currentLabel = labels[i];

      const upperBottom = upperLabel.labelTopY + upperLabel.config.height;
      const requiredGap = currentLabel.config.minGap;

      // If the current label overlaps the one above it, push it down.
      if (currentLabel.labelTopY < upperBottom + requiredGap) {
        currentLabel.labelTopY = upperBottom + requiredGap;
      }
    }
  }

  // _resolveLabelYPositionDownwards(trueY, config, lastLabelBottomY) {
  //   let labelTopY = trueY - config.height / 2; // Center on the true altitude
  //   // Stacking downwards: if the new label overlaps with the one above it, move it down.
  //   if (labelTopY < lastLabelBottomY + config.minGap) {
  //     labelTopY = lastLabelBottomY + config.minGap;
  //   }
  //   return labelTopY;
  // }
  _drawAltitudeIndicatorLine(ctx, startX, y, endX, aircraft, isSelected) {
    ctx.strokeStyle = isSelected ? '#ff0' : (aircraft.type === 'hypersonic' ? this.theme.accentOrange : this.theme.accentGreen);
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }

  _drawAltitudeLabel(ctx, labelTopY, config, aircraft, isSelected, labelX, labelWidth) {
    const cornerRadius = 6;

    // 1. Draw the rounded rectangle for the label
    ctx.fillStyle = this.theme.panelDark;
    ctx.strokeStyle = isSelected ? '#ff0' : this.theme.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(labelX, labelTopY, labelWidth, config.height, cornerRadius);
    ctx.fill();
    ctx.stroke();

    // 2. Prepare text content
    let vsIndicator = '';
    // Use the aircraft's actual vertical speed property, not a re-calculated one.
    if (Math.abs(aircraft.vsFpm) > 50) { // Use a reasonable threshold in ft/min
        vsIndicator = aircraft.vsFpm > 0 ? '▲' : '▼';
    }
    const callsignText = `${aircraft.callsign}`;
    const altText = `${Math.round(aircraft.altitudeFt)}ft ${vsIndicator}`;

    // 3. Draw the text
    ctx.fillStyle = isSelected ? '#ff0' : this.theme.textLight;
    ctx.font = "bold 10px 'Segoe UI'";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(callsignText, labelX + 5, labelTopY + 2);
    
    ctx.fillStyle = isSelected ? '#ff0' : this.theme.textMedium;
    ctx.font = "10px 'Segoe UI'";
    ctx.textAlign = 'right';
    ctx.fillText(altText, labelX + labelWidth - 5, labelTopY + 10);
  }

  _drawAltitudeLeaderLine(ctx, trueY, labelTopY, config) {
    const elbowTurnX = (config.side === 'left') 
      ? config.columnWidth - config.padding // Align with box edge
      : config.indicatorLineEndX + 4; // A bit away from the axis

    ctx.strokeStyle = this.theme.leaderLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(config.indicatorLineEndX, trueY);
    ctx.lineTo(elbowTurnX, trueY); // Horizontal segment from axis
    ctx.lineTo(elbowTurnX, labelTopY + config.height / 2); // Vertical segment
    const finalElbowX = (config.side === 'left') ? config.columnWidth - config.padding : config.indicatorLineEndX + 8;
    ctx.lineTo(finalElbowX, labelTopY + config.height / 2); // Final horizontal segment to box
    ctx.stroke();
  }

  _addClickableRegionForLabel(labelTopY, config, ac, labelX, labelWidth, isSelected) {
      const region = {
        x: labelX, y: labelTopY,
        width: labelWidth, height: config.height,
        callsign: ac.callsign
      };
      this.altitudeGraphClickableRegions.push(region);
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
    this.guiCmdHeading.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        // Trigger the button click to avoid duplicating logic
        this.guiSendHeading.click();
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
    this.guiCmdAltitude.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        this.guiSendAltitude.click();
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
    this.guiCmdSpeed.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        this.guiSendSpeed.click();
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

      // DEBUG: Log click coordinates
      // console.log(`[HEIGHT GRAPH] Click at: x=${x.toFixed(2)}, y=${y.toFixed(2)}`);

      for (let i = this.altitudeGraphClickableRegions.length - 1; i >= 0; i--) {
        const region = this.altitudeGraphClickableRegions[i];
        // DEBUG: Log region being checked
        // console.log(`[HEIGHT GRAPH] Checking region for ${region.callsign}:`, region);
        if (x >= region.x && x <= region.x + region.width &&
            y >= region.y && y <= region.y + region.height) {
          // DEBUG: Log a successful hit
          // console.log(`[HEIGHT GRAPH] HIT on ${region.callsign}!`);
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