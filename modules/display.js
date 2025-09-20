/**
 * Module: display.js
 * Purpose: Handles all rendering on the HTML canvas, including the radar beam, aircraft blips,
 * history trails, and data overlays. Contains no simulation logic, making it easy to replace
 * with a Unity rendering system.
 * Interactions: Receives radar and aircraft data from simulation.js, renders via canvas context.
 * @module Display
 */

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
    window.addEventListener('resize', ()=>{});
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

    for (const a of aircraftList){
      const data = a.toDisplayData();
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
    this.ctx.fillStyle = '#444';
    this.ctx.fillRect(-lengthPx / 2, -widthPx / 2, lengthPx, widthPx);

    this.ctx.restore();
  }

  renderGrid(rangeKm){
    const rings = 4;
    this.ctx.strokeStyle = '#0a3';
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
    grad.addColorStop(0,'rgba(0,255,0,0.15)');
    grad.addColorStop(1,'rgba(0,255,0,0)');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.moveTo(0,0);
    this.ctx.arc(0,0, rangePx, -0.25, 0.25); // Wider sweep cone
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  renderTrails(data){
    if (!data.trail || data.trail.length<2) return;
    this.ctx.beginPath();
    for (let i=0;i<data.trail.length;i++){
      const p = { x: this.kmToPx(data.trail[i].pos.x), y: -this.kmToPx(data.trail[i].pos.y) };
      if (i===0) this.ctx.moveTo(p.x,p.y); else this.ctx.lineTo(p.x,p.y);
    }
    this.ctx.strokeStyle = 'rgba(0,200,255,0.6)';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }

  renderAircraft(data, selected, displayOptions){
    const p = { x: this.kmToPx(data.posKm.x), y: -this.kmToPx(data.posKm.y) };
    const isSelected = selected && selected.id === data.id;
    // blip
    this.ctx.beginPath();
    this.ctx.fillStyle = data.isHypersonic ? 'orange' : (isSelected ? '#ff0' : '#0f0');
    this.ctx.arc(p.x, p.y, isSelected ? 6 : 4, 0, Math.PI*2);
    this.ctx.fill();

    // data block
    const lines = [];
    if (displayOptions.showID) lines.push(data.callsign);
    if (displayOptions.showSpeed) lines.push(`${Math.round(data.speedKts)}kts`);
    if (displayOptions.showAltitude) lines.push(`${Math.round(data.altitudeFt)}ft`);
    if (lines.length === 0) return;

    const txt = lines.join(' | ');
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.fillRect(p.x+8, p.y-18, this.ctx.measureText(txt).width+10, 22);
    this.ctx.fillStyle = isSelected ? '#ff0' : (data.isHypersonic ? 'orange' : '#0f0');
    this.ctx.fillText(txt, p.x+12, p.y-4);
  }
}