/**
 * Module: par.js
 *
 * This module initializes and controls the Precision Approach Radar (PAR) view.
 * It handles the rendering of the localizer and glideslope canvases.
 */

class PARDisplay {
    constructor(localizerCanvas, glideslopeCanvas) {
        this.locCanvas = localizerCanvas;
        this.gsCanvas = glideslopeCanvas;
        this.locCtx = this.locCanvas.getContext('2d');
        this.gsCtx = this.gsCanvas.getContext('2d');

        // Set canvas resolution to its displayed size
        this.locCanvas.width = this.locCanvas.offsetWidth;
        this.locCanvas.height = this.locCanvas.offsetHeight;
        this.gsCanvas.width = this.gsCanvas.offsetWidth;
        this.gsCanvas.height = this.gsCanvas.offsetHeight;

        this.draw();
    }

    draw() {
        this.drawLocalizer();
        this.drawGlideslope();
    }

    drawLocalizer() {
        const ctx = this.locCtx;
        const { width, height } = this.locCanvas;

        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        const runwayLengthKm = 3.2;
        const totalDisplayKm = 18.52; // 10 NM in km
        const runwayLengthPx = (runwayLengthKm / totalDisplayKm) * width;
        const coneStartX = width - runwayLengthPx;

        // --- Fill inside of the corridor with a subtle color ---
        const azimuthAngle = 2.5 * (Math.PI / 180); // 2.5 degrees corridor
        const yOffsetAtLeft = coneStartX * Math.tan(azimuthAngle);
        ctx.fillStyle = '#081808'; // Dark green, slightly more contrast
        ctx.beginPath();
        ctx.moveTo(coneStartX, height / 2); // Start at the beginning of the runway
        ctx.lineTo(0, height / 2 - yOffsetAtLeft); // Top-left of corridor
        ctx.lineTo(0, height / 2 + yOffsetAtLeft); // Bottom-left of corridor
        ctx.closePath();
        ctx.fill();

        // --- Background Azimuth Guides (Safe Corridor) - Left-to-Right ---
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;

        // Upper guide
        ctx.beginPath();
        ctx.moveTo(coneStartX, height / 2); // Start at the beginning of the runway
        ctx.lineTo(0, height / 2 - yOffsetAtLeft); // End at top-left of corridor
        ctx.stroke();

        // Lower guide
        ctx.beginPath();
        ctx.moveTo(coneStartX, height / 2); // Start at the beginning of the runway
        ctx.lineTo(0, height / 2 + yOffsetAtLeft); // End at bottom-left of corridor
        ctx.stroke();

        // --- Centerline (Horizontal) ---
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // --- Runway Representation (3.2km solid line) ---
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(width - runwayLengthPx, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // --- Range markers and Grid Lines ---
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '12px "Fira Code", monospace';
        ctx.textAlign = 'left';
        for (let i = 1; i <= 10; i++) {
            const x = width - (i * (width / 10));
            
            // Use a bolder line for the 10 NM and 6 NM markers
            const isMajorLine = (i === 10 || i === 6);
            ctx.strokeStyle = isMajorLine ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // NM distance text
            ctx.fillText(`${i} NM`, x + 5, height - 10);

            // Centerline tick mark
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.beginPath();
            ctx.moveTo(x, height / 2 - 10);
            ctx.lineTo(x, height / 2 + 10);
            ctx.stroke();
        }

        // Draw a bolder line for the Threshold
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(coneStartX, 0);
        ctx.lineTo(coneStartX, height);
        ctx.stroke();

        // --- Primary Section Headings ---
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        const headingY = 25;

        // 'Localizer' at 10 NM (left edge)
        ctx.textAlign = 'left';
        ctx.fillText('Localizer', 10, headingY);

        // '6 ILS' at 6 NM
        ctx.textAlign = 'center';
        ctx.fillText('6 ILS', width * 0.4, headingY);

        ctx.fillText('Threshold', coneStartX, headingY);
    }

    drawGlideslope() {
        const ctx = this.gsCtx;
        const { width, height } = this.gsCanvas;

        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        const runwayLengthKm = 3.2;
        const totalDisplayKm = 18.52; // 10 NM in km
        const runwayLengthPx = (runwayLengthKm / totalDisplayKm) * width;
        const thresholdX = width - runwayLengthPx;
        const touchdownDistKm = 0.3; // 300m touchdown zone
        const touchdownDistPx = (touchdownDistKm / totalDisplayKm) * width;
        const touchdownX = thresholdX + touchdownDistPx;
        const runwayY = height * 0.85; // Adjust vertical position for new canvas height

        // --- Fill inside of the glideslope corridor ---
        const upperAngleFill = 4.0 * (Math.PI / 180); // Wider cone
        const lowerAngleFill = 2.0 * (Math.PI / 180); // Wider cone
        const startYUpper = runwayY - Math.tan(upperAngleFill) * touchdownX;
        const startYLower = runwayY - Math.tan(lowerAngleFill) * touchdownX;

        ctx.fillStyle = '#081808'; // Dark green, slightly more contrast
        ctx.beginPath();
        ctx.moveTo(touchdownX, runwayY); // Start cone from touchdown point
        ctx.lineTo(0, startYUpper);
        ctx.lineTo(0, startYLower);
        ctx.closePath();
        ctx.fill();

        // --- Background Glideslope Guides (Safe Corridor) ---
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        const upperAngle = 4.0 * (Math.PI / 180); // 4.0 degrees
        const lowerAngle = 2.0 * (Math.PI / 180); // 2.0 degrees

        const drawGuideLine = (angle) => {
            const startY = runwayY - Math.tan(angle) * touchdownX;
            ctx.beginPath();
            ctx.moveTo(0, startY);
            ctx.lineTo(touchdownX, runwayY);
            ctx.stroke();
        };

        drawGuideLine(upperAngle); // Upper limit
        drawGuideLine(lowerAngle); // Lower limit

        // --- Ideal Glideslope (3 degrees) ---
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);

        const angleRad = 3 * (Math.PI / 180); // 3 degrees in radians
        const startX = 0;
        const startY = runwayY - Math.tan(angleRad) * touchdownX;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(touchdownX, runwayY);
        ctx.stroke();
        ctx.setLineDash([]);

        // --- Runway representation ---
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(width - runwayLengthPx, runwayY);
        ctx.lineTo(width, runwayY); // Draw from 3.2km out to the edge
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillText("RWY", width - runwayLengthPx + 5, runwayY - 10);

        // --- Vertical Range Grid Lines (matching Localizer) ---
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '12px "Fira Code", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';

        for (let i = 1; i <= 10; i++) {
            const x = width - (i * (width / 10));
            
            // Use a bolder line for the 10 NM and 6 NM markers
            const isMajorLine = (i === 10 || i === 6);
            ctx.strokeStyle = isMajorLine ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // NM distance text at the bottom
            ctx.fillText(`${i} NM`, x + 5, height - 10);
        }

        // Draw a bolder line for the Threshold
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(thresholdX, 0);
        ctx.lineTo(thresholdX, height);
        ctx.stroke();

        // --- Primary Section Headings (matching Localizer) ---
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        const headingY = 25;

        // 'Localizer' at 10 NM (left edge)
        ctx.textAlign = 'left';
        ctx.fillText('Localizer', 10, headingY);

        // '6 ILS' at 6 NM
        ctx.textAlign = 'center';
        ctx.fillText('6 ILS', width * 0.5, headingY); // Corresponds to 6NM on this view
        ctx.fillText('Threshold', thresholdX, headingY);
    }
}


// --- Initialization (called by app.js after view is loaded) ---
export function initializeParDisplay() {
    const localizerCanvas = document.getElementById('parLocalizerCanvas');
    const glideslopeCanvas = document.getElementById('parGlideslopeCanvas');
    if (localizerCanvas && glideslopeCanvas) {
        new PARDisplay(localizerCanvas, glideslopeCanvas);
    }
}