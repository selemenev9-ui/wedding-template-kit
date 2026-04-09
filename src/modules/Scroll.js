import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import SplitType from 'split-type';
import { getWorld } from '../gl/World.js';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ limitCallbacks: true });

const LENIS_DEFAULTS = {
    duration: 2.0,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    wheelMultiplier: 0.8,
    smoothWheel: true,
    syncTouch: true,
    touchMultiplier: 1.0,
    autoRaf: false,
};

export default class Scroll {
    constructor(lenisOptions = {}) {
        this.isNativeTouch =
            typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

        if (this.isNativeTouch) {
            // Mobile: keep native browser scroll path for reliable touch + pull-to-refresh.
            // Register a passive scroll listener so ScrollTrigger.update() fires on every
            // native scroll tick — same role that lenis.on('scroll', ...) plays on desktop.
            this._nativeScrollHandler = () => ScrollTrigger.update();
            window.addEventListener('scroll', this._nativeScrollHandler, { passive: true });

            this.lenis = {
                on: () => {},
                off: () => {},
                raf: () => {},
                resize: () => {},
                destroy: () => {
                    if (this._nativeScrollHandler) {
                        window.removeEventListener('scroll', this._nativeScrollHandler);
                    }
                },
                start: () => {
                    document.documentElement.style.overflow = '';
                    document.body.style.overflow = '';
                },
                stop: () => {
                    document.documentElement.style.overflow = 'hidden';
                    document.body.style.overflow = 'hidden';
                },
                scrollTo: (target, opts = {}) => {
                    if (typeof target === 'number') {
                        window.scrollTo({ top: target, behavior: opts.immediate ? 'auto' : 'smooth' });
                        return;
                    }
                    if (target === 0 || target === 'top') {
                        window.scrollTo({ top: 0, behavior: opts.immediate ? 'auto' : 'smooth' });
                    }
                },
            };
            return;
        }

        this.lenis = new Lenis({
            ...LENIS_DEFAULTS,
            ...lenisOptions,
        });
    }

    raf(time) {
        if (!this.isNativeTouch) this.lenis.raf(time);
    }

    resize() {
        if (!this.isNativeTouch) this.lenis.resize();
        ScrollTrigger.refresh();
    }

    destroy() {
        if (!this.isNativeTouch) {
            this.lenis.off('scroll', ScrollTrigger.update);
            this.lenis.destroy();
            return;
        }
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
    }
}

/** Desktop vs portrait: lateral spread and uniform ring scale multipliers. */
const RING_RESP_DESKTOP = { xMul: 1, scaleMul: 1 };
const RING_RESP_MOBILE = { xMul: 0.28, scaleMul: 0.82 };

/** ~32° — ring band faces camera instead of edge-on (thin line). */
const RING_FACE_TILT_X = Math.PI * 0.18;

/** @type {InstanceType<typeof SplitType> | null} */
let pathTextSplit1 = null;
/** @type {InstanceType<typeof SplitType> | null} */
let pathTextSplit2 = null;

/**
 * Dual-ring scroll: one master timeline scrubs rings + camera across the full document;
 * DOM beats use dedicated ScrollTriggers on their sections.
 * @param {{ mesh: import('three').Object3D; groupA: import('three').Object3D; groupB: import('three').Object3D }} glassRing
 */
