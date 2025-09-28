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
                // console.log(`[${this.canvas.id}] Canvas is visible. Initializing scene.`);
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
        this.scene.background = new THREE.Color().setHSL(0.6, 0, 1);
        this.scene.fog = new THREE.Fog(this.scene.background, 1, 5000);

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
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap; // Use hard shadows

        // --- Lighting ---
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 2);
        hemiLight.color.setHSL(0.6, 1, 0.6);
        hemiLight.groundColor.setHSL(0.095, 1, 0.75);
        hemiLight.position.set(0, 50, 0);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 3);
        dirLight.color.setHSL(0.1, 1, 0.95);
        dirLight.position.set(-1, 1.75, 1);
        dirLight.position.multiplyScalar(30);
        this.scene.add(dirLight);

        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        const d = 50;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.camera.far = 3500;
        dirLight.shadow.bias = -0.0001;

        // --- Sky Dome and Ground ---
        this.createSkyAndGround(hemiLight);

        // --- Helpers for Debugging ---
        // Helpers for the new lights
        // const hemiLightHelper = new THREE.HemisphereLightHelper(hemiLight, 10);
        // this.scene.add(hemiLightHelper);
        // const dirLightHelper = new THREE.DirectionalLightHelper(dirLight, 10);
        // this.scene.add(dirLightHelper);
        
        // Create a grid color that blends with the ground by using the same hue and saturation, but a different lightness.
        const gridColor = new THREE.Color().setHSL(0.095, 1, 0.65); // Same H/S as ground, but darker

        this.gridHelper = new THREE.GridHelper(50, 50, gridColor, gridColor);
        this.scene.add(this.gridHelper);
        this.gridHelper.visible = false; // Hide grid by default

        // Add OrbitControls to allow camera manipulation
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        // Set CAD-style navigation: Left-click rotates, Middle-click pans
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.ROTATE // Right-click also rotates
        };
        this.controls.zoomSpeed = 2.0; // Increase zoom speed
        this.controls.target.set(0, 0.5, 0);

        // Prevent default browser action (scrolling) on middle mouse button down
        this.renderer.domElement.addEventListener('mousedown', (event) => {
            if (event.button === 1) { // Middle mouse button
                event.preventDefault();
            }
        });

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

        // Listen for fullscreen changes to correctly resize the canvas
        document.addEventListener('fullscreenchange', () => {
            const container = this.canvas.closest('.animation-container');
            if (!container) return;

            // Check if we are actually in fullscreen mode
            const isFullscreen = document.fullscreenElement === container;
            container.classList.toggle('fullscreen', isFullscreen);
            
            // Use requestAnimationFrame to ensure the browser has applied CSS changes
            // before we query the new canvas dimensions. This prevents a race condition.
            requestAnimationFrame(() => {
                this.onResize();
            });
        });
        // Listen for browser back button to exit fullscreen
        window.addEventListener('popstate', (event) => {
            if (this.canvas.closest('.animation-container').classList.contains('fullscreen')) {
                this.toggleFullscreen(true); // Pass flag to prevent another history change
            }
        });
        this.controls.saveState(); // Save the initial camera state
    }

    createSkyAndGround(hemiLight) {
        // GROUND
        const groundGeo = new THREE.PlaneGeometry(10000, 10000);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        groundMat.color.setHSL(0.095, 1, 0.75);
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = -0.7; // Lowered the ground slightly
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // SKYDOME
        const uniforms = {
            'topColor': { value: new THREE.Color(0x0077ff) },
            'bottomColor': { value: new THREE.Color(0xffffff) },
            'offset': { value: 0.7 }, // Match the ground's y-position
            'exponent': { value: 0.6 }
        };
        uniforms['topColor'].value.copy(hemiLight.color);
        this.scene.fog.color.copy(uniforms['bottomColor'].value);

        const skyGeo = new THREE.SphereGeometry(4000, 32, 15);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }`,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize( vWorldPosition + offset ).y;
                    gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
                }`,
            side: THREE.BackSide // Render on the inside of the sphere
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.load(this.modelPath, (gltf) => {
            // console.log(`[${this.canvas.id}] Model loaded successfully from ${this.modelPath}`);
            this.model = gltf.scene;

            // Initialize scene now that we have a model to work with
            this.init();

            // --- Automatic Scaling and Centering ---
            // The model is now added at its original size and position (0,0,0)
            this.scene.add(this.model);

            // Enable shadows for the model
            this.model.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = true;
                }
            });

            // Start the animation loop only after everything is loaded and initialized

            // --- Setup Animation ---
            // Load all animations from the file
            this.mixer = new THREE.AnimationMixer(this.model);
            gltf.animations.forEach((clip) => {
                const action = this.mixer.clipAction(clip);
                action.setLoop(THREE.LoopRepeat);
                this.animations.set(clip.name, action);
                // console.log(`[${this.canvas.id}] Found animation: ${clip.name}`);
            });

            if (this.animations.size > 0) {
                this._sizeTimelineButtons(); // Set button widths based on animation duration
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
                // console.log(`[${this.canvas.id}] ${this.modelPath}: ${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`);
            }
        },
        (error) => console.error(`Error loading model from ${this.modelPath}:`, error));
    }

    _sizeTimelineButtons() {
        if (this.animations.size === 0 || !this.timelineContainer) return;

        const firstAction = this.animations.values().next().value;
        const totalDuration = firstAction.getClip().duration;
        const FPS = 24;

        // Define the start times (in seconds) for each state
        const stateStartTimes = {
            approach: 0,
            landed: 100 / FPS,
            takeoff: 280 / FPS,
            airborne: 360 / FPS,
        };

        // Calculate durations and apply flex-grow
        const states = ['approach', 'landed', 'takeoff', 'airborne'];
        for (let i = 0; i < states.length; i++) {
            const currentState = states[i];
            const nextState = states[i + 1];

            const startTime = stateStartTimes[currentState];
            const endTime = nextState ? stateStartTimes[nextState] : totalDuration;
            const duration = endTime - startTime;

            const button = this.timelineContainer.querySelector(`[data-state="${currentState}"]`);
            if (button) button.style.flexGrow = duration;
        }
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
        // The third parameter `false` prevents setSize from updating the canvas's CSS style,
        // which is crucial for allowing our CSS rules (like for fullscreen) to take precedence.
        // It ensures the renderer's resolution matches the element's display size.
        this.renderer.setSize(width, height, false);
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
            this.animations.forEach(action => action.paused = true);
            this.playButton.textContent = 'Play';
        } else {
            this.animations.forEach(action => {
                action.paused = false; // Explicitly un-pause
                action.play();
            });
            this.playButton.textContent = 'Pause';
        }
    }

    resetView() {
        if (!this.controls) return;

        // Ensure we are back on the default perspective camera
        if (this.camera !== this.perspectiveCamera) {
            this.camera = this.perspectiveCamera;
            this.controls.object = this.camera;
            this.cameraButton?.classList.remove('ortho-active');
        }

        // Reset camera position and zoom to its saved initial state
        this.controls.reset();

        // Reset all animations to the beginning and update the button text.
        this.animations.forEach(action => {
            action.stop(); // Ensure the animation is stopped
            action.time = 0; // Reset its time to the beginning
            action.paused = true; // Explicitly pause it
        });
        this.playButton.textContent = 'Play';
    }

    updateTimelineUI() {
        if (this.animations.size === 0 || !this.timelineContainer) return;

        // Get the first animation action to read the time from.
        // This assumes all animations are synced and have the same duration.
        const firstAction = this.animations.values().next().value;

        // --- State Update ---
        const FPS = 24;
        const currentTime = firstAction.time;
        let activeState = null;

        if (currentTime >= 0 && currentTime < 100 / FPS) {
            activeState = 'approach';
        } else if (currentTime >= 100 / FPS && currentTime < 280 / FPS) {
            activeState = 'landed';
        } else if (currentTime >= 280 / FPS && currentTime < 360 / FPS) {
            activeState = 'takeoff';
        } else {
            activeState = 'airborne';
        }

        // --- Progress Bar Update ---
        const progressIndicator = this.timelineContainer.querySelector('.timeline-progress');
        const totalDuration = firstAction.getClip().duration;
        const progress = (currentTime / totalDuration) * 100;
        progressIndicator.style.width = `${progress}%`;

        // --- State Update (only if changed) ---
        if (this.timelineContainer.dataset.currentState !== activeState) {
            this.timelineContainer.dataset.currentState = activeState;

            // Update button styles
            this.timelineContainer.querySelectorAll('.timeline-step').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.state === activeState);
            });
        }
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
                time = 360 / FPS;
                break;
            default:
                return;
        }

        // Set the time for all animations
        this.animations.forEach(action => {
            action.time = time;
            action.paused = false; // Ensure it's not paused
            action.play();         // And play it
        });

        // Update the main play/pause button to reflect the new state
        this.playButton.textContent = 'Pause';
    }

    toggleGrid() {
        if (!this.gridHelper) return;
        this.gridHelper.visible = !this.gridHelper.visible;
        this.gridButton?.classList.toggle('active', this.gridHelper.visible);
    }

    toggleCameraProjection() {
        if (!this.camera || !this.controls) return;

        let isOrtho = false;
        if (this.camera.isPerspectiveCamera) {
            this.camera = this.orthographicCamera;
            isOrtho = true;
        } else {
            this.camera = this.perspectiveCamera;
        }

        // Update OrbitControls to use the new camera
        this.controls.object = this.camera;
        this.onResize(); // Apply correct aspect ratio/frustum

        // Toggle a class on the button to show the correct icon
        this.cameraButton?.classList.toggle('ortho-active', isOrtho);
    }

    toggleFullscreen() {
        const container = this.canvas.closest('.animation-container');
        if (!container) {
            console.error('Could not find animation container for fullscreen toggle.');
            return;
        }

        if (!document.fullscreenElement) {
            // Enter fullscreen
            container.requestFullscreen().catch(err => {
                alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            // Exit fullscreen
            document.exitFullscreen();
        }
    }
}

export function init3DScenes() {
    // Check if the containers exist before initializing
    if (document.getElementById('diorama-3d-canvas')) {
        new ThreeScene('diorama-3d-canvas', 'models/airport_diorama.glb');
    }
}
