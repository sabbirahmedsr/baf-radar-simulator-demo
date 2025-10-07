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

        // --- Centerline ---
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // --- Range markers ---
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '12px "Fira Code", monospace';
        ctx.textAlign = 'center';
        for (let i = 1; i <= 10; i++) {
            const y = height - (i * (height / 10));
            ctx.fillText(`${i} NM`, width / 2 + 30, y + 4);

            ctx.beginPath();
            ctx.moveTo(width / 2 - 10, y);
            ctx.lineTo(width / 2 + 10, y);
            ctx.stroke();
        }
    }

    drawGlideslope() {
        const ctx = this.gsCtx;
        const { width, height } = this.gsCanvas;

        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        // --- Ideal Glideslope (3 degrees) ---
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);

        const runwayX = width * 0.8; // Runway threshold position on the right
        const runwayY = height * 0.85; // Adjust vertical position for new canvas height
        const angleRad = 3 * (Math.PI / 180); // 3 degrees in radians
        const startX = 0;
        const startY = runwayY - Math.tan(angleRad) * runwayX;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(runwayX, runwayY);
        ctx.stroke();
        ctx.setLineDash([]);

        // --- Runway representation ---
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(runwayX, runwayY);
        ctx.lineTo(width, runwayY);
        ctx.stroke();
        ctx.fillText("RWY", runwayX + 20, runwayY - 10);
    }
}


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // This check ensures the script only runs when the PAR view is active and loaded.
    if (document.getElementById('par-view')?.classList.contains('active')) {
        const localizerCanvas = document.getElementById('parLocalizerCanvas');
        const glideslopeCanvas = document.getElementById('parGlideslopeCanvas');
        if (localizerCanvas && glideslopeCanvas) {
            new PARDisplay(localizerCanvas, glideslopeCanvas);
        }
    }
});