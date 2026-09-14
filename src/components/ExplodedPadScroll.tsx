'use client';

import { useEffect, useRef } from 'react';
import './ExplodedPadScroll.css';

type Layer = { src: string; className: string; alt: string };

const layers: Layer[] = [
  { src: '/assets/pad-explode/top.webp', className: 'pad-layer pad-layer--top', alt: 'Soft top sheet' },
  { src: '/assets/pad-explode/absorbent.webp', className: 'pad-layer pad-layer--absorbent', alt: 'Absorbent layer' },
  { src: '/assets/pad-explode/core.webp', className: 'pad-layer pad-layer--core', alt: 'Absorbent core' },
  { src: '/assets/pad-explode/back.webp', className: 'pad-layer pad-layer--back', alt: 'Breathable back layer' },
];

export default function ExplodedPadScroll() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const range = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / range));
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      stage.style.setProperty('--explode', eased.toFixed(4));
      stage.style.setProperty('--rotate', `${(progress - 0.5) * 3}deg`);
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={sectionRef} className="exploded-pad-scroll" aria-label="Inside every Femi9 pad">
      <div className="exploded-pad-scroll__sticky">
        <div ref={stageRef} className="exploded-pad-scroll__stage">
          <div className="exploded-pad-scroll__copy">
            <span>INSIDE EVERY PAD</span>
            <h2>Thoughtfully<br />Layered<br />For You</h2>
            <p>Every layer works together to keep you dry, comfortable and confident — all day long.</p>
          </div>
          <div className="exploded-pad-scroll__product" aria-hidden="true">
            {layers.map((layer) => <img key={layer.className} className={layer.className} src={layer.src} alt="" draggable={false} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
