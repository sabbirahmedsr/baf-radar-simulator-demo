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
    // A sweep cycle completes when it goes from a high value (e.g., 359) to a low one (e.g., 0).
    // The original check was just `radar.sweepAngle < this.lastSweepAngle`.
    // This more robust check prevents false triggers if the angle jitters slightly.
    if (this.lastSweepAngle > 350 && radar.sweepAngle < 10) {
      // Reset the update flag for all targets at the start of a new sweep
      for (const target of this.displayTargets.values()) {
        target.updatedThisSweep = false;
      }
    }

    // Update the map of displayable targets with live data
    aircraftList.forEach(liveAc => {
      // Calculate bearing in navigational system (0=N, 90=E, clockwise)
      // atan2(x, y) gives angle from North, clockwise.
      const bearing = (Math.atan2(liveAc.posKm.x, liveAc.posKm.y) * 180 / Math.PI + 360) % 360;
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
    this._renderCompassRose(radar.range);
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
      heading: 144, // The correct heading for runway 14/32
      lengthKm: 10.0, // Using a long visual length for prominence
    };

    this.ctx.save();
    // Convert navigational heading to canvas angle (0=E, CCW)
    const rotationRad = (runway.heading - 90) * Math.PI / 180;
    this.ctx.rotate(rotationRad);
    const lengthPx = this.kmToPx(runway.lengthKm);

    // Draw runway as a single, solid line
    this.ctx.strokeStyle = '#fff'; // White centerline
    this.ctx.lineWidth = 2; // Make it slightly thicker to be visible
    this.ctx.setLineDash([]); // Ensure the line is solid
    this.ctx.beginPath();
    this.ctx.moveTo(-lengthPx / 2, 0);
    this.ctx.lineTo(lengthPx / 2, 0);
    this.ctx.stroke();

    // Draw runway numbers
    this.ctx.fillStyle = '#484848'; // Use the same subtle color as the compass rose
    this.ctx.font = '12px Segoe UI'; // Make the font smaller and not bold
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    const numberOffset = 20; // Distance from the runway end

    // Runway 14 is at the "end" of the line in the 144-degree direction
    // This is the approach end from the northwest (324°), so it gets the number '14'.
    this.ctx.fillText('14', -lengthPx / 2 - numberOffset, 0);

    // Runway 32 is at the "start" of the line
    // This is the approach end from the southeast (144°), so it gets the number '32'.
    this.ctx.fillText('32', lengthPx / 2 + numberOffset, 0);

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
    // Convert navigational angle (0=N) to canvas angle (0=E, CCW)
    // We subtract 90 degrees to shift North (0) to the top of the canvas (-90).
    const angRad = (angle - 90) * Math.PI / 180;
    this.ctx.save();
    this.ctx.rotate(angRad);
    const rangePx = this.kmToPx(rangeKm);
    const grad = this.ctx.createLinearGradient(0,0,rangePx,0);
    grad.addColorStop(0, 'rgba(80, 227, 194, 0.25)'); // Use theme color
    grad.addColorStop(1, 'rgba(0,255,0,0)');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.moveTo(0,0);
    this.ctx.arc(0,0, rangePx, -0.5, 0.5); // Made the sweep cone even wider
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  /**
   * Renders a static compass rose in the background.
   * @param {number} rangeKm - The current radar range in kilometers.
   * @private
   */
  _renderCompassRose(rangeKm) {
    // Position text exactly between the 3rd (75%) and 4th (100%) rings.
    const textRadiusPx = this.kmToPx(rangeKm) * 0.875;
    const tickRadiusPx = this.kmToPx(rangeKm);
    this.ctx.save();
    // Use a very subtle color that almost blends with the background
    this.ctx.fillStyle = '#484848'; // Increased contrast slightly for better visibility
    this.ctx.strokeStyle = '#484848';
    this.ctx.font = "10px 'Segoe UI'"; // Revert to a slightly larger font
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Draw tick marks and numbers at 15-degree intervals
    for (let angleDeg = 0; angleDeg < 360; angleDeg += 15) {
      const angleRad = (angleDeg - 90) * Math.PI / 180;

      const isMajorInterval = angleDeg % 30 === 0;
      const tickLength = isMajorInterval ? 10 : 5; // Major ticks are longer

      // Draw the tick mark
      const startX = (tickRadiusPx - tickLength) * Math.cos(angleRad);
      const startY = (tickRadiusPx - tickLength) * Math.sin(angleRad);
      const endX = tickRadiusPx * Math.cos(angleRad);
      const endY = tickRadiusPx * Math.sin(angleRad);
      this.ctx.beginPath();
      this.ctx.moveTo(startX, startY);
      this.ctx.lineTo(endX, endY);
      this.ctx.stroke();

      // Draw the text only on major intervals (every 30 degrees)
      if (isMajorInterval) {
        const x = textRadiusPx * Math.cos(angleRad); // Position for the text
        const y = textRadiusPx * Math.sin(angleRad);
        const text = angleDeg.toString().padStart(3, '0') + '°';
        this.ctx.fillText(text, x, y);
      }
    }
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
    // Convert navigational heading to a standard angle for drawing.
    // sin(heading) for x, cos(heading) for y, and negate y for screen coordinates.
    const headingRad = data.heading * (Math.PI / 180); 
    const endX = p.x + Math.sin(headingRad) * vectorLength;
    const endY = p.y - Math.cos(headingRad) * vectorLength;
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