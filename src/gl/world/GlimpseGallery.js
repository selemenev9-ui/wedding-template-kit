import * as THREE from 'three';
import { getWorld } from '../World.js';

/* ─────────────────────────────────────────────
   Vertex shader — horizontal Z-bow
   Bends the quad toward/away from camera at
   the horizontal midpoint, driven by scroll velocity.
───────────────────────────────────────────── */
const VERT = /* glsl */ `
    varying vec2 vUv;
    uniform float uScrollVelocity;

    void main() {
        vUv = uv;
        vec3 pos = position;
        // Smooth bow: 0 at edges (uv.x = 0 / 1), max at centre (uv.x = 0.5)
        float bow = sin(uv.x * 3.14159265) * clamp(uScrollVelocity * 0.18, -0.22, 0.22);
        pos.z += bow;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

/* ─────────────────────────────────────────────
   Fragment shader — chromatic aberration + liquid wave
   All effects proportional to |uScrollVelocity|.
───────────────────────────────────────────── */
const FRAG = /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uScrollVelocity;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
        vec2 uv = vUv;
        float vel = uScrollVelocity;
        float absVel = abs(vel);

        // Liquid wave distortion — both axes, counter-phase for organic feel
        float waveMag = absVel * 0.013;
        uv.x += sin(uv.y * 10.0 + uTime * 1.8) * waveMag;
        uv.y += cos(uv.x * 8.0  + uTime * 1.4) * waveMag * 0.5;

        // Chromatic aberration — horizontal RGB split
        float aberr = absVel * 0.016;
        float r = texture2D(tDiffuse, uv + vec2( aberr, 0.0)).r;
        float g = texture2D(tDiffuse, uv                    ).g;
        float b = texture2D(tDiffuse, uv - vec2( aberr, 0.0)).b;

        gl_FragColor = vec4(r, g, b, 1.0);
    }
`;

export default class GlimpseGallery {
    constructor() {
        this._world = getWorld();
        if (!this._world) throw new Error('GlimpseGallery: World not initialised');

        this._meshes    = [];
        this._trackers  = [];
        this._time      = 0;

        // Shared geometry — 24 horizontal segments for smooth Z-bow
        this._geo = new THREE.PlaneGeometry(1, 1, 24, 1);

        this._build();
    }

    _build() {
        const nodes = document.querySelectorAll('.glimpse-tracker');
        nodes.forEach((el) => {
            const src = el.dataset.src;
            if (!src) return;

            const tex = new THREE.TextureLoader().load(src);
            tex.colorSpace = THREE.SRGBColorSpace;

            const mat = new THREE.ShaderMaterial({
                uniforms: {
                    tDiffuse:        { value: tex },
                    uScrollVelocity: { value: 0 },
                    uTime:           { value: 0 },
                },
                vertexShader:   VERT,
                fragmentShader: FRAG,
                transparent:    false,
                depthTest:      true,
                depthWrite:     true,
            });

            const mesh = new THREE.Mesh(this._geo, mat);
            mesh.position.z = 0;
            mesh.visible = false;
            this._world.scene.add(mesh);

            this._meshes.push(mesh);
            this._trackers.push(el);
        });
    }

    /**
     * Call every RAF frame.
     * @param {number} scrollVelocity  — smoothed scroll velocity (px / frame)
     */
    update(scrollVelocity = 0) {
        this._time += 0.016;

        const camera  = this._world.camera.instance;
        const camZ    = camera.position.z;
        const vFOV    = THREE.MathUtils.degToRad(camera.fov);
        // Frustum dimensions at z = 0 plane
        const worldH  = 2 * camZ * Math.tan(vFOV * 0.5);
        const worldW  = worldH * camera.aspect;

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        for (let i = 0; i < this._trackers.length; i++) {
            const rect = this._trackers[i].getBoundingClientRect();
            const mesh = this._meshes[i];

            // Cull when fully off-screen
            if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) {
                mesh.visible = false;
                continue;
            }
            mesh.visible = true;

            // Centre of DOM element in NDC [-1, 1]
            const ndcX =  ((rect.left + rect.right)  / 2 / vw) * 2 - 1;
            const ndcY = -(((rect.top  + rect.bottom) / 2 / vh) * 2 - 1);

            // Map NDC → world position at z = 0
            mesh.position.x = ndcX * worldW * 0.5;
            mesh.position.y = ndcY * worldH * 0.5;

            // Scale to match DOM element pixel dimensions
            mesh.scale.x = (rect.width  / vw) * worldW;
            mesh.scale.y = (rect.height / vh) * worldH;

            // Shader uniforms
            mesh.material.uniforms.uScrollVelocity.value = scrollVelocity;
            mesh.material.uniforms.uTime.value           = this._time;
        }
    }

    destroy() {
        for (const mesh of this._meshes) {
            this._world.scene.remove(mesh);
            const tex = mesh.material.uniforms.tDiffuse?.value;
            if (tex) tex.dispose();
            mesh.material.dispose();
        }
        this._geo.dispose();
        this._meshes   = [];
        this._trackers = [];
    }
}
