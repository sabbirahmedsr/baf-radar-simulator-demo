/**
 * Module: display.js
 * Purpose: Handles all rendering on the HTML canvas, including the radar beam, aircraft blips,
 * history trails, and data overlays. Contains no simulation logic, making it easy to replace
 * with a Unity rendering system.
 * Interactions: Receives radar and aircraft data from simulation.js, renders via canvas context.
 * @module Display
 */
import { THEME_COLORS, DISPLAY_CONFIG, SIM_CONFIG } from '../config.js';

/**
 * Class for rendering the radar display.
 * @class
 */
export class Display {
  /**
   * Initializes the canvas and context.
   * @param {HTMLCanvasElement} canvas - The canvas element to render on.
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.scale = 4; // Pixels per km
    this.cx = canvas.width / 2;
    this.cy = canvas.height / 2;
    this.theme = {};
    this._loadThemeColors();
    this.displayTargets = new Map(); // Stores the state of targets as seen on screen
    this.lastSweepAngle = 0; // To detect when a sweep cycle completes
  }

  /** Reads theme colors from CSS variables to use in canvas drawing. */
  _loadThemeColors() {
    const style = getComputedStyle(document.body);
    this.theme.sweep = style.getPropertyValue('--accent-green-rgba-15');
    this.theme.grid = style.getPropertyValue('--accent-green');
    this.theme.runway = THEME_COLORS.runway; // Not in CSS, keep in config
    this.theme.trail = THEME_COLORS.trail;
  }

  clear(){
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
  }

  kmToPx(km){ return km * this.scale; }
  worldToScreen(posKm){
    return { x: this.cx + this.kmToPx(posKm.x), y: this.cy - this.kmToPx(posKm.y) };
  }

  render(aircraftList, radar, selected, displayOptions){
    // This function now receives the LIVE aircraft list but will render from its own displayTargets map.
    this.clear();
    this.ctx.save();
    this.ctx.translate(this.cx, this.cy);

    // --- Update display targets based on sweep position ---
    const sweepCycled = radar.sweepAngle < this.lastSweepAngle;
    if (sweepCycled) {
      // Reset the update flag for all targets at the start of a new sweep
      for (const target of this.displayTargets.values()) {
        target.updatedThisSweep = false;
      }
    }

    // Update the map of displayable targets with live data
    aircraftList.forEach(liveAc => {
      const bearing = (Math.atan2(-liveAc.posKm.y, liveAc.posKm.x) * 180 / Math.PI + 360) % 360;
      const angleDiff = (radar.sweepAngle - bearing + 360) % 360;

      let currentTarget = this.displayTargets.get(liveAc.id);
      if (!currentTarget) {
        // New aircraft, add it immediately
        currentTarget = { ...liveAc, updatedThisSweep: true };
        this.displayTargets.set(liveAc.id, currentTarget);
      }

      // Update the target if the sweep has passed it and it hasn't been updated this cycle
      if (angleDiff < 10 && !currentTarget.updatedThisSweep) {
        this.displayTargets.set(liveAc.id, { ...liveAc, updatedThisSweep: true });
      }
    });
    this.lastSweepAngle = radar.sweepAngle;

    this.renderRunways();
    this.renderGrid(radar.range);
    this.renderSweep(radar.sweepAngle, radar.range);

    // Render from the displayTargets map, which only updates on sweep hits
    for (const data of this.displayTargets.values()){
      if (displayOptions.showTrails) this.renderTrails(data);
      this.renderAircraft(data, selected, displayOptions);
    }

    this.ctx.restore();
  }

  renderRunways() {
    // VGHS (Dhaka) Runway 14/32 is at 144 degrees.
    const runway = {
      id: 'VGHS 14/32',
      heading: 144, // degrees
      lengthKm: 3.2,
      widthKm: 0.045
    };

    this.ctx.save();
    this.ctx.rotate(runway.heading * Math.PI / 180);

    const lengthPx = this.kmToPx(runway.lengthKm);
    const widthPx = this.kmToPx(runway.widthKm);

    // Draw runway surface
    this.ctx.fillStyle = this.theme.runway;
    this.ctx.fillRect(-lengthPx / 2, -widthPx / 2, lengthPx, widthPx);

    this.ctx.restore();
  }

  renderGrid(rangeKm){
    const rings = 4;
    this.ctx.strokeStyle = this.theme.grid;
    this.ctx.lineWidth = 1;
    for (let i=1;i<=rings;i++){
      this.ctx.beginPath();
      this.ctx.arc(0, 0, this.kmToPx(rangeKm * i / rings), 0, Math.PI*2);
      this.ctx.stroke();
    }
  }

