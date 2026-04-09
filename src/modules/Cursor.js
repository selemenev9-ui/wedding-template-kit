import gsap from 'gsap';

const HOVER_SELECTOR =
    'a, button, [role="button"], label[for], .editorial-btn, .route-link, [data-hover], .rsvp-radio-label';

export default class Cursor {
    constructor() {
        this.cursorEl = document.querySelector('#cursor');
        if (!this.cursorEl || !window.matchMedia('(pointer: fine)').matches) return;

        this.isHovering = false;
        this._didSnap = false;

        gsap.set(this.cursorEl, { xPercent: -50, yPercent: -50 });

        this.xTo = gsap.quickTo(this.cursorEl, 'x', {
            duration: 0.1,
            ease: 'power3.out',
        });
        this.yTo = gsap.quickTo(this.cursorEl, 'y', {
            duration: 0.1,
            ease: 'power3.out',
        });

        this.bindEvents();
    }

    bindEvents() {
        window.addEventListener('pointermove', this.onPointerMove, { passive: true });
        document.addEventListener('mouseleave', this.onDocumentLeave);
        document.addEventListener('mouseenter', this.onDocumentEnter);

        document.querySelectorAll(HOVER_SELECTOR).forEach((el) => {
            el.addEventListener('mouseenter', this.onMouseEnter);
            el.addEventListener('mouseleave', this.onMouseLeave);
        });

        document.querySelectorAll('.editorial-btn').forEach((btn) => {
            btn.addEventListener('mousemove', this.onMagneticMove);
            btn.addEventListener('mouseleave', this.onMagneticLeave);
        });
    }

    onDocumentLeave = () => {
        this.cursorEl.classList.add('cursor--hidden');
    };

    onDocumentEnter = () => {
        this.cursorEl.classList.remove('cursor--hidden');
    };

    onPointerMove = (e) => {
        if (!this._didSnap) {
            gsap.set(this.cursorEl, { x: e.clientX, y: e.clientY });
            this._didSnap = true;
            this.cursorEl.classList.remove('cursor--hidden');
        }
        this.xTo(e.clientX);
        this.yTo(e.clientY);
    };

    onMouseEnter = () => {
        this.isHovering = true;
        gsap.to(this.cursorEl, {
            scale: 1.5,
            duration: 0.3,
            ease: 'power2.out',
        });
    };

    onMouseLeave = () => {
        this.isHovering = false;
        gsap.to(this.cursorEl, {
            scale: 1,
            duration: 0.3,
            ease: 'power2.out',
        });
    };

    onMagneticMove = (e) => {
        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const distX = (e.clientX - centerX) * 0.3;
        const distY = (e.clientY - centerY) * 0.3;

        gsap.to(btn, {
            x: distX,
            y: distY,
            duration: 0.4,
            ease: 'power2.out',
        });
    };

    onMagneticLeave = (e) => {
        const btn = e.currentTarget;
        gsap.to(btn, {
            x: 0,
            y: 0,
            duration: 0.7,
            ease: 'elastic.out(1.1, 0.4)',
        });
    };

    destroy() {
        window.removeEventListener('pointermove', this.onPointerMove);
        document.removeEventListener('mouseleave', this.onDocumentLeave);
        document.removeEventListener('mouseenter', this.onDocumentEnter);
        document.querySelectorAll(HOVER_SELECTOR).forEach((el) => {
            el.removeEventListener('mouseenter', this.onMouseEnter);
            el.removeEventListener('mouseleave', this.onMouseLeave);
        });
        document.querySelectorAll('.editorial-btn').forEach((btn) => {
            btn.removeEventListener('mousemove', this.onMagneticMove);
            btn.removeEventListener('mouseleave', this.onMagneticLeave);
        });
    }
}
