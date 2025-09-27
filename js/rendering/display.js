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
    this.clear();
    this.ctx.save();
    this.ctx.translate(this.cx, this.cy);

    this.renderRunways();
    this.renderGrid(radar.range);
    this.renderSweep(radar.sweepAngle, radar.range);

    // aircraftList is now an array of state objects from the radar, not Aircraft instances.
    for (const data of aircraftList){
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
    grad.addColorStop(0, this.theme.sweep);
    grad.addColorStop(1, 'rgba(0,255,0,0)');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.moveTo(0,0);
    this.ctx.arc(0,0, rangePx, -0.25, 0.25); // Wider sweep cone
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
    const lines = [];
    if (displayOptions.showID) lines.push(data.callsign);
    if (displayOptions.showSpeed) lines.push(`${Math.round(data.speedKts)} kts`);
    if (displayOptions.showAltitude) lines.push(`${Math.round(data.altitudeFt)} ft`);
    if (lines.length === 0) return;
    
    const txt = lines.join(' | ');
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.fillRect(p.x+8, p.y-18, this.ctx.measureText(txt).width+10, 22);
    this.ctx.fillStyle = isSelected ? '#ff0' : (data.type === 'hypersonic' ? THEME_COLORS.accentOrange : THEME_COLORS.accentGreen);
    this.ctx.fillText(txt, p.x+12, p.y-4);
  }
}