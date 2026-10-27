
'use client';

import { useEffect, useRef } from 'react';
import { gsap } from '@/lib/gsap';

export default function ScrollReveal({
  children,
  animation = 'fadeUp',
  duration = 1,
  delay = 0,
  y = 40,
  className = '',
  tag: Tag = 'div',
  ...props
}) {
  const elementRef = useRef(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    // Keep content visible by default. Animate only when safe.
    gsap.set(el, {
      opacity: 1,
      clearProps: 'transform',
    });

    const ctx = gsap.context(() => {
      const fromVars = { opacity: 0 };

      if (animation === 'fadeUp') fromVars.y = y;
      if (animation === 'fadeDown') fromVars.y = -y;

      // Use a normal entrance animation without ScrollTrigger.
      // This avoids content remaining invisible when a trigger fails.
      gsap.fromTo(
        el,
        fromVars,
        {
          opacity: 1,
          y: 0,
          duration,
          delay,
          ease: 'power3.out',
          clearProps: 'opacity,transform',
          immediateRender: false,
        }
      );
    }, elementRef);

    return () => ctx.revert();
  }, [animation, duration, delay, y]);

  return (
    <Tag ref={elementRef} className={className} {...props}>
      {children}
    </Tag>
  );
}
