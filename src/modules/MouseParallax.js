import * as THREE from 'three';
import gsap from 'gsap';

/**
 * Mouse parallax layer. Each tracked object is re-parented into a transparent
 * THREE.Group (wrapper). Parallax offsets live on the wrapper so they never
 * conflict with GSAP ScrollTrigger tweens or animation loops that write to
 * the inner object's own position.
 *
 * @typedef {{ object: THREE.Object3D; depth: number }} ParallaxLayer
 */
export default class MouseParallax {
    /**
     * @param {ParallaxLayer[]} layers
     */
    constructor(layers) {
        this._entries = layers.map(({ object, depth }) => {
            const originalParent = object.parent;

            // Create a transparent wrapper group in the same parent
            const wrapper = new THREE.Group();
            if (originalParent) {
                originalParent.remove(object);
                wrapper.add(object);
                originalParent.add(wrapper);
            }

            // quickTo targets wrapper.position directly
            const qx = gsap.quickTo(wrapper.position, 'x', {
                duration: 1.2,
                ease: 'power3.out',
            });
            const qy = gsap.quickTo(wrapper.position, 'y', {
                duration: 1.2,
                ease: 'power3.out',
            });

            return { wrapper, object, originalParent, depth, qx, qy };
        });

        this._nx = 0;
        this._ny = 0;

        this._onMove = (e) => {
            this._nx =  (e.clientX / window.innerWidth)  * 2 - 1;
            this._ny = -((e.clientY / window.innerHeight) * 2 - 1);

            for (const { qx, qy, depth } of this._entries) {
                qx(this._nx * depth);
                qy(this._ny * depth);
            }
        };

        window.addEventListener('mousemove', this._onMove);
    }

    /**
     * Called every frame inside the main rAF tick.
     * quickTo drives its own GSAP tween; this hook is reserved for any
     * future per-frame supplemental logic.
     */
    update() {
        // GSAP quickTo handles interpolation via its internal ticker.
        // Nothing needs to happen here each frame unless we add velocity
        // or secondary motion later.
    }

    destroy() {
        window.removeEventListener('mousemove', this._onMove);

        // Restore original parenting so the scene stays consistent
        for (const { wrapper, object, originalParent } of this._entries) {
            if (object && originalParent) {
                wrapper.remove(object);
                originalParent.remove(wrapper);
                originalParent.add(object);
            }
        }
    }
}