  renderSweep(angle, rangeKm){
    const ang = angle * Math.PI/180;
    this.ctx.save();
    this.ctx.rotate(ang);
    const rangePx = this.kmToPx(rangeKm);
    const grad = this.ctx.createLinearGradient(0,0,rangePx,0);
    grad.addColorStop(0, 'rgba(0,255,0,0.25)'); // Increased opacity for visibility
    grad.addColorStop(1, 'rgba(0,255,0,0)');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.moveTo(0,0);
    this.ctx.arc(0,0, rangePx, -0.5, 0.5); // Made the sweep cone even wider
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  renderTrails(data){
    if (!data.trail || data.trail.length === 0) return;

    const maxDots = SIM_CONFIG.maxTrailDots;
    for (let i = 0; i < data.trail.length; i++) {
      const dotPos = data.trail[i];
      const p = { x: this.kmToPx(dotPos.x), y: -this.kmToPx(dotPos.y) };
      // Start with a lower opacity and fade less aggressively.
      const startOpacity = 0.4;
      const endOpacity = 0.1;
      const opacity = startOpacity - (i / (maxDots > 1 ? maxDots - 1 : 1)) * (startOpacity - endOpacity);
      
      // Use the base trail color and apply dynamic opacity
      this.ctx.fillStyle = this.theme.trail.replace('1)', `${opacity})`);
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); // Draw a 2px radius dot
      this.ctx.fill();
    }
  }

  renderAircraft(data, selected, displayOptions) {
    const p = { x: this.kmToPx(data.posKm.x), y: -this.kmToPx(data.posKm.y) }; // Use live posKm data
    const isSelected = selected && selected.id === data.id;

    this._renderAircraftBlip(p, data, isSelected);

    if (displayOptions.showHeading) {
      this._renderHeadingVector(p, data, isSelected);
    }

    this._renderDataBlock(p, data, isSelected, displayOptions);
  }

  _renderAircraftBlip(p, data, isSelected) {
    this.ctx.beginPath();
    this.ctx.fillStyle = data.type === 'hypersonic' ? THEME_COLORS.accentOrange : (isSelected ? '#ff0' : THEME_COLORS.accentGreen);
    const size = isSelected ? DISPLAY_CONFIG.selectedBlipSize : DISPLAY_CONFIG.aircraftBlipSize;
    this.ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    this.ctx.fill();
  }

  _renderHeadingVector(p, data, isSelected) {
    const vectorLength = DISPLAY_CONFIG.headingVectorLength;
    const headingRad = data.heading * (Math.PI / 180);
    const endX = p.x + Math.cos(headingRad) * vectorLength;
    const endY = p.y - Math.sin(headingRad) * vectorLength; // Invert Y for screen coordinates
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y);
    this.ctx.lineTo(endX, endY);
    this.ctx.strokeStyle = isSelected ? '#ff0' : (data.type === 'hypersonic' ? THEME_COLORS.accentOrange : THEME_COLORS.accentGreen);
    this.ctx.stroke();
  }

  _renderDataBlock(p, data, isSelected, displayOptions) {
    const line1Parts = [];
    if (displayOptions.showID) line1Parts.push(data.callsign);
    if (displayOptions.showHeading) line1Parts.push(`${Math.round(data.heading)}°`);

    const line2Parts = [];
    if (displayOptions.showAltitude) line2Parts.push(`${Math.round(data.altitudeFt)}ft`);
    if (displayOptions.showSpeed) line2Parts.push(`${Math.round(data.speedKts)}kts`);

    const line1 = line1Parts.join(' | ');
    const line2 = line2Parts.join(' | ');

    if (line1 === '' && line2 === '') return;

    const padding = { x: 5, y: 4 };
    const lineHeight = 12;
    const lineGap = 2;
    const blockHeight = (line1 ? lineHeight : 0) + (line2 ? lineHeight : 0) + (line1 && line2 ? lineGap : 0) + (padding.y * 2);

    this.ctx.font = "10px 'Segoe UI'";
    const line1Width = this.ctx.measureText(line1).width;
    const line2Width = this.ctx.measureText(line2).width;
    const blockWidth = Math.max(line1Width, line2Width) + (padding.x * 2);

    const blockX = p.x + 12;
    const blockY = p.y - blockHeight;

    // Draw background
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.fillRect(blockX, blockY, blockWidth, blockHeight);

    // Draw text
    this.ctx.fillStyle = isSelected ? '#ff0' : (data.type === 'hypersonic' ? THEME_COLORS.accentOrange : THEME_COLORS.accentGreen);
    const textY1 = blockY + padding.y + lineHeight - 2; // Adjust for text baseline
    const textY2 = textY1 + (line1 ? lineHeight + lineGap : 0);

    // Draw Line 1 with mixed weights
    if (line1) {
        let currentX = blockX + padding.x;
        // Draw callsign bold
        if (displayOptions.showID) {
            this.ctx.font = "bold 10px 'Segoe UI'";
            this.ctx.fillText(data.callsign, currentX, textY1);
            currentX += this.ctx.measureText(data.callsign).width;
        }
        // Draw heading normal
        if (displayOptions.showID && displayOptions.showHeading) {
            const separator = ' | ';
            this.ctx.font = "10px 'Segoe UI'";
            this.ctx.fillText(separator + `${Math.round(data.heading)}°`, currentX, textY1);
        } else if (displayOptions.showHeading) { // Only heading is enabled
            this.ctx.font = "10px 'Segoe UI'";
            this.ctx.fillText(`${Math.round(data.heading)}°`, currentX, textY1);
        }
    }
    // Draw Line 2
    if (line2) {
        this.ctx.font = "10px 'Segoe UI'";
        this.ctx.fillText(line2, blockX + padding.x, textY2);
    }
  }
}