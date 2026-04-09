import * as THREE from 'three';
import gsap from 'gsap';
import { getWorld } from '../World.js';

/* ─────────────────────────────────────────────────────────────────────
   Configuration
───────────────────────────────────────────────────────────────────── */
const TOTAL = 24;
const POOL  = 7;
const PLACEHOLDER_CARD = `${import.meta.env.BASE_URL || '/'}placeholders/gallery-card.svg`;

/** Clear gap between photo *edges* (fraction of card height) — editorial rhythm */
const EDGE_GAP_FRAC = 0.055;

/** Idle auto-pan (world units / sec, same sign as wheel «next»). ~0 = off. */
const AUTO_SCROLL_WORLD_PER_SEC = 0.1;

/** After drag / wheel, pause auto-pan so it doesn’t fight the user */
const AUTO_PAUSE_AFTER_USER_MS = 2800;

/* ─────────────────────────────────────────────────────────────────────
   GLSL — Vertex
───────────────────────────────────────────────────────────────────── */
const VERT = /* glsl */`
    uniform float uVelocity;
    varying vec2  vUv;

    #define PI 3.14159265

    void main() {
        vUv = uv;
        vec3 pos = position;

        float curveZ = sin(uv.x * PI) * uVelocity * 0.8;
        float curveY = sin(uv.y * PI) * uVelocity * 0.12;
        pos.z += curveZ;
        pos.y += curveY;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

/* ─────────────────────────────────────────────────────────────────────
   GLSL — Fragment
───────────────────────────────────────────────────────────────────── */
const FRAG = /* glsl */`
    uniform sampler2D uTexture;
    uniform float     uOpacity;
    uniform float     uAspect;
    uniform float     uVelocity;
    uniform float     uHover;
    uniform float     uTime;
    varying vec2      vUv;

    float filmGrainHash(vec2 p) {
        vec2 f = fract(p * vec2(123.34, 345.45));
        f += dot(f, f.yx + 19.19);
        return fract(f.x * f.y);
    }

    void main() {
        // 1. Dynamic UV zoom based on scroll speed
        float speed = abs(uVelocity);
        vec2 uv = (vUv - 0.5) * (1.0 - speed * 0.035) + 0.5;

        // 1b. Subtle “lift” on hover: slight pinching + brightening, less vignette
        float hLift = clamp(uHover, 0.0, 1.0);
        uv = (uv - 0.5) * (1.0 - hLift * 0.028) + 0.5;

        // 2. Chromatic aberration (RGB split) tied to velocity direction
        float shift = uVelocity * 0.012;
        float r = texture2D(uTexture, vec2(uv.x + shift, uv.y)).r;
        float g = texture2D(uTexture, uv).g;
        float b = texture2D(uTexture, vec2(uv.x - shift, uv.y)).b;
        vec3 col = vec3(r, g, b);

        // 3. Rounded corners (use original vUv so the mask boundary stays rigid)
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        float rad = 0.04;
        vec2 q = abs(p) - vec2(uAspect * 0.5 - rad, 0.5 - rad);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
        float roundMask = 1.0 - smoothstep(-0.008, 0.008, d);

        // 4. Vignette (ease off slightly when hovered)
        float vig = 1.0 - dot(vUv - 0.5, (vUv - 0.5) * 2.2);
        vig = clamp(vig, 0.0, 1.0);
        float vigMix = 0.22 * (1.0 - hLift * 0.62);
        col *= mix(1.0, vig, vigMix);
        col *= 1.0 + hLift * 0.065;

        // 5. Cinematic film grain (in-shader, ~4% — no post stack)
        vec2 grainUv = (vUv + vec2(mod(uTime * 0.07, 1.0), mod(uTime * 0.11, 1.0))) * 1400.0;
        float gn = filmGrainHash(grainUv) - 0.5;
        col += gn * 0.08;

        gl_FragColor = vec4(col, roundMask * uOpacity);
    }
