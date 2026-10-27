'use client';

import { useState, useEffect, useRef } from 'react';
import { gsap } from '@/lib/gsap';
import styles from './GoldenSunriseIntro.module.css';

/**
 * GoldenSunriseIntro
 * Cinematic luxury resort intro loader.
 * Displays sunrise emblem, brand typography, and slides off-screen upward within 3-4s.
 */
export default function GoldenSunriseIntro({ onComplete }) {
  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    let shouldSkip = false;
    try {
      if (typeof window !== 'undefined') {
        const navType =
          window.performance?.getEntriesByType?.('navigation')?.[0]?.type;

        if (navType === 'reload') {
          // Manual reload: clear flags so developer/user can always see and test the intro
          sessionStorage.removeItem('hasSeenResortIntro');
          sessionStorage.removeItem('hasVisitedTour');
        }

        // Skip intro ONLY if user is navigating back from /tour within the same
        // SPA session (client-side navigation sets this flag). A fresh tab
        // (navType === 'navigate') should always show the intro.
        const isClientNav = sessionStorage.getItem('hasVisitedTour') === 'true';
        const isFreshTab = navType === 'navigate';

        if (isFreshTab) {
          // Fresh tab / address-bar entry: always show the intro
          sessionStorage.removeItem('hasVisitedTour');
          shouldSkip = false;
        } else {
          // SPA back-navigation from /tour: skip intro
          shouldSkip = isClientNav;
        }
      }
    } catch {
      shouldSkip = false;
    }

    if (shouldSkip) {
      if (onCompleteRef.current) onCompleteRef.current();
      return;
    }

    setShouldRender(true);
  }, []);

  useEffect(() => {
    if (!shouldRender) return;

    const overlay = overlayRef.current;
    if (!overlay) return;

    // Prevent background scrolling while intro is active
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let isFinished = false;
    const finishIntro = () => {
      if (isFinished) return;
      isFinished = true;

      try {
        sessionStorage.setItem('hasSeenResortIntro', 'true');
      } catch {
        // Ignore storage exceptions
      }

      document.body.style.overflow = originalOverflow;
      setShouldRender(false);
      if (onCompleteRef.current) {
        onCompleteRef.current();
      }
    };

    // Safety fallback: ensure intro never hangs indefinitely under any condition
    const fallbackTimer = setTimeout(finishIntro, 4500);

    // Reduced motion check
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Use gsap.context() scoped to the overlay component
    const ctx = gsap.context(() => {
      if (prefersReducedMotion) {
        gsap.to(overlay, {
          opacity: 0,
          duration: 0.6,
          delay: 0.6,
          onComplete: finishIntro,
        });
        return;
      }

      const tl = gsap.timeline({
        onComplete: finishIntro,
      });

      // Initial setup scoped to overlay
      gsap.set('.intro-corner', { opacity: 0 });
      gsap.set(['.intro-est', '.intro-title'], { opacity: 0, y: 14 });
      gsap.set('.intro-horizon', { scaleX: 0, transformOrigin: 'center center' });
      gsap.set('.intro-sun', { y: 35 });
      gsap.set('.intro-glow', { opacity: 0, scale: 0.4, transformOrigin: 'center center' });
      gsap.set('.intro-rays', { opacity: 0 });
      gsap.set(['.intro-subtitle', '.intro-status'], { opacity: 0, y: 10 });

      // Step 1: Corner gold lines fade in
      tl.to('.intro-corner', {
        opacity: 1,
        duration: 0.6,
        ease: 'power2.out',
      }, 0.1);

      // Step 2: EST. 2024 & MAGICAL RESORT fade in with subtle vertical float
      tl.to('.intro-est', {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: 'power2.out',
      }, 0.3);

      tl.to('.intro-title', {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
      }, 0.45);

      // Step 3: Golden horizon line draws itself across the center
      tl.to('.intro-horizon', {
        scaleX: 1,
        duration: 0.75,
        ease: 'power2.inOut',
      }, 0.8);

      // Step 4 & 5: Golden sun rises gradually from behind the horizon with soft warm glow
      tl.to('.intro-sun', {
        y: 0,
        duration: 1.0,
        ease: 'power2.out',
      }, 1.05);

      tl.to('.intro-glow', {
        opacity: 0.85,
        scale: 1.2,
        duration: 1.1,
        ease: 'power2.out',
      }, 1.05);

      tl.to('.intro-rays', {
        opacity: 1,
        duration: 0.6,
        ease: 'power2.out',
      }, 1.35);

      // Step 6: Subtitle and PREPARING YOUR EXPERIENCE fade in smoothly
      tl.to('.intro-subtitle', {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: 'power2.out',
      }, 1.6);

      tl.to('.intro-status', {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power2.out',
      }, 1.75);

      // Step 7: Hold the majestic sunrise emblem briefly, then slide overlay upward
      // Completes full intro sequence in ~3.7s
      tl.to(overlay, {
        yPercent: -100,
        duration: 0.8,
        ease: 'power3.inOut',
      }, 2.9);

      if (contentRef.current) {
        tl.to(contentRef.current, {
          y: -40,
          opacity: 0.8,
          duration: 0.6,
          ease: 'power2.in',
        }, 2.9);
      }
    }, overlayRef);

    return () => {
      clearTimeout(fallbackTimer);
      document.body.style.overflow = originalOverflow;
      ctx.revert();
    };
  }, [shouldRender]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Magical Resort Experience Introduction"
    >
      {/* Delicate Gold Corner Brackets */}
      <div className={`intro-corner ${styles.cornerTL}`} />
      <div className={`intro-corner ${styles.cornerTR}`} />
      <div className={`intro-corner ${styles.cornerBL}`} />
      <div className={`intro-corner ${styles.cornerBR}`} />

      {/* Main Intro Content */}
      <div ref={contentRef} className={styles.content}>
        <span className={`intro-est ${styles.est}`}>EST. 2024</span>
        <h1 className={`intro-title ${styles.title}`}>Magical Resort</h1>

        {/* Custom Golden Sunrise Emblem */}
        <div className={styles.symbolWrapper}>
          <svg
            viewBox="0 0 220 110"
            className={styles.sunriseSvg}
            aria-hidden="true"
          >
            <defs>
              {/* Soft warm gold ambient glow */}
              <radialGradient id="sunriseGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff5db" stopOpacity="0.85" />
                <stop offset="40%" stopColor="#c5a880" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#c5a880" stopOpacity="0" />
              </radialGradient>

              {/* Clip path: guarantees sun only emerges from behind the horizon */}
              <clipPath id="horizonMask">
                <rect x="0" y="0" width="220" height="66" />
              </clipPath>
            </defs>

            {/* Ambient Warm Glow behind the rising sun */}
            <circle
              cx="110"
              cy="66"
              r="48"
              fill="url(#sunriseGlow)"
              className="intro-glow"
            />

            {/* Rising Golden Sun (masked by horizon line) */}
            <g clipPath="url(#horizonMask)">
              <circle
                cx="110"
                cy="66"
                r="24"
                fill="#c5a880"
                className="intro-sun"
              />
              {/* Delicate Sun Rays */}
              <g
                className="intro-rays"
                stroke="#c5a880"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <line x1="110" y1="36" x2="110" y2="26" />
                <line x1="86" y1="44" x2="79" y2="36" />
                <line x1="134" y1="44" x2="141" y2="36" />
                <line x1="68" y1="59" x2="60" y2="55" />
                <line x1="152" y1="59" x2="160" y2="55" />
              </g>
            </g>

            {/* Golden Horizon Line */}
            <line
              x1="24"
              y1="66"
              x2="196"
              y2="66"
              stroke="#c5a880"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="intro-horizon"
            />
          </svg>
        </div>

        {/* Subtitle */}
        <p className={`intro-subtitle ${styles.subtitle}`}>
          A Sanctuary Beyond Imagination
        </p>

        {/* Loading Indicator & Status */}
        <div className={`intro-status ${styles.loadingStatus}`}>
          <div className={styles.pulseDot} />
          <span>Preparing Your Experience</span>
        </div>
      </div>
    </div>
  );
}
