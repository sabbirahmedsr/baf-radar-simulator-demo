/**
 * Module: three-viewer.js
 *
 * This module provides a generic, reusable Three.js scene viewer. It can be
 * configured to load any GLB model and can optionally handle animations and
 * various UI controls. This is the core component for all 3D visualizations.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class ThreeDViewer {
    /**
     * @param {object} config - The configuration object for the viewer.
     * @param {string} config.canvasId - The ID of the canvas element.
     * @param {string} config.modelPath - The path to the .glb model file.
     * @param {object} [config.controls] - Optional IDs for UI control buttons.
     * @param {string} [config.controls.play] - ID for the play/pause button.
     * @param {string} [config.controls.reset] - ID for the reset button.
     * @param {string} [config.controls.maximize] - ID for the fullscreen button.
     * @param {string} [config.controls.grid] - ID for the grid toggle button.
     * @param {string} [config.controls.camera] - ID for the camera projection button.
     * @param {object} [config.animation] - Optional configuration for animations.
     * @param {string} [config.animation.timeline] - ID for the timeline container.
     * @param {object} [config.animation.states] - Key-value pairs of state names and frame numbers.
     * @param {number} [config.groundLevel=-0.7] - The Y-position of the ground plane.
     */
    constructor(config) {
        this.config = config;
        this.canvas = document.getElementById(config.canvasId);

        if (!this.canvas) {
            console.error(`[ThreeDViewer] Canvas with id ${config.canvasId} not found.`);
            return;
        }

        this.animations = new Map();
        this.isPlaying = false;

        // Use ResizeObserver to reliably initialize when the canvas is visible and has a size.
        this.resizeObserver = new ResizeObserver(entries => {
            if (entries.length > 0 && entries[0].contentRect.width > 0) {
                this.loadModel();
                this.resizeObserver.disconnect();
            }
        });
        this.resizeObserver.observe(this.canvas);
    }

    init() {
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color().setHSL(0.6, 0, 1);
        this.scene.fog = new THREE.Fog(this.scene.background, 1, 5000);

        // --- Camera ---
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.perspectiveCamera = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
        this.perspectiveCamera.position.set(0, 3, 7);

        const frustumSize = 5;
        this.orthographicCamera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2, frustumSize * aspect / 2,
            frustumSize / 2, frustumSize / -2, 0.1, 1000
        );
        this.orthographicCamera.position.set(0, 3, 7);
        this.camera = this.perspectiveCamera;

        // --- Renderer ---
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;

        // --- Lighting ---
        this.createLighting();

        // --- Sky and Ground ---
        this.createSkyAndGround();

        // --- Grid Helper ---
        const gridColor = new THREE.Color().setHSL(0.095, 1, 0.65);
        this.gridHelper = new THREE.GridHelper(50, 50, gridColor, gridColor);
        this.scene.add(this.gridHelper);
        this.gridHelper.visible = false;

        // --- Orbit Controls ---
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
        this.controls.zoomSpeed = 2.0;
        this.controls.target.set(0, 0.5, 0);
        this.controls.saveState();

        // --- Event Listeners ---
        this.setupEventListeners();
    }

    createLighting() {
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
    }

    createSkyAndGround() {
        const groundGeo = new THREE.PlaneGeometry(10000, 10000);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        groundMat.color.setHSL(0.095, 1, 0.75);
        const ground = new THREE.Mesh(groundGeo, groundMat);        
        ground.position.y = this.config.groundLevel ?? -0.7;
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        const skyGeo = new THREE.SphereGeometry(4000, 32, 15);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                'topColor': { value: new THREE.Color(0x0077ff).setHSL(0.6, 1, 0.6) },
                'bottomColor': { value: new THREE.Color(0xffffff).setHSL(0.095, 1, 0.75) },                
                'offset': { value: Math.abs(ground.position.y) },
                'exponent': { value: 0.6 }
            },
            vertexShader: `varying vec3 vWorldPosition; void main() { vec4 worldPosition = modelMatrix * vec4( position, 1.0 ); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
            fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWorldPosition; void main() { float h = normalize( vWorldPosition + offset ).y; gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 ); }`,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.load(this.config.modelPath, (gltf) => {
            this.model = gltf.scene;
            this.init();
            this.scene.add(this.model);

            this.model.traverse(child => {
                if (child.isMesh) child.castShadow = true;
            });

            if (gltf.animations && gltf.animations.length > 0 && this.config.animation) {
                this.mixer = new THREE.AnimationMixer(this.model);
                gltf.animations.forEach(clip => {
                    const action = this.mixer.clipAction(clip);
                    action.setLoop(THREE.LoopRepeat);
                    this.animations.set(clip.name, action);
                });
                this.setupAnimationControls();
            }

            this.animate();
        }, undefined, (error) => console.error(`[ThreeDViewer] Error loading model:`, error));
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onResize());

        const { controls: ctrlIds } = this.config;
        if (!ctrlIds) return;

        const get = (id) => id ? document.getElementById(id) : null;

        get(ctrlIds.play)?.addEventListener('click', () => this.toggleAnimation());
        get(ctrlIds.maximize)?.addEventListener('click', () => this.toggleFullscreen());
        get(ctrlIds.reset)?.addEventListener('click', () => this.resetView());
        get(ctrlIds.grid)?.addEventListener('click', () => this.toggleGrid());
        get(ctrlIds.camera)?.addEventListener('click', () => this.toggleCameraProjection());

        document.addEventListener('fullscreenchange', () => {
            const container = this.canvas.closest('.animation-container');
            if (!container) return;
            const isFullscreen = document.fullscreenElement === container;
            container.classList.toggle('fullscreen', isFullscreen);
            requestAnimationFrame(() => this.onResize());
        });
    }

    onResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        const aspect = width / height;

        if (this.camera.isPerspectiveCamera) {
            this.camera.aspect = aspect;
        } else if (this.camera.isOrthographicCamera) {
            const frustumHeight = this.camera.top - this.camera.bottom;
            const frustumWidth = frustumHeight * aspect;
            this.camera.left = -frustumWidth / 2;
            this.camera.right = frustumWidth / 2;
        }

        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.mixer) {
            this.mixer.update(this.clock.getDelta());
            this.updateTimelineUI();
        }
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    resetView() {
        if (!this.controls) return;
        if (this.camera !== this.perspectiveCamera) this.toggleCameraProjection();
        this.controls.reset();
        if (this.mixer) {
            this.animations.forEach(action => {
                action.stop();
                action.time = 0;
                action.paused = true;
            });
            this.isPlaying = false;
            const playBtn = document.getElementById(this.config.controls?.play);
            if (playBtn) playBtn.textContent = 'Play';
            this.updateTimelineUI();
        }
    }

    toggleGrid() {
        if (!this.gridHelper) return;
        this.gridHelper.visible = !this.gridHelper.visible;
        document.getElementById(this.config.controls?.grid)?.classList.toggle('active', this.gridHelper.visible);
    }

    toggleCameraProjection() {
        if (!this.camera || !this.controls) return;
        const isOrtho = this.camera.isOrthographicCamera;
        this.camera = isOrtho ? this.perspectiveCamera : this.orthographicCamera;
        this.controls.object = this.camera;
        this.onResize();
        document.getElementById(this.config.controls?.camera)?.classList.toggle('ortho-active', !isOrtho);
    }

    toggleFullscreen() {
        const container = this.canvas.closest('.animation-container');
        if (!container) return;
        if (!document.fullscreenElement) {
            container.requestFullscreen().catch(err => alert(`Fullscreen error: ${err.message}`));
        } else {
            document.exitFullscreen();
        }
    }

    // --- Animation Specific Methods ---

    setupAnimationControls() {
        const { timeline: timelineId, states } = this.config.animation;
        const timelineContainer = document.getElementById(timelineId);
        if (!timelineContainer || !states) return;

        // Size timeline buttons based on duration
        const firstAction = this.animations.values().next().value;
        const totalDuration = firstAction.getClip().duration;
        const stateKeys = Object.keys(states);

        for (let i = 0; i < stateKeys.length; i++) {
            const currentStateKey = stateKeys[i];
            const nextStateKey = stateKeys[i + 1];
            const startTime = states[currentStateKey] / 24;
            const endTime = nextStateKey ? states[nextStateKey] / 24 : totalDuration;
            const duration = endTime - startTime;
            const button = timelineContainer.querySelector(`[data-state="${currentStateKey}"]`);
            if (button) button.style.flexGrow = duration;
        }

        // Add timeline click listener
        timelineContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('timeline-step')) {
                this.goToState(e.target.dataset.state);
            }
        });

        this.goToState(stateKeys[0]); // Go to initial state
        this.toggleAnimation(); // Autoplay
    }

    toggleAnimation() {
        if (this.animations.size === 0) return;
        this.isPlaying = !this.isPlaying;
        this.animations.forEach(action => {
            action.paused = !this.isPlaying;
            if (this.isPlaying && !action.isRunning()) action.play();
        });
        const playBtn = document.getElementById(this.config.controls?.play);
        if (playBtn) playBtn.textContent = this.isPlaying ? 'Pause' : 'Play';
    }

    goToState(state) {
        if (!this.config.animation?.states || !this.mixer) return;
        const frame = this.config.animation.states[state];
        if (typeof frame !== 'number') return;

        const time = frame / 24; // Assuming 24 FPS
        this.animations.forEach(action => {
            action.time = time;
            action.paused = false;
            if (!action.isRunning()) action.play();
        });
        this.isPlaying = true;
        const playBtn = document.getElementById(this.config.controls?.play);
        if (playBtn) playBtn.textContent = 'Pause';
    }

    updateTimelineUI() {
        const { timeline: timelineId, states } = this.config.animation;
        const timelineContainer = document.getElementById(timelineId);
        if (!timelineContainer || !this.mixer) return;

        const firstAction = this.animations.values().next().value;
        const currentTime = firstAction.time;
        const totalDuration = firstAction.getClip().duration;

        // Update progress bar
        const progressIndicator = timelineContainer.querySelector('.timeline-progress');
        progressIndicator.style.width = `${(currentTime / totalDuration) * 100}%`;

        // Determine active state
        let activeState = null;
        const stateKeys = Object.keys(states);
        for (let i = stateKeys.length - 1; i >= 0; i--) {
            const stateKey = stateKeys[i];
            if (currentTime >= states[stateKey] / 24) {
                activeState = stateKey;
                break;
            }
        }

        // Update button styles
        if (timelineContainer.dataset.currentState !== activeState) {
            timelineContainer.dataset.currentState = activeState;
            timelineContainer.querySelectorAll('.timeline-step').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.state === activeState);
            });
        }
    }
}