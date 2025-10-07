/**
 * Module: diorama-3d.js
 *
 * This module initializes the 3D animation scene on the "Diorama" page
 * by configuring and instantiating the generic ThreeDViewer.
 */
import { ThreeDViewer } from './three-viewer.js';

export function init3DScenes() {
    // Check if the containers exist before initializing
    if (document.getElementById('diorama-3d-canvas')) {
        new ThreeDViewer({
            canvasId: 'diorama-3d-canvas',
            modelPath: 'models/airport_diorama.glb',
            controls: {
                play: 'play-3d-btn',
                reset: 'reset-3d-btn',
                maximize: 'maximize-3d-btn',
                grid: 'grid-3d-btn',
                camera: 'camera-3d-btn',
            },
            animation: {
                timeline: 'diorama-3d-timeline',
                states: {
                    'approach': 0,
                    'landed': 100,
                    'takeoff': 280,
                    'airborne': 360,
                }
            }
        });
    }
}