`;

const _FALLBACK = (() => {
    const t = new THREE.DataTexture(new Uint8Array([230, 226, 214, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
})();

function _makeMat() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTexture:  { value: _FALLBACK },
            uVelocity: { value: 0 },
            uOpacity:  { value: 0 },
            uAspect:   { value: 2 / 3 },
            uHover:    { value: 0 },
            uTime:     { value: 0 },
        },
        vertexShader:   VERT,
        fragmentShader: FRAG,
        transparent:    true,
        depthWrite:     false,
    });
}

/* ═════════════════════════════════════════════════════════════════════
   GalleryRibbon — Infinite Object-Pool WebGL Carousel

   • Spacing: uniform *edge* gap G between photos; centre step varies as
     w_i/2 + G + w_{i+1}/2 (w = itemH × aspect). No single global stride.
   • Aspects from build-time gallery-manifest.json (no 24× Image probes); GL reflow if decode differs.
   • Optional slow auto-pan when idle; pauses on interaction + tab hidden.
═════════════════════════════════════════════════════════════════════ */
export default class GalleryRibbon {

    constructor() {
        this._w = getWorld();
        if (!this._w) throw new Error('GalleryRibbon: World not ready');

        this._geo = new THREE.PlaneGeometry(1, 1.5, 32, 32);

        this._texCache   = new Map();
        this._texPending = new Set();
        this._ratioByIdx = new Map();

        this._defaultRatio = 2 / 3;

        this.scrollTarget  = 0;
        this.scrollCurrent = 0;
        this._prevScroll   = 0;
        this._velocity     = 0;
        this._rawVel       = 0;
        this._momentum     = 0;

        this._dragging    = false;
        this._dragLastX   = 0;
        this._dragVel     = 0;
        this._isTouchDrag = false;

        this._itemH  = 1.5;
        this._velNorm = 1;

        this._autoPausedUntil = 0;
        this._lastAutoTs      = 0;

        this._counterEl        = document.getElementById('gallery-counter');
        this._overlayEl        = document.getElementById('gallery-overlay');
        this._lastCounterVal   = -1;
        this._counterThrottle  = 0;
        this._capturePointerId = null;

        this.container = new THREE.Group();
        this.container.visible = false;
        this._meshes = [];
        /** @type {THREE.Object3D | null} */
        this._lastHoverMesh = null;
        /** Defer mesh + ShaderMaterial creation until first `open()` to avoid main-thread shader compile during boot. */
        this._gpuInited = false;
        this._w.scene.add(this.container);

        this._downBound   = (e) => this._onPointerDown(e);
        this._moveBound   = (e) => this._onPointerMove(e);
        this._upBound     = (e) => this._onPointerUp(e);
        this._cancelBound = (e) => this._onPointerCancel(e);
        this._wheelBound  = (e) => this._onWheel(e);

        this._visBound = () => {
            if (!document.hidden) this._lastAutoTs = performance.now();
        };

        window.addEventListener('pointerdown',   this._downBound);
        window.addEventListener('pointermove',   this._moveBound);
        window.addEventListener('pointerup',     this._upBound);
        window.addEventListener('pointercancel', this._cancelBound);
        window.addEventListener('wheel',         this._wheelBound, { passive: true });
        document.addEventListener('visibilitychange', this._visBound);

        this._manifestPromise = this._loadGalleryManifest();
    }

    /** Build ribbon pool and compile gallery shaders — call from `open()` only. */
    initGpu() {
        if (this._gpuInited) return;
        this._gpuInited = true;
        this._buildPool();
    }

    async _loadGalleryManifest() {
        try {
            const res = await fetch('/gallery-manifest.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            for (let i = 0; i < TOTAL; i++) {
                const r = data[i];
                if (typeof r === 'number' && r > 0) this._ratioByIdx.set(i, r);
            }
        } catch (e) {
            console.warn('GalleryRibbon: gallery-manifest.json — using defaults until textures decode', e);
        }
    }

    _suppressAutoPan() {
        this._autoPausedUntil = performance.now() + AUTO_PAUSE_AFTER_USER_MS;
    }

    _buildPool() {
        this._computeLayout();
        for (let i = 0; i < POOL; i++) {
            const mesh = new THREE.Mesh(this._geo, _makeMat());
            mesh.userData.imgIdx = i % TOTAL;
            mesh.position.z = 0;
            this.container.add(mesh);
            this._meshes.push(mesh);
        }
        this._setPoolOffsetsFromChain(0);
        for (const m of this._meshes) this._applyScale(m);
    }

    _edgeGapWorld() {
        return this._itemH * EDGE_GAP_FRAC;
    }

    _ratioAt(idx) {
        idx = ((idx % TOTAL) + TOTAL) % TOTAL;
        return this._ratioByIdx.get(idx) ?? this._defaultRatio;
    }

    _cardWorldW(idx) {
        return this._itemH * this._ratioAt(idx);
    }

    /** World distance from centre of slide i to centre of slide i+1 (mod TOTAL). */
    _centerStep(i) {
        i = ((i % TOTAL) + TOTAL) % TOTAL;
        const j = (i + 1) % TOTAL;
        return this._cardWorldW(i) * 0.5 + this._edgeGapWorld() + this._cardWorldW(j) * 0.5;
    }

    _loopLength() {
        let L = 0;
        for (let i = 0; i < TOTAL; i++) L += this._centerStep(i);
        return L;
    }

    _maxRatioInSet() {
        let m = this._defaultRatio;
        for (let i = 0; i < TOTAL; i++) {
            const r = this._ratioAt(i);
            if (r > m) m = r;
        }
        return m;
    }

    _forwardPoolFrom(i) {
        let s   = 0;
        let idx = ((i % TOTAL) + TOTAL) % TOTAL;
        for (let k = 0; k < POOL; k++) {
            s += this._centerStep(idx);
            idx = (idx + 1) % TOTAL;
        }
        return s;
    }

    _backwardPoolFrom(i) {
        let s   = 0;
        let idx = ((i % TOTAL) + TOTAL) % TOTAL;
        for (let k = 0; k < POOL; k++) {
            const prev = (idx - 1 + TOTAL) % TOTAL;
            s += this._centerStep(prev);
            idx = prev;
        }
        return s;
    }

    _recomputeLayoutMetrics() {
        this._velNorm = Math.max(0.001, this._loopLength() / TOTAL);
    }

    /** Pool slot k shows image (firstIdx + k) mod TOTAL; centres streak, middle at 0. */
    _setPoolOffsetsFromChain(firstIdx) {
        firstIdx = ((firstIdx % TOTAL) + TOTAL) % TOTAL;
        const centers = [0];
        for (let k = 1; k < POOL; k++) {
            const prevImg = (firstIdx + k - 1) % TOTAL;
            centers[k] = centers[k - 1] + this._centerStep(prevImg);
        }
        const mid   = Math.floor(POOL / 2);
        const midC = centers[mid];
        for (let k = 0; k < POOL; k++) {
            this._meshes[k].userData.imgIdx = (firstIdx + k) % TOTAL;
            this._meshes[k].userData.offset = centers[k] - midC;
        }
    }

    _halfBoundDynamic() {
        const offs = this._meshes.map((m) => m.userData.offset);
        const spread = Math.max(...offs) - Math.min(...offs);
        return spread * 0.5 + 0.5 * this._itemH * this._maxRatioInSet() + this._edgeGapWorld() +
            this._itemH * 0.1;
    }

    /**
     * After a ratio refines, rebuild offsets from left→right order; keep anchor world-X.
     */
    _reflowPreserveAnchor() {
        const scroll = this.scrollCurrent;
        const anchor = this._nearestCenterMesh();
        const worldA = scroll + anchor.userData.offset;

        const sorted = [...this._meshes].sort((a, b) => a.userData.offset - b.userData.offset);
        const idxs   = sorted.map((m) => m.userData.imgIdx);

        const p = [0];
        for (let k = 1; k < POOL; k++) p[k] = p[k - 1] + this._centerStep(idxs[k - 1]);

        const ia = sorted.indexOf(anchor);
        for (let k = 0; k < POOL; k++) {
            sorted[k].userData.offset = p[k] - p[ia] + worldA - scroll;
        }
        this._prevScroll = this.scrollCurrent;
        this._velocity   = 0;
    }

    _nearestCenterMesh() {
        let best = this._meshes[0], bestDist = Infinity;
        for (const m of this._meshes) {
            const d = Math.abs(this.scrollCurrent + m.userData.offset);
            if (d < bestDist) { bestDist = d; best = m; }
        }
        return best;
    }

    async _ensureRatiosForAllSlides() {
        await this._manifestPromise;
        for (let i = 0; i < TOTAL; i++) {
            if (!this._ratioByIdx.has(i)) this._ratioByIdx.set(i, this._defaultRatio);
        }
    }

    _computeLayout() {
        const cam    = this._w.camera.instance;
        const camZ   = Math.max(0.5, cam.position.z);
        const vFOV   = THREE.MathUtils.degToRad(cam.fov);
        const worldH = 2 * camZ * Math.tan(vFOV * 0.5);
        this._itemH  = worldH * 0.80;
        this._recomputeLayoutMetrics();
    }

    _applyScale(mesh) {
        const idx   = mesh.userData.imgIdx;
        const ratio = this._ratioAt(idx);
        mesh.scale.set(this._itemH * ratio, this._itemH / 1.5, 1);
        mesh.material.uniforms.uAspect.value = ratio;
    }

    _applyTexture(mesh, idx) {
        idx = ((idx % TOTAL) + TOTAL) % TOTAL;

        if (this._texCache.has(idx)) {
            mesh.material.uniforms.uTexture.value = this._texCache.get(idx);
            this._applyScale(mesh);
            return;
        }

        mesh.material.uniforms.uTexture.value = _FALLBACK;
        if (this._texPending.has(idx)) return;
        this._texPending.add(idx);

        new THREE.TextureLoader().load(
            PLACEHOLDER_CARD,
            (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                const img = tex.image;
                const ratio = img?.width && img?.height
                    ? img.width / img.height
                    : this._defaultRatio;

                const had = this._ratioByIdx.get(idx);
                this._ratioByIdx.set(idx, ratio);
                this._texCache.set(idx, tex);
                this._texPending.delete(idx);

                if (this.container.visible && had != null &&
                    Math.abs(had - ratio) > 1e-4) {
                    this._recomputeLayoutMetrics();
                    this._reflowPreserveAnchor();
                }

                for (const m of this._meshes) {
                    if (m.userData.imgIdx === idx) {
                        m.material.uniforms.uTexture.value = tex;
                        this._applyScale(m);
                    }
                }
            },
            undefined,
            () => { this._texPending.delete(idx); },
        );
    }

    async open() {
        this.initGpu();
        await this._ensureRatiosForAllSlides();
        this._computeLayout();
        this._resetState();
        this.container.visible = true;
        this._lastAutoTs       = performance.now();
        this._autoPausedUntil  = performance.now() + 2200;

        for (const m of this._meshes) {
            this._applyTexture(m, m.userData.imgIdx);
        }

        const entryOrder = [3, 2, 4, 1, 5, 0, 6];
        const rotSpread = 0.11;
        entryOrder.forEach((poolIdx, staggerI) => {
            const m     = this._meshes[poolIdx];
            const delay = staggerI * 0.05;
            const t     = (staggerI / Math.max(1, entryOrder.length - 1)) * 2 - 1;

            m.position.y = -this._itemH * 0.65;
            m.rotation.z = t * rotSpread;

            gsap.to(m.position, {
                y:        0,
                duration: 1.3,
                delay,
                ease:     'expo.out',
            });
            gsap.to(m.rotation, {
                z:        0,
                duration: 1.25,
                delay,
                ease:     'expo.out',
            });
            gsap.to(m.material.uniforms.uOpacity, {
                value:    1,
                duration: 0.9,
                delay,
                ease:     'power2.out',
            });
        });
    }

    close(onComplete) {
        this._dragging = false;
        this._momentum = 0;
        this._releasePointerCaptureIfAny();
        this._autoPausedUntil = 0;

        const exitOrder = [0, 6, 1, 5, 2, 4, 3];
        const tl = gsap.timeline({
            onComplete: () => {
                this.container.visible = false;
                this._lastHoverMesh = null;
                for (const m of this._meshes) {
                    m.position.y = 0;
                    m.rotation.z = 0;
                    gsap.killTweensOf(m.material.uniforms.uHover);
                    m.material.uniforms.uHover.value = 0;
                }
                onComplete?.();
            },
        });

        exitOrder.forEach((poolIdx, staggerI) => {
            const m = this._meshes[poolIdx];
            const t = staggerI * 0.04;
            tl.to(m.position,
                { y: -this._itemH * 0.45, duration: 0.5, ease: 'power2.in' },
                t,
            );
            tl.to(m.material.uniforms.uOpacity,
                { value: 0, duration: 0.38, ease: 'power2.in' },
                t,
            );
        });
    }

    resize() {
        if (!this._gpuInited) return;
        if (!this.container.visible) return;
        const prevH = this._itemH;
        this._computeLayout();
        const sc = prevH > 1e-6 ? this._itemH / prevH : 1;
        if (Math.abs(sc - 1) > 1e-6) {
            this.scrollCurrent *= sc;
            this.scrollTarget  *= sc;
            for (const m of this._meshes) m.userData.offset *= sc;
            this._prevScroll = this.scrollCurrent;
        }
        this._recomputeLayoutMetrics();
        for (const m of this._meshes) this._applyScale(m);
    }

    update() {
        if (!this.container.visible) return;

        const now = performance.now();
        let frameDt = this._lastAutoTs > 0 ? (now - this._lastAutoTs) / 1000 : 0;
        this._lastAutoTs = now;
        if (frameDt > 0.08) frameDt = 0.08;

        if (!this._dragging) {
            this._momentum    *= 0.91;
            this.scrollTarget += this._momentum;
        }

        if (AUTO_SCROLL_WORLD_PER_SEC !== 0 &&
            !this._dragging &&
            !document.hidden &&
            now >= this._autoPausedUntil &&
            Math.abs(this._momentum) < 0.015) {
            this.scrollTarget -= AUTO_SCROLL_WORLD_PER_SEC * frameDt;
        }

        const lerpF = this._isTouchDrag ? 0.14 : 0.085;
        this.scrollCurrent += (this.scrollTarget - this.scrollCurrent) * lerpF;

        this._rawVel     = this.scrollCurrent - this._prevScroll;
        this._prevScroll = this.scrollCurrent;
        this._velocity   += (this._rawVel - this._velocity) * 0.18;

        const shaderVel = THREE.MathUtils.clamp(
            this._velocity / this._velNorm,
            -2.0, 2.0,
        );

        const halfBound = this._halfBoundDynamic();

        for (const m of this._meshes) {
            const worldX = this.scrollCurrent + m.userData.offset;

            if (worldX < -halfBound) {
                const i = m.userData.imgIdx;
                m.userData.offset += this._forwardPoolFrom(i);
                m.userData.imgIdx = (i + POOL) % TOTAL;
                this._applyTexture(m, m.userData.imgIdx);
            } else if (worldX > halfBound) {
                const i = m.userData.imgIdx;
                m.userData.offset -= this._backwardPoolFrom(i);
                m.userData.imgIdx = ((i - POOL) % TOTAL + TOTAL) % TOTAL;
                this._applyTexture(m, m.userData.imgIdx);
            }

            m.position.x = this.scrollCurrent + m.userData.offset;
            m.material.uniforms.uVelocity.value = shaderVel;
            m.material.uniforms.uTime.value = now * 0.001;
        }

        if (this._counterEl) {
            this._counterThrottle++;
            if (this._counterThrottle >= 6) {
                this._counterThrottle = 0;
                let bestDist = Infinity, bestIdx = 0;
                for (const m of this._meshes) {
                    const dx = Math.abs(this.scrollCurrent + m.userData.offset);
                    if (dx < bestDist) { bestDist = dx; bestIdx = m.userData.imgIdx; }
                }
                const displayNum = bestIdx + 1;
                if (displayNum !== this._lastCounterVal) {
                    this._lastCounterVal = displayNum;
                    this._counterEl.textContent =
                        String(displayNum).padStart(2, '0') +
                        ' / ' +
                        String(TOTAL).padStart(2, '0');
                }
            }
        }

        if (this._gpuInited && this._meshes.length) {
            this._w.raycaster.setFromCamera(this._w.mouse, this._w.camera.instance);
            const hits = this._w.raycaster.intersectObjects(this._meshes, false);
            const hitObj = hits.length ? hits[0].object : null;

            if (hitObj !== this._lastHoverMesh) {
                this._lastHoverMesh = hitObj;
                for (const m of this._meshes) {
                    const dest = m === hitObj ? 1 : 0;
                    const uH   = m.material.uniforms.uHover;
                    gsap.to(uH, {
                        value:    dest,
                        duration: dest > 0.5 ? 0.22 : 0.38,
                        ease:     'power2.out',
                        overwrite: true,
                    });
                }
            }
        }
    }

    _px2world() {
        const cam    = this._w.camera.instance;
        const camZ   = Math.max(0.5, cam.position.z);
        const vFOV   = THREE.MathUtils.degToRad(cam.fov);
        const worldH = 2 * camZ * Math.tan(vFOV * 0.5);
        return worldH / window.innerHeight;
    }

    _releasePointerCaptureIfAny() {
        if (this._capturePointerId == null || !this._overlayEl) return;
        try {
            this._overlayEl.releasePointerCapture(this._capturePointerId);
        } catch {
            /* noop */
        }
        this._capturePointerId = null;
    }

    _onPointerDown(e) {
        if (!this.container.visible) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target?.closest?.('.gallery-close-btn')) return;

        this._dragging    = true;
        this._dragLastX   = e.clientX;
        this._dragVel     = 0;
        this._momentum    = 0;
        this._isTouchDrag = e.pointerType === 'touch';
        this._suppressAutoPan();

        if (this._overlayEl && (e.pointerType === 'touch' || e.pointerType === 'pen')) {
            try {
                this._overlayEl.setPointerCapture(e.pointerId);
                this._capturePointerId = e.pointerId;
            } catch {
                this._capturePointerId = null;
            }
        }
    }

    _onPointerMove(e) {
        if (!this._dragging || !this.container.visible) return;
        const delta = (e.clientX - this._dragLastX) * this._px2world();
        this.scrollTarget += delta;
        this._dragVel      = this._dragVel * 0.65 + delta * 0.35;
        this._dragLastX    = e.clientX;
    }

    _onPointerUp(e) {
        if (e?.pointerType === 'mouse' && e.button !== 0) return;
        if (e && this._capturePointerId != null && e.pointerId !== this._capturePointerId)
            return;
        this._endDragInteraction();
    }

    _onPointerCancel(e) {
        if (e && this._capturePointerId != null && e.pointerId !== this._capturePointerId)
            return;
        this._endDragInteraction();
    }

    _endDragInteraction() {
        if (!this._dragging) {
            this._releasePointerCaptureIfAny();
            return;
        }
        this._dragging = false;
        this._releasePointerCaptureIfAny();
        this._momentum = this._dragVel * 9;
    }

    _onWheel(e) {
        if (!this.container.visible) return;
        this._suppressAutoPan();
        this._momentum = 0;
        const rawDelta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120);
        this.scrollTarget -= rawDelta * this._px2world() * 2.5;
    }

    _resetState() {
        this.scrollTarget     = 0;
        this.scrollCurrent    = 0;
        this._prevScroll      = 0;
        this._velocity        = 0;
        this._rawVel          = 0;
        this._momentum        = 0;
        this._dragVel         = 0;
        this._dragging        = false;
        this._lastCounterVal  = -1;
        this._counterThrottle = 0;

        this._recomputeLayoutMetrics();
        this._setPoolOffsetsFromChain(0);
        this._lastHoverMesh = null;

        for (const m of this._meshes) {
            m.position.y                        = 0;
            m.rotation.z                         = 0;
            m.material.uniforms.uOpacity.value  = 0;
            m.material.uniforms.uVelocity.value = 0;
            m.material.uniforms.uAspect.value   = this._defaultRatio;
            m.material.uniforms.uTexture.value  = _FALLBACK;
            m.material.uniforms.uHover.value    = 0;
            m.material.uniforms.uTime.value     = 0;
            gsap.killTweensOf(m.material.uniforms.uHover);
            this._applyScale(m);
        }
    }

    destroy() {
        this._releasePointerCaptureIfAny();
        window.removeEventListener('pointerdown',   this._downBound);
        window.removeEventListener('pointermove',   this._moveBound);
        window.removeEventListener('pointerup',     this._upBound);
        window.removeEventListener('pointercancel', this._cancelBound);
        window.removeEventListener('wheel',         this._wheelBound);
        document.removeEventListener('visibilitychange', this._visBound);

        this._w.scene.remove(this.container);
        this._geo.dispose();
        for (const m of this._meshes) {
            gsap.killTweensOf(m.material?.uniforms?.uHover);
            m.material?.dispose();
        }
        for (const [, tex] of this._texCache) {
            tex?.dispose?.();
        }

        this._texCache.clear();
        this._ratioByIdx.clear();
        this._meshes = [];
    }
}
