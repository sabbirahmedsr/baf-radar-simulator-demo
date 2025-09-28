/**
 * Module: diorama-3d.js
 *
 * This module defines the Diorama3D class, which manages individual
 * 3D animation scenes on the "Airport Diorama" page.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class ThreeScene {
    constructor(canvasId, modelPath) {
        this.canvas = document.getElementById(canvasId);
        this.modelPath = modelPath;

        // Generic button IDs from the single view
        this.playButton = document.getElementById('play-3d-btn');
        this.resetButton = document.getElementById('reset-3d-btn');
        this.maximizeButton = document.getElementById('maximize-3d-btn');
        this.gridButton = document.getElementById('grid-3d-btn');
        this.cameraButton = document.getElementById('camera-3d-btn');
        this.timelineContainer = document.getElementById('diorama-3d-timeline');

        if (!this.canvas) {
            console.error(`Canvas with id ${canvasId} not found.`);
            return;
        }

        // Use ResizeObserver to reliably initialize when the canvas is visible and has a size.
        this.resizeObserver = new ResizeObserver(entries => {
            if (entries.length > 0 && entries[0].contentRect.width > 0) {
                console.log(`[${this.canvas.id}] Canvas is visible. Initializing scene.`);
                this.loadModel(); // This will now trigger init() and animate() upon success
                this.resizeObserver.disconnect(); // We only need to do this once for initialization.
            }
        });
        this.resizeObserver.observe(this.canvas);

        this.animations = new Map(); // To store all animation clips
    }

    init() {
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene();
        // this.scene.background = new THREE.Color(0x1a2a3a); // Replaced by sky dome

        // --- Camera ---
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        // Create both cameras at initialization to preserve their settings
        this.perspectiveCamera = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
        this.perspectiveCamera.position.set(0, 3, 7); // Moved camera closer and lower

        const frustumSize = 5;
        this.orthographicCamera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2, frustumSize * aspect / 2,
            frustumSize / 2, frustumSize / -2,
            0.1, 1000
        );
        this.orthographicCamera.position.set(0, 3, 7); // Match the new default position

        this.camera = this.perspectiveCamera; // Start with the perspective camera

        // --- Renderer ---
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // --- Lighting ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Increased intensity for brighter ambient light
        this.scene.add(ambientLight);
        const pointLight = new THREE.PointLight(0xffffff, 0.5);
        pointLight.position.set(2, 3, 4);
        this.scene.add(pointLight);

        // --- Sky Dome and Ground ---
        this.createSkyDome();

        // --- Helpers for Debugging ---
        const gridColor = new THREE.Color(0x82a354); // A darker green to blend with the ground
        this.gridHelper = new THREE.GridHelper(50, 50, gridColor, gridColor);
        this.scene.add(this.gridHelper);

        // Add OrbitControls to allow camera manipulation
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        // Blender-style navigation
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,   // Left-click to rotate (can be changed)
            MIDDLE: THREE.MOUSE.ROTATE, // Middle-click to rotate
            RIGHT: THREE.MOUSE.PAN      // Right-click to pan
        };
        this.controls.target.set(0, 0.5, 0);

        // --- Resize Listener ---
        window.addEventListener('resize', () => this.onResize());

        // --- Control Button Listeners ---
        this.playButton?.addEventListener('click', () => this.toggleAnimation());
        this.maximizeButton?.addEventListener('click', () => this.toggleFullscreen());
        this.resetButton?.addEventListener('click', () => this.resetView());
        this.gridButton?.addEventListener('click', () => this.toggleGrid());
        this.cameraButton?.addEventListener('click', () => this.toggleCameraProjection());

        this.timelineContainer?.addEventListener('click', (e) => {
            if (e.target.classList.contains('timeline-step')) {
                this.goToState(e.target.dataset.state);
            }
        });

        // Set initial camera button text
        if (this.cameraButton) {
            this.cameraButton.textContent = this.camera.isPerspectiveCamera ? 'Orthographic' : 'Perspective';
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.canvas.closest('.animation-container').classList.contains('fullscreen')) {
                this.toggleFullscreen();
            }
        });

        // Listen for browser back button to exit fullscreen
        window.addEventListener('popstate', (event) => {
            if (this.canvas.closest('.animation-container').classList.contains('fullscreen')) {
                this.toggleFullscreen(true); // Pass flag to prevent another history change
            }
        });
        this.controls.saveState(); // Save the initial camera state
    }

    createSkyDome() {
        const horizonColor = new THREE.Color(0x98BF64); // Light olive green for the ground
        const skyColor = new THREE.Color(0x87CEEB);     // Bright sky blue

        // --- Sky Dome ---
        const skyGeo = new THREE.SphereGeometry(50, 32, 15); // A large sphere
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: skyColor },
                bottomColor: { value: horizonColor },
                offset: { value: 0 }, // How much of the bottom is the horizon color
                exponent: { value: 0.8 } // Controls the gradient steepness
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y;
                    if (h < 0.0) {
                        gl_FragColor = vec4(bottomColor, 1.0); // Solid color for the ground
                    } else {
                        gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, exponent)), 1.0);
                    }
                }
            `,
            side: THREE.BackSide // Render on the inside of the sphere
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.load(this.modelPath, (gltf) => {
            console.log(`[${this.canvas.id}] Model loaded successfully from ${this.modelPath}`);
            this.model = gltf.scene;

            // Initialize scene now that we have a model to work with
            this.init();

            // --- Automatic Scaling and Centering ---
            // The model is now added at its original size and position (0,0,0)
            // as defined in the .glb file.
            this.scene.add(this.model);

            // Start the animation loop only after everything is loaded and initialized

            // --- Setup Animation ---
            // Load all animations from the file
            this.mixer = new THREE.AnimationMixer(this.model);
            gltf.animations.forEach((clip) => {
                const action = this.mixer.clipAction(clip);
                action.setLoop(THREE.LoopRepeat);
                this.animations.set(clip.name, action);
                console.log(`[${this.canvas.id}] Found animation: ${clip.name}`);
            });

            if (this.animations.size > 0) {
                this.goToState('approach'); // Start at the 'approach' state
                this.toggleAnimation(); // Play the animation by default
            } else {
                console.warn(`[${this.canvas.id}] No animations found in the model.`);
            }

            // Start the animation loop
            this.animate();
        },
        (xhr) => {
            // Called while loading is progressing
            if (xhr.lengthComputable) {
                console.log(`[${this.canvas.id}] ${this.modelPath}: ${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`);
            }
        },
        (error) => console.error(`Error loading model from ${this.modelPath}:`, error));
    }

    onResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        const aspect = width / height;

        if (this.camera.isPerspectiveCamera) {
            this.camera.aspect = aspect;
        } else if (this.camera.isOrthographicCamera) {
            // Adjust frustum to maintain aspect ratio and zoom level
            const zoom = this.camera.zoom;
            const frustumHeight = this.camera.top - this.camera.bottom;
            const frustumWidth = frustumHeight * aspect;
            this.camera.left = -frustumWidth / 2;
            this.camera.right = frustumWidth / 2;
            // The top and bottom are controlled by zoom, so we don't change them here
            // unless we want to fit to a fixed size.
        }

        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(this.clock.getDelta());
            this.updateTimelineUI();
        }

        // Required if controls.enableDamping or .autoRotate are set
        this.controls.update();

        this.renderer.render(this.scene, this.camera);
    }

    toggleAnimation() {
        if (this.animations.size === 0) return;

        // Check if any animation is currently running.
        const isPlaying = Array.from(this.animations.values()).some(action => action.isRunning());

        if (isPlaying) {
            this.animations.forEach(action => action.stop());
            this.playButton.textContent = 'Play';
        } else {
            this.animations.forEach(action => action.play());
            this.playButton.textContent = 'Pause';
        }
    }

    resetView() {
        if (!this.controls) return;

        // Ensure we are back on the default perspective camera
        if (this.camera !== this.perspectiveCamera) {
            this.camera = this.perspectiveCamera;
            this.controls.object = this.camera;
            this.cameraButton.textContent = 'Orthographic';
        }

        // Reset camera position and zoom to its saved initial state
        this.controls.reset();

        // Reset all animations to the beginning and update the button text.
        this.animations.forEach(action => action.reset());
        this.playButton.textContent = 'Play';
    }

    updateTimelineUI() {
        if (this.animations.size === 0 || !this.timelineContainer) return;

        // Get the first animation action to read the time from.
        // This assumes all animations are synced and have the same duration.
        const firstAction = this.animations.values().next().value;

        const FPS = 24;
        const currentTime = firstAction.time;
        let activeState = null;

        if (currentTime >= 0 && currentTime < 100 / FPS) {
            activeState = 'approach';
        } else if (currentTime >= 100 / FPS && currentTime < 180 / FPS) {
            activeState = 'landed';
        } else if (currentTime >= 180 / FPS && currentTime < 260 / FPS) {
            activeState = 'takeoff';
        } else {
            activeState = 'airborne';
        }

        // Avoid unnecessary DOM manipulation if the state hasn't changed
        if (this.timelineContainer.dataset.currentState === activeState) {
            return;
        }
        this.timelineContainer.dataset.currentState = activeState;

        // Update button styles
        this.timelineContainer.querySelectorAll('.timeline-step').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.state === activeState);
        });
    }

    goToState(state) {
        if (this.animations.size === 0) return;

        const FPS = 24; // Standard animation frame rate
        let time;

        switch (state) {
            case 'approach':
                time = 0 / FPS;
                break;
            case 'landed':
                time = 100 / FPS;
                break;
            case 'takeoff':
                time = 280 / FPS;
                break;
            case 'airborne':
                time = 390 / FPS;
                break;
            default:
                return;
        }

        // Check if any animation is currently running.
        const isPlaying = Array.from(this.animations.values()).some(action => action.isRunning());

        // Set the time for all animations
        this.animations.forEach(action => {
            action.time = time;
        });

        // Also play the animations if they are currently paused.
        if (!isPlaying) {
            this.animations.forEach(action => action.play());
            this.playButton.textContent = 'Pause';
        }
    }

    toggleGrid() {
        if (!this.gridHelper) return;
        this.gridHelper.visible = !this.gridHelper.visible;
    }

    toggleCameraProjection() {
        if (!this.camera || !this.controls) return;

        if (this.camera.isPerspectiveCamera) {
            this.camera = this.orthographicCamera;
        } else {
            this.camera = this.perspectiveCamera;
        }

        // Update OrbitControls to use the new camera
        this.controls.object = this.camera;
        this.onResize(); // Apply correct aspect ratio/frustum

        // Update button text to reflect the *next* state
        if (this.cameraButton) {
            this.cameraButton.textContent = this.camera.isPerspectiveCamera ? 'Orthographic' : 'Perspective';
        }
    }

    toggleFullscreen(isPoppingState = false) {
        const container = this.canvas.closest('.animation-container');
        if (!container) {
            console.error('Could not find animation container for fullscreen toggle.');
            return;
        }
        const willBeFullscreen = !container.classList.contains('fullscreen');
        container.classList.toggle('fullscreen', willBeFullscreen);

        // Toggle button text
        if (this.maximizeButton) {
            this.maximizeButton.textContent = willBeFullscreen ? 'Minimize' : 'Maximize';
        }

        // Manipulate browser history unless we are already handling a popstate event
        if (!isPoppingState) {
            if (willBeFullscreen) {
                // Push a state so the back button can be used to minimize
                history.pushState({ dioramaFullscreen: this.canvas.id }, 'Fullscreen');
            } else {
                // If the user clicked the minimize button, go back in history to clear our pushed state
                history.back();
            }
        }

        // We need to wait a moment for the CSS transition to apply before resizing the canvas
        setTimeout(() => this.onResize(), 50);
    }
}

export function init3DScenes() {
    // Check if the containers exist before initializing
    if (document.getElementById('diorama-3d-canvas')) {
        new ThreeScene('diorama-3d-canvas', 'models/airport_diorama.glb');
    }
}