export function bindGlassRingScrollEffects(glassRing) {
    const ga = glassRing.groupA;
    const gb = glassRing.groupB;
    const st = { invalidateOnRefresh: true };
    const easeSeg = 'power2.inOut';

    const world = getWorld();
    const camPos = world?.camera?.instance?.position;

    /**
     * @param {{ xMul: number; scaleMul: number }} m
     */
    function buildRingChoreography(m) {
        const X = (v) => v * m.xMul;
        const S = (v) => v * m.scaleMul;

        /* ── Absolute position constants for masterTl (total span 0 → 160)
           Act II crossover stretched for path pin (+=1500) + glimpse pin (+=3000) scroll budget ── */
        const A1_DUR = 30;   // Act I:    0   → 30
        const A2_DUR = 95;   // Act II:   30  → 125  (slow crossover during glimpse photo pin)
        const A3_DUR = 20;   // Act III:  125 → 145
        const A4_DUR = 15;   // Act IV:   145 → 160
        const A2_START = 30;
        const A3_START = 125;
        const A4_START = 145;

        const curtainGa = { x: X(-2), y: 0.58, z: 2.4 };
        const curtainGb = { x: X(2), y: -0.48, z: -2.9 };
        const curtainGaScale = { x: S(0.52), y: S(0.52), z: S(0.52) };
        const curtainGbScale = { x: S(0.22), y: S(0.22), z: S(0.22) };
        const curtainGaRot = { x: RING_FACE_TILT_X + 0.12, y: 0.82, z: 0.1 };
        const curtainGbRot = { x: RING_FACE_TILT_X + 0.06, y: -0.76, z: -0.08 };

        const crossGa = { x: X(1.5), y: -1.2, z: 1.0 };
        const crossGb = { x: X(-1.5), y: 1.2, z: -2.0 };
        const crossGaScale = { x: S(0.48), y: S(0.48), z: S(0.48) };
        const crossGbScale = { x: S(0.26), y: S(0.26), z: S(0.26) };
        const crossGaRot = { x: RING_FACE_TILT_X + 0.42, y: -0.38, z: 0.92 };
        const crossGbRot = { x: RING_FACE_TILT_X + 0.36, y: 0.44, z: -0.88 };

        const unityGa = { x: 0, y: 0.15, z: 0.6 };
        const unityGb = { x: 0, y: -0.15, z: -0.6 };
        const unityScale = { x: S(0.55), y: S(0.55), z: S(0.55) };
        const unityGaRot = { x: RING_FACE_TILT_X + 0.2, y: 0.72, z: 0.45 };
        const unityGbRot = { x: RING_FACE_TILT_X + 0.14, y: -0.7, z: -0.42 };

        const persistGa = { x: 0, y: 0, z: 0.6 };
        const persistGb = { x: 0, y: 0, z: -0.6 };
        const persistScale = { x: S(0.65), y: S(0.65), z: S(0.65) };

        gsap.set('.golden-thread', { scaleY: 0, transformOrigin: 'top center' });

        gsap.set('.destination-content, .final-date, .final-tagline', {
            autoAlpha: 0,
            y: 30,
        });
        pathTextSplit1?.revert();
        pathTextSplit2?.revert();
        pathTextSplit1 = new SplitType('.path-text-1', { types: 'chars' });
        pathTextSplit2 = new SplitType('.path-text-2', { types: 'chars' });

        gsap.set('.path-text-1, .path-text-2', {
            autoAlpha: 1,
            xPercent: -50,
            yPercent: -50,
        });
        gsap.set(pathTextSplit1.chars, { opacity: 0, y: 26 });
        gsap.set(pathTextSplit2.chars, { opacity: 0, y: 26 });

        /* ── Path DOM timeline: pinned — 1500px virtual scroll budget ── */
        const pathDomTl = gsap.timeline({
            scrollTrigger: {
                trigger: '#section-path',
                start: 'top top',
                end: '+=1500',
                pin: true,
                scrub: 1.2,
                ...st,
            },
        });

        pathDomTl.to('.golden-thread', { scaleY: 1, ease: 'none', duration: 100 }, 0);

        pathDomTl.to(pathTextSplit1.chars, {
            opacity: 1,
            y: 0,
            ease: 'power2.out',
            stagger: { amount: 10, from: 'start' },
            duration: 15,
        }, 0);
        pathDomTl.to(pathTextSplit1.chars, {
            opacity: 0,
            y: -22,
            ease: 'power2.in',
            stagger: { amount: 6.5, from: 'end' },
            duration: 10,
        }, 35);

        pathDomTl.to(pathTextSplit2.chars, {
            opacity: 1,
            y: 0,
            ease: 'power2.out',
            stagger: { amount: 10, from: 'start' },
            duration: 15,
        }, 50);
        pathDomTl.to(pathTextSplit2.chars, {
            opacity: 0,
            y: -22,
            ease: 'power2.in',
            stagger: { amount: 9, from: 'end' },
            duration: 15,
        }, 85);

        /* ── Glimpse: img crossfade prep + button (btn tween unchanged below) ── */
        gsap.set('.glimpse-img-2, .glimpse-img-3', { opacity: 0 });
        gsap.set('#btn-open-gallery', { autoAlpha: 0 });
        gsap.set('.glimpse-label', { autoAlpha: 1 });

        /* ── Glimpse DOM: pin +=3000px, scrubbed mask + crossfades (0–100) + button ── */
        const glimpseDomTl = gsap.timeline({
            scrollTrigger: {
                trigger: '#section-glimpse',
                start: 'top top',
                end: '+=3000',
                pin: true,
                scrub: 1,
                ...st,
            },
        });

        /* 0–40 — mask → viewport window; label fades with expansion */
        glimpseDomTl.to('.glimpse-expand-mask', {
            width: '100vw',
            height: '100vh',
            borderRadius: '0px',
            duration: 40,
            ease: 'power2.inOut',
        }, 0);
        glimpseDomTl.to('.glimpse-label', {
            autoAlpha: 0,
            y: -12,
            duration: 40,
            ease: 'power2.inOut',
        }, 0);

        /* 40–70 — crossfade 1 */
        glimpseDomTl.to('.glimpse-img-2', {
            opacity: 1,
            duration: 30,
            ease: 'power2.inOut',
        }, 40);

        /* 70–100 — crossfade 2 */
        glimpseDomTl.to('.glimpse-img-3', {
            opacity: 1,
            duration: 30,
            ease: 'power2.inOut',
        }, 70);

        /* #btn-open-gallery — left exactly as before (do not modify) */
        glimpseDomTl.to('#btn-open-gallery', {
            autoAlpha: 1,
            y: -10,
            duration: 15,
        }, '-=10');

        /* masterTl MUST follow pathDomTl + glimpseDomTl so body scrub includes +=1500 and +=3000 pinSpacing */
        const masterTl = gsap.timeline({
            scrollTrigger: {
                trigger: 'body',
                start: 'top top',
                end: 'bottom bottom',
                scrub: 1.5,
                ...st,
            },
        });

        /* Act I — curtain: 0 → 30 */
        masterTl
            .to(ga.position, { ...curtainGa, duration: A1_DUR, ease: 'none' }, 0)
            .to(gb.position, { ...curtainGb, duration: A1_DUR, ease: 'none' }, 0)
            .to(ga.scale, { ...curtainGaScale, duration: A1_DUR, ease: 'none' }, 0)
            .to(gb.scale, { ...curtainGbScale, duration: A1_DUR, ease: 'none' }, 0)
            .to(ga.rotation, { ...curtainGaRot, duration: A1_DUR, ease: 'none' }, 0)
            .to(gb.rotation, { ...curtainGbRot, duration: A1_DUR, ease: 'none' }, 0);

        // 3D hero names: scale out by end of Act I (before Act II crossover / path copy)
        const heroRoot = world?.heroText?.root;
        if (heroRoot) {
            masterTl.to(
                heroRoot.scale,
                {
                    x: 0,
                    y: 0,
                    z: 0,
                    duration: A1_DUR,
                    ease: 'power2.inOut',
                },
                0,
            );
        }

        /* Mobile: DOM hero names scrub out with Act I (WebGL group is hidden). */
        if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px) and (pointer: coarse)').matches) {
            masterTl.fromTo(
                '#hero-names',
                { opacity: 1, y: 0, scale: 1, xPercent: -50, yPercent: -50, x: 0 },
                {
                    opacity: 0,
                    y: 50,
                    scale: 0.9,
                    xPercent: -50,
                    yPercent: -50,
                    x: 0,
                    ease: 'power2.inOut',
                    duration: A1_DUR,
                    immediateRender: false,
                },
                0,
            );
        }

        /* Act II — crossover: 30 → 125 */
        masterTl
            .to(ga.position, { ...crossGa, duration: A2_DUR, ease: 'power1.inOut' }, A2_START)
            .to(gb.position, { ...crossGb, duration: A2_DUR, ease: 'power1.inOut' }, A2_START)
            .to(ga.scale, { ...crossGaScale, duration: A2_DUR, ease: 'power1.inOut' }, A2_START)
            .to(gb.scale, { ...crossGbScale, duration: A2_DUR, ease: 'power1.inOut' }, A2_START)
            .to(ga.rotation, { ...crossGaRot, duration: A2_DUR, ease: 'power1.inOut' }, A2_START)
            .to(gb.rotation, { ...crossGbRot, duration: A2_DUR, ease: 'power1.inOut' }, A2_START);

        /* Act III — unity: 125 → 145 */
        masterTl
            .to(ga.position, { ...unityGa, duration: A3_DUR, ease: 'power2.inOut' }, A3_START)
            .to(gb.position, { ...unityGb, duration: A3_DUR, ease: 'power2.inOut' }, A3_START)
            .to(ga.scale, { ...unityScale, duration: A3_DUR, ease: 'power2.inOut' }, A3_START)
            .to(gb.scale, { ...unityScale, duration: A3_DUR, ease: 'power2.inOut' }, A3_START)
            .to(ga.rotation, { ...unityGaRot, duration: A3_DUR, ease: 'power2.inOut' }, A3_START)
            .to(gb.rotation, { ...unityGbRot, duration: A3_DUR, ease: 'power2.inOut' }, A3_START);

        /* Act IV — persistent Unity backdrop: 145 → 160 */
        masterTl
            .to(ga.position, { ...persistGa, duration: A4_DUR, ease: 'none' }, A4_START)
            .to(gb.position, { ...persistGb, duration: A4_DUR, ease: 'none' }, A4_START)
            .to(ga.scale, { ...persistScale, duration: A4_DUR, ease: 'none' }, A4_START)
            .to(gb.scale, { ...persistScale, duration: A4_DUR, ease: 'none' }, A4_START)
            .to(ga.rotation, { y: '+=1.5', ease: 'none', duration: A4_DUR }, A4_START)
            .to(gb.rotation, { y: '-=1.5', ease: 'none', duration: A4_DUR }, A4_START);

        if (camPos) {
            masterTl
                .to(camPos, { z: 6.5, y: 0.4, duration: A1_DUR, ease: 'none' }, 0)
                .to(camPos, { z: 5, y: 0, duration: A2_DUR, ease: 'power1.inOut' }, A2_START)
                .to(camPos, { z: 4.85, y: 0, duration: A3_DUR, ease: 'power2.inOut' }, A3_START)
                .to(camPos, { z: 4.55, y: 0, duration: A4_DUR, ease: 'none' }, A4_START);
        }

        gsap.to('.destination-content', {
            autoAlpha: 1,
            y: 0,
            ease: 'none',
            scrollTrigger: {
                trigger: '#section-destination',
                start: 'top 75%',
                end: 'center center',
                scrub: true,
                ...st,
            },
        });

        gsap.to(['.final-date', '.final-tagline'], {
            autoAlpha: 1,
            y: 0,
            stagger: 0.15,
            ease: 'none',
            scrollTrigger: {
                trigger: '#section-final',
                start: 'top 60%',
                end: 'bottom 90%',
                scrub: true,
                ...st,
            },
        });

        /* ── Final climax: perpetual slow mesh rotation when section enters ── */
        ScrollTrigger.create({
            trigger: '#section-final',
            start: 'top 70%',
            once: true,
            onEnter: () => {
                // Majestic slow Y-rotation on the parent mesh (safe: masterTl only
                // scrubs groupA / groupB children, never the root mesh rotation)
                gsap.to(glassRing.mesh.rotation, {
                    y: `+=${Math.PI * 2}`,
                    duration: 35,
                    ease: 'none',
                    repeat: -1,
                });
                // Subtle counter-tilt on Z — rings drift into orbital stance
                gsap.to(glassRing.mesh.rotation, {
                    z: Math.PI * 0.08,
                    duration: 4.5,
                    ease: 'power2.inOut',
                });
            },
        });
    }

    const mm = gsap.matchMedia();
    mm.add('(min-width: 768px)', () => {
        buildRingChoreography(RING_RESP_DESKTOP);
    });
    mm.add('(max-width: 767px)', () => {
        buildRingChoreography(RING_RESP_MOBILE);
    });

    const { floatA, floatB } = glassRing;
    if (floatA && floatB) {
        const twoPi = Math.PI * 2;
        gsap.to(floatA.rotation, {
            y: `+=${twoPi}`,
            duration: 52,
            repeat: -1,
            ease: 'none',
        });
        gsap.to(floatB.rotation, {
            y: `-=${twoPi}`,
            duration: 60,
            repeat: -1,
            ease: 'none',
        });
    }
}
