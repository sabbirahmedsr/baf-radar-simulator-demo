/**
 * Module: diorama.js
 *
 * This module defines the Diorama class, which encapsulates all the logic for
 * the interactive 2D diorama demonstration on the "Diorama" page.
 * It handles canvas rendering, user input from the slider and radio buttons,
 * and the animation logic for landing and take-off scenarios.
 */

export class Diorama {
    constructor(canvas, slider, scenarioRadios) {
        this.canvas = canvas;
        this.slider = slider;
        this.scenarioRadios = scenarioRadios;

        if (!this.canvas || !this.slider) {
            console.error("Diorama module: canvas or slider element not found.");
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.currentScenario = 'landing';

        // Load the aircraft image
        this.aircraftImage = new Image();
        this.aircraftImage.src = 'img/diorama/airplane-side-view.png';
        this.aircraftImage.onload = () => {
            this.draw(); // Redraw once the image is loaded
        };

        this.setupListeners();
        this.resize(); // Initial setup
    }

    setupListeners() {
        this.slider.addEventListener('input', () => this.draw());
        this.scenarioRadios.forEach(radio => radio.addEventListener('change', (e) => {
            this.currentScenario = e.target.value;
            this.slider.value = 0; // Reset slider
            this.draw();
        }));
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (this.canvas.offsetWidth === 0) {
            setTimeout(() => this.resize(), 100);
            return;
        }
        this.canvas.width = this.canvas.offsetWidth;
        // The height is now determined by the CSS aspect-ratio property
        this.canvas.height = this.canvas.offsetHeight;
        this.draw();
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    quadraticBezier(p0, p1, p2, t) {
        return Math.pow(1 - t, 2) * p0 + 2 * (1 - t) * t * p1 + Math.pow(t, 2) * p2;
    }

    drawAircraft(acX, acY, acScale) {
        this.ctx.save();
        this.ctx.translate(acX, acY);
        this.ctx.scale(acScale, acScale);
        
        // Draw the loaded image instead of a path
        if (this.aircraftImage.complete && this.aircraftImage.naturalHeight !== 0) {
            const imgWidth = 60;
            const imgHeight = (imgWidth / this.aircraftImage.naturalWidth) * this.aircraftImage.naturalHeight;
            this.ctx.drawImage(this.aircraftImage, -imgWidth / 2, -imgHeight * 0.75, imgWidth, imgHeight);
        }
        this.ctx.restore();
    }

    draw() {
        const t = this.slider.value / this.slider.max;
        const { width, height } = this.canvas;

        // Update slider progress fill
        this.slider.style.setProperty('--slider-progress', `${t * 100}%`);

        // --- Draw Background ---
        const horizonY = height * 0.70;   // The line where sky meets ground
        const runwayY = height * 0.85;    // The centerline for the runway
        const runwayHeight = 30;
        const runwayTopY = runwayY - (runwayHeight / 2); // Top edge of the runway

        // Sky with gradient
        const skyGradient = this.ctx.createLinearGradient(0, 0, 0, horizonY);
        skyGradient.addColorStop(0, '#0d1a26'); // Darker blue at the top
        skyGradient.addColorStop(1, '#2c3e50'); // Lighter, hazy blue at the horizon
        this.ctx.fillStyle = skyGradient;
        this.ctx.fillRect(0, 0, width, horizonY);

        // Mid-ground (receding ground)
        const midGroundGradient = this.ctx.createLinearGradient(0, horizonY, 0, runwayTopY);
        midGroundGradient.addColorStop(0, '#2c3e50'); // Match the hazy blue at the horizon for a seamless blend
        midGroundGradient.addColorStop(1, '#2E4031'); // Fade to a dark, desaturated green
        this.ctx.fillStyle = midGroundGradient;
        this.ctx.fillRect(0, horizonY, width, runwayTopY - horizonY);

        // Foreground (where the runway sits)
        const foregroundGradient = this.ctx.createLinearGradient(0, runwayTopY, 0, height);
        foregroundGradient.addColorStop(0, '#2E4031'); // Match the dark green from the mid-ground
        foregroundGradient.addColorStop(1, '#1A2B1D'); // Fade to a very dark, earthy green
        this.ctx.fillStyle = foregroundGradient;
        this.ctx.fillRect(0, runwayTopY, width, height - runwayTopY);

        // --- Aircraft Logic ---
        let acX, acY, acScale = 1;
        let runwayStart, runwayEnd; // runwayY is already defined above
        
        const runwayLength = width / 2;
        const edgeGap = width * 0.05;

        // --- Draw Scenario Guides ---
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.font = '12px Segoe UI';
        this.ctx.textAlign = 'center';
        this.ctx.setLineDash([4, 4]);

        const drawGuideLine = (x, label) => {
            // --- Draw Label ---
            const labelWidth = this.ctx.measureText(label).width;
            const labelX = Math.max(labelWidth / 2 + 5, Math.min(x, width - labelWidth / 2 - 5));
            const labelY = 20;
            this.ctx.fillText(label, labelX, labelY);

            // --- Draw Underline ---
            const underlineY = labelY + 5;
            this.ctx.save();
            this.ctx.setLineDash([]); // Make underline solid
            this.ctx.beginPath();
            this.ctx.moveTo(labelX - labelWidth / 2, underlineY);
            this.ctx.lineTo(labelX + labelWidth / 2, underlineY);
            this.ctx.stroke();
            this.ctx.restore(); // Restore dashed line setting

            // --- Draw Vanishing Line ---
            const lineStartY = underlineY + 2; // Start just below the underline
            this.ctx.beginPath();
            this.ctx.moveTo(x, lineStartY);
            this.ctx.lineTo(x, runwayY); // Draw down to the runway's vertical center
            this.ctx.stroke();
        };

        if (this.currentScenario === 'landing') {
            const rwyEnd = width - edgeGap;
            const rwyStart = rwyEnd - runwayLength;
            drawGuideLine(width * 0.1, '6 DME (ILS Start)'); // Add gap from left edge
            drawGuideLine(rwyStart, 'Threshold');
            drawGuideLine(rwyStart + 120, 'Touchdown'); // Positioned just after start threshold
            drawGuideLine(rwyEnd - 150, 'Fly End'); // Moved left
        } else { // Takeoff
            const rwyStart = edgeGap;
            const rwyEnd = rwyStart + runwayLength;
            const airborneX = width - (width * 0.1); // Same distance from right edge as 6 DME is from left
            drawGuideLine(rwyStart + (runwayLength * 0.2), 'Line Up'); // Moved right
            drawGuideLine(rwyStart + (runwayLength * 0.6), 'Take-off'); // Moved left
            drawGuideLine(airborneX, 'Airborne');
        }
        this.ctx.restore();

        if (this.currentScenario === 'landing') {
            // Runway is on the right half of the screen
            runwayEnd = width - edgeGap;
            runwayStart = runwayEnd - runwayLength;

            const approachStart = { x: width * 0.1, y: height * 0.25 }; // Start at 25% of the height
            const touchdown = { x: runwayStart + 120, y: runwayY }; // Match guide line
            const rolloutEnd = { x: runwayEnd - 150, y: runwayY }; // Match guide line
            const touchdownT = 0.6; // 60% of slider is for the approach

            if (t <= touchdownT) {
                const approachT = t / touchdownT;
                acX = this.lerp(approachStart.x, touchdown.x, approachT);
                acY = this.lerp(approachStart.y, touchdown.y, approachT); // Reverted to linear for landing
            } else {
                const rolloutT = (t - touchdownT) / (1 - touchdownT);
                acX = this.lerp(touchdown.x, rolloutEnd.x, rolloutT);
                acY = rolloutEnd.y;
            }
        } else { // Takeoff
            // Runway is on the left half of the screen
            runwayStart = edgeGap;
            runwayEnd = runwayStart + runwayLength;

            const lineup = { x: runwayStart + (runwayLength * 0.2), y: runwayY }; // Match guide line
            const takeoffPoint = { x: runwayStart + (runwayLength * 0.6), y: runwayY }; // Match guide line
            const airborneEnd = { x: width - (width * 0.1), y: height * 0.3 }; // Match the guide line
            const takeoffT = 0.4; // Ground roll now takes 40% of the slider

            if (t <= takeoffT) {
                const groundRollT = t / takeoffT;
                acX = this.lerp(lineup.x, takeoffPoint.x, groundRollT);
                acY = lineup.y;
            } else {
                const climbT = (t - takeoffT) / (1 - takeoffT);
                acX = this.lerp(takeoffPoint.x, airborneEnd.x, climbT);
                acY = this.quadraticBezier(takeoffPoint.y, takeoffPoint.y, airborneEnd.y, climbT); // Use Bezier for a smooth climb-out
            }
        }

        // --- Draw Runway (now that we have its dynamic properties) ---
        this.ctx.fillStyle = '#4a4a52';
        this.ctx.fillRect(runwayStart, runwayY - 15, runwayEnd - runwayStart, 30);

        // --- Draw Threshold Markings ("Piano Keys") ---
        this.ctx.fillStyle = '#e0e0e0';
        const thresholdPositionStart = runwayStart + 60;
        const thresholdPositionEnd = runwayEnd - 60;
        const thresholdMarkingLength = 40;
        const thresholdMarkingHeight = 2;
        const verticalGap = 5; // Gap between each parallel line

        // Draw 5 parallel lines at each threshold
        for (let i = -2; i <= 2; i++) {
            const yOffset = i * verticalGap;
            // Start threshold
            this.ctx.fillRect(thresholdPositionStart, runwayY + yOffset - (thresholdMarkingHeight/2), thresholdMarkingLength, thresholdMarkingHeight);
            // End threshold
            this.ctx.fillRect(thresholdPositionEnd - thresholdMarkingLength, runwayY + yOffset - (thresholdMarkingHeight/2), thresholdMarkingLength, thresholdMarkingHeight);
        }

        // Draw horizontal markings between the thresholds
        const markingZoneStart = thresholdPositionStart + thresholdMarkingLength + 30; // Increased gap
        const markingZoneEnd = thresholdPositionEnd - thresholdMarkingLength - 30;   // Increased gap
        const numMarkings = 6; // A good number for the inner space
        for (let i = 0; i < numMarkings; i++) {
            const markingX = this.lerp(markingZoneStart, markingZoneEnd, i / (numMarkings - 1));
            this.ctx.fillRect(markingX - 20, runwayY - 1, 40, 2);
        }

        // Draw runway numbers
        this.ctx.save();
        this.ctx.fillStyle = '#e0e0e0';
        this.ctx.font = 'bold 16px Segoe UI';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Rotate and draw "14"
        const numPadding = 28;
        this.ctx.save();
        this.ctx.translate(runwayStart + numPadding, runwayY);
        this.ctx.rotate(Math.PI / 2);
        this.ctx.fillText('14', 0, 0);
        this.ctx.restore();

        // Rotate and draw "32"
        this.ctx.save();
        this.ctx.translate(runwayEnd - numPadding, runwayY);
        this.ctx.rotate(-Math.PI / 2); // Rotate in the opposite direction
        this.ctx.fillText('32', 0, 0);
        this.ctx.restore();

        // --- Draw Aircraft Shadow ---
        const shadowY = runwayY + 1; // Position the shadow on the runway surface
        const heightAboveGround = Math.max(0, acY - runwayY);
        
        // Shadow gets smaller and more transparent as the aircraft gets higher
        const maxShadowWidth = 60;
        const shadowWidth = this.lerp(maxShadowWidth, maxShadowWidth * 0.5, Math.min(1, heightAboveGround / (height * 0.5)));
        const shadowOpacity = this.lerp(0.4, 0.1, Math.min(1, heightAboveGround / (height * 0.5)));

        this.ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
        this.ctx.beginPath();
        this.ctx.ellipse(acX, shadowY, shadowWidth / 2, shadowWidth / 16, 0, 0, Math.PI * 2);
        this.ctx.fill();

        this.drawAircraft(acX, acY, acScale);
    }
}
