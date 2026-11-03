'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import CategoryCard from '@/components/cards/CategoryCard';
import { useVideoTimeline, PLAYBACK_MODES } from '@/components/video/PersistentVideo';
import TextSplit from '@/components/animations/TextSplit';
import styles from './page.module.css';

// Alternating diagonal corner masks for category cards:
// 1. Top-Left, 2. Top-Right, 3. Bottom-Left, 4. Bottom-Right, 5. Top-Left, 6. Top-Right
const CORNER_MASKS = [
  // Card 1: Top-Left corner expanding down-right
  {
    from: 'polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%)',
    to: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
  },
  // Card 2: Top-Right corner expanding down-left
  {
    from: 'polygon(100% 0%, 100% 0%, 100% 0%, 100% 0%)',
    to: 'polygon(100% 0%, 0% 0%, 0% 100%, 100% 100%)',
  },
  // Card 3: Bottom-Left corner expanding up-right
  {
    from: 'polygon(0% 100%, 0% 100%, 0% 100%, 0% 100%)',
    to: 'polygon(0% 100%, 0% 0%, 100% 0%, 100% 100%)',
  },
  // Card 4: Bottom-Right corner expanding up-left
  {
    from: 'polygon(100% 100%, 100% 100%, 100% 100%, 100% 100%)',
    to: 'polygon(100% 100%, 0% 100%, 0% 0%, 100% 0%)',
  },
  // Card 5: Top-Left corner (repeat)
  {
    from: 'polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%)',
    to: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
  },
  // Card 6: Top-Right corner (repeat)
  {
    from: 'polygon(100% 0%, 100% 0%, 100% 0%, 100% 0%)',
    to: 'polygon(100% 0%, 0% 0%, 0% 100%, 100% 100%)',
  },
];

export default function TourPage() {
  const containerRef = useRef(null);
  const pinWrapperRef = useRef(null);

  const { videoRef, setSegment, seekTour, setPlaybackMode, getHandoffTimestamp, isReady, setHasSeenIntro } = useVideoTimeline();

  useEffect(() => {
    let isMounted = true;
    setHasSeenIntro(true);

    // Reset scroll to top and prevent browser auto-scroll jump
    if (typeof window !== 'undefined') {
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }
      window.scrollTo(0, 0);
      window.__lenis?.scrollTo(0, { immediate: true });
      ScrollTrigger.clearScrollMemory();
      try {
        sessionStorage.setItem('hasVisitedTour', 'true');
        sessionStorage.setItem('hasSeenResortIntro', 'true');
      } catch { }
    }

    const container = containerRef.current;
    const pinWrapper = pinWrapperRef.current;
    if (!container || !pinWrapper) return;

    // Exactly preserve the video timestamp captured at the end of Phase 1
    const startTimestamp = getHandoffTimestamp();

    // Assign Segment 2 (startTimestamp to 163.2s) — ends 2s earlier for level, untilted equal sea view
    setSegment({
      start: startTimestamp,
      end: 163.2,
    });

    let ctx = null;

    const setupTour = () => {
      if (!isMounted) return;
      if (ctx) ctx.revert();

      ctx = gsap.context(() => {
        // Pinned Video Scrub Timeline (+1550% for gradual cinematic pacing)
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: pinWrapper,
            start: 'top top',
            end: '+=2880%',
            pin: true,
            // Immediate 1:1 scrub ensures video scrubbing stops immediately when scrolling stops
            scrub: true,
            anticipatePin: 1,
            onLeave: () => {
              if (!isMounted) return;
              setPlaybackMode(PLAYBACK_MODES.PHASE2_SCROLL);
              seekTour(1.0);
            },
          },
        });

        // Authoritative continuous scroll-controlled scrubbing across the entire Phase 2 timeline
        tl.eventCallback('onUpdate', () => {
          if (!isMounted) return;
          const p = tl.progress();
          setPlaybackMode(PLAYBACK_MODES.PHASE2_SCROLL);
          seekTour(p);
        });

        // Ensure Phase 2 starts immediately in scroll mode at current handoff timestamp
        // Do NOT re-seek at progress 0 — setSegment already aligned the video to the
        // handoff frame. Re-seeking would cause a visible frame jump.
        setPlaybackMode(PLAYBACK_MODES.PHASE2_SCROLL);

        // Initial setup for overlay containers, letter-by-letter characters, and floating cards
        // CRITICAL: Overlays 3 to 7 and the floating cards MUST start completely hidden and un-rendered
        gsap.set(['.overlay-dining', '.overlay-children', '.overlay-rooms', '.overlay-rooftop', '.overlay-sea', '.overlay-cards'], { autoAlpha: 0 });
        gsap.set(['.dining-heading-char', '.dining-support-char', '.children-heading-char', '.children-support-char', '.rooms-heading-char', '.rooms-support-char', '.rooftop-heading-char', '.rooftop-support-char', '.sea-heading-char', '.sea-support-char'], { opacity: 0, y: 6 });

        // Respect reduced-motion preferences if requested by user
        const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Each card gets a unique diagonal corner mask (top-left, top-right, bottom-left, bottom-right, repeat)
        const cardEls = container.querySelectorAll('.floating-category-card');
        if (prefersReducedMotion) {
          gsap.set(cardEls, { opacity: 0, clipPath: 'none', pointerEvents: 'none' });
        } else {
          cardEls.forEach((el, i) => {
            gsap.set(el, {
              clipPath: CORNER_MASKS[i % CORNER_MASKS.length].from,
              opacity: 0,
              pointerEvents: 'none',
            });
          });
        }

        // Tour Scroll Cue fades out as scroll starts (0 to 0.4)
        tl.to('.tour-scroll-cue', {
          opacity: 0,
          y: -15,
          duration: 0.5,
          ease: 'power2.out',
        }, 0);

        // -------------------------------------------------------------------
        // OVERLAY 3: Exceptional Dining (00:35 / t=35s, offset=5s, p=0.036 -> pos 0.36 in 0-10)
        // Brief 2-3s overlay: entrance at 0.3, peak at 0.7, exits by 1.6
        // -------------------------------------------------------------------
        tl.to('.overlay-dining', { autoAlpha: 1, duration: 0.01 }, 0.3);

        tl.to('.dining-heading-char', {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.016,
          ease: 'power2.out',
        }, 0.32);

        tl.to('.dining-support-char', {
          opacity: 1,
          y: 0,
          duration: 0.25,
          stagger: 0.007,
          ease: 'power2.out',
        }, 0.5);

        // Exit letter-by-letter
        tl.to('.dining-heading-char', {
          opacity: 0,
          y: -8,
          duration: 0.25,
          stagger: 0.01,
          ease: 'power2.in',
        }, 1.4);

        tl.to('.dining-support-char', {
          opacity: 0,
          y: -6,
          duration: 0.2,
          stagger: 0.006,
          ease: 'power2.in',
        }, 1.45);

        tl.to('.overlay-dining', { autoAlpha: 0, duration: 0.01 }, 1.7);

        // -------------------------------------------------------------------
        // OVERLAY 4: Fun for Every Generation (01:06 / t=66s, offset=36s, p=0.257 -> pos 2.57 in 0-10)
        // Brief 2-3s overlay: entrance at 2.4, peak at 2.8, exits by 3.6
        // -------------------------------------------------------------------
        tl.to('.overlay-children', { autoAlpha: 1, duration: 0.01 }, 2.4);

        tl.to('.children-heading-char', {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.016,
          ease: 'power2.out',
        }, 2.42);

        tl.to('.children-support-char', {
          opacity: 1,
          y: 0,
          duration: 0.25,
          stagger: 0.007,
          ease: 'power2.out',
        }, 2.6);

        // Exit letter-by-letter
        tl.to('.children-heading-char', {
          opacity: 0,
          y: -8,
          duration: 0.25,
          stagger: 0.01,
          ease: 'power2.in',
        }, 3.4);

        tl.to('.children-support-char', {
          opacity: 0,
          y: -6,
          duration: 0.2,
          stagger: 0.006,
          ease: 'power2.in',
        }, 3.45);

        tl.to('.overlay-children', { autoAlpha: 0, duration: 0.01 }, 3.7);

        // -------------------------------------------------------------------
        // OVERLAY 5: Your Private Sanctuary (01:43 / t=103s, offset=73s, p=0.521 -> pos 5.21 in 0-10)
        // Brief 2-3s overlay: entrance at 4.9, peak at 5.3, exits by 6.0
        // -------------------------------------------------------------------
        tl.to('.overlay-rooms', { autoAlpha: 1, duration: 0.01 }, 4.9);

        tl.to('.rooms-heading-char', {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.016,
          ease: 'power2.out',
        }, 4.92);

        tl.to('.rooms-support-char', {
          opacity: 1,
          y: 0,
          duration: 0.25,
          stagger: 0.007,
          ease: 'power2.out',
        }, 5.1);

        // Exit letter-by-letter
        tl.to('.rooms-heading-char', {
          opacity: 0,
          y: -8,
          duration: 0.25,
          stagger: 0.01,
          ease: 'power2.in',
        }, 5.8);

        tl.to('.rooms-support-char', {
          opacity: 0,
          y: -6,
          duration: 0.2,
          stagger: 0.006,
          ease: 'power2.in',
        }, 5.85);

        tl.to('.overlay-rooms', { autoAlpha: 0, duration: 0.01 }, 6.1);

        // -------------------------------------------------------------------
        // OVERLAY 6: Elevate Your Experience (01:58 / t=118s, offset=88s, p=0.628 -> pos 6.28 in 0-10)
        // Brief 2-3s overlay: entrance at 6.1, peak at 6.5, exits by 7.2
        // -------------------------------------------------------------------
        tl.to('.overlay-rooftop', { autoAlpha: 1, duration: 0.01 }, 6.2);

        tl.to('.rooftop-heading-char', {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.016,
          ease: 'power2.out',
        }, 6.22);

        tl.to('.rooftop-support-char', {
          opacity: 1,
          y: 0,
          duration: 0.25,
          stagger: 0.007,
          ease: 'power2.out',
        }, 6.4);

        // Exit letter-by-letter
        tl.to('.rooftop-heading-char', {
          opacity: 0,
          y: -8,
          duration: 0.25,
          stagger: 0.01,
          ease: 'power2.in',
        }, 7.0);

        tl.to('.rooftop-support-char', {
          opacity: 0,
          y: -6,
          duration: 0.2,
          stagger: 0.006,
          ease: 'power2.in',
        }, 7.05);

        tl.to('.overlay-rooftop', { autoAlpha: 0, duration: 0.01 }, 7.3);

        // -------------------------------------------------------------------
        // OVERLAY 7: Where Serenity Meets the Sea (02:35 / t=155s, offset=125s, p=0.892 -> pos 8.92 in 0-10)
        // Middle-Right: Enters at 8.0, peaks around 8.4, and completely exits by 8.95
        // MUST disappear completely before cards fade in at 9.1
        // -------------------------------------------------------------------
        tl.to('.overlay-sea', { autoAlpha: 1, duration: 0.01 }, 8.0);

        tl.to('.sea-heading-char', {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.016,
          ease: 'power2.out',
        }, 8.02);

        tl.to('.sea-support-char', {
          opacity: 1,
          y: 0,
          duration: 0.25,
          stagger: 0.007,
          ease: 'power2.out',
        }, 8.2);

        // Exit letter-by-letter: completely hidden by 8.95
        tl.to('.sea-heading-char', {
          opacity: 0,
          y: -8,
          duration: 0.25,
          stagger: 0.01,
          ease: 'power2.in',
        }, 8.75);

        tl.to('.sea-support-char', {
          opacity: 0,
          y: -6,
          duration: 0.2,
          stagger: 0.006,
          ease: 'power2.in',
        }, 8.8);

        tl.to('.overlay-sea', { autoAlpha: 0, duration: 0.01 }, 8.95);

        // -------------------------------------------------------------------
        // SIX COMPACT CATEGORY CARDS — Fast diagonal corner-mask reveal
        //
        // Timing calculation (video segment: startTimestamp to 163.2s):
        //   Video duration ≈ 133.2s (assuming ~30s handoff)
        //   Card reveal begins at TL 9.55 (progress ~0.901) → video ~150.0s
        //   All 6 cards fully revealed by TL 10.35 → video ~160.1s (3.1s before 163.2 endpoint)
        //   Final hold from TL 10.35 to 10.60: viewers enjoy the level, untilted equal sea view
        //
        // Each card reveals from an alternating diagonal corner:
        //   Card 1: top-left  →  Card 2: top-right  →  Card 3: bottom-left
        //   Card 4: bottom-right  →  Card 5: top-left  →  Card 6: top-right
        //
        // Duration: 0.30 per card, stagger: 0.10, ease: power2.out
        // -------------------------------------------------------------------
        tl.to('.overlay-cards', { autoAlpha: 1, duration: 0.01 }, 9.50);

        if (prefersReducedMotion) {
          tl.to(cardEls, {
            opacity: 1,
            duration: 0.35,
            stagger: 0.08,
            pointerEvents: 'auto',
            ease: 'power1.out',
          }, 9.55);
        } else {
          cardEls.forEach((el, i) => {
            const mask = CORNER_MASKS[i % CORNER_MASKS.length];
            tl.to(el, {
              clipPath: mask.to,
              opacity: 1,
              pointerEvents: 'auto',
              duration: 0.30,
              ease: 'power2.out',
            }, 9.55 + i * 0.10);
          });
        }

        // Hold fully revealed cards over the final level sea video for comfortable viewing
        tl.to({}, { duration: 0.25 }, 10.35);

      }, container);

      ScrollTrigger.refresh();
    };

    setupTour();

    return () => {
      isMounted = false;
      if (ctx) ctx.revert();
      ScrollTrigger.getAll().forEach(st => {
        if (st.vars.trigger === pinWrapper) {
          st.kill();
        }
      });
    };
  }, [setSegment, seekTour, setPlaybackMode, getHandoffTimestamp, videoRef]);

  // When video metadata is ready, recalculate ScrollTrigger pin boundaries
  useEffect(() => {
    if (isReady && typeof window !== 'undefined') {
      ScrollTrigger.refresh();
    }
  }, [isReady]);

  return (
    <div ref={containerRef} className={styles.container}>
      {/* Discreet Navigation Bar */}
      <header className={styles.topBar}>
        <span className={styles.brandLogo}>Magical Resort</span>
        <Link
          href="/"
          className={styles.backLink}
          scroll={false}
          onClick={() => {
            setHasSeenIntro(true);
            try {
              sessionStorage.setItem('returnToStory', 'true');
            } catch { }
          }}
        >
          <span>&larr;</span>
          <span>Back to Story</span>
        </Link>
      </header>

      {/* Pinned Video Tour Viewport */}
      <div ref={pinWrapperRef} className={styles.pinWrapper}>
        <div className={styles.tourContent}>
          {/* Scroll Cue at bottom */}
          <div className={`tour-scroll-cue ${styles.scrollCue}`}>
            <span>Scroll to Tour Grounds</span>
            <div className={styles.scrollLine} />
          </div>

          {/* Overlay 3 — Dining (00:35, Middle-Right) */}
          <div className={`overlay-dining ${styles.moment} ${styles.posMiddleRight}`}>
            <h2 className={styles.momentHeading}>
              <TextSplit text="Exceptional Dining" letterClassName="dining-heading-char" />
            </h2>
            <p className={styles.momentSupport}>
              <TextSplit
                text="Discover flavours made for memorable moments."
                letterClassName="dining-support-char"
              />
            </p>
          </div>

          {/* Overlay 4 — Children's Area (01:06, Middle-Right) */}
          <div className={`overlay-children ${styles.moment} ${styles.posMiddleRight}`}>
            <h2 className={styles.momentHeading}>
              <TextSplit text="Fun for Every Generation" letterClassName="children-heading-char" />
            </h2>
            <p className={styles.momentSupport}>
              <TextSplit
                text="Make room for moments everyone will remember."
                letterClassName="children-support-char"
              />
            </p>
          </div>

          {/* Overlay 5 — Room or Suite (01:43, Middle-Right) */}
          <div className={`overlay-rooms ${styles.moment} ${styles.posMiddleRight}`}>
            <h2 className={styles.momentHeading}>
              <TextSplit text="Your Private Sanctuary" letterClassName="rooms-heading-char" />
            </h2>
            <p className={styles.momentSupport}>
              <TextSplit
                text="Unwind in a space designed for effortless comfort."
                letterClassName="rooms-support-char"
              />
            </p>
          </div>

          {/* Overlay 6 — Rooftop (01:58, Middle-Left) */}
          <div className={`overlay-rooftop ${styles.moment} ${styles.posMiddleLeft}`}>
            <h2 className={styles.momentHeading}>
              <TextSplit text="Elevate Your Experience" letterClassName="rooftop-heading-char" />
            </h2>
            <p className={styles.momentSupport}>
              <TextSplit
                text="A different perspective on resort living."
                letterClassName="rooftop-support-char"
              />
            </p>
          </div>

          {/* Overlay 7 — Sea and Beach Finale (02:35, Middle-Right) */}
          <div className={`overlay-sea ${styles.moment} ${styles.posMiddleRight}`}>
            <h2 className={styles.momentHeading}>
              <TextSplit text="Where Serenity Meets the Sea" letterClassName="sea-heading-char" />
            </h2>
            <p className={styles.momentSupport}>
              <TextSplit
                text="Let the horizon become your escape."
                letterClassName="sea-support-char"
              />
            </p>
          </div>

          {/* Six Compact Category Cards Floating Directly Over Moving Sea Video */}
          <div className={`overlay-cards ${styles.floatingCardsOverlay}`}>
            <div className={styles.floatingCardsGrid}>
              <CategoryCard
                className="floating-category-card"
                badge="COMING SOON"
                icon="🛏️"
                title="Rooms & Suites"
                description="Discover your private retreat, designed for comfort and tranquility."
              />
              <CategoryCard
                className="floating-category-card"
                badge="COMING SOON"
                icon="🍽️"
                title="Dining"
                description="Savour memorable flavours in an inviting coastal setting."
              />
              <CategoryCard
                className="floating-category-card"
                badge="COMING SOON"
                icon="🏊"
                title="Swimming Pool"
                description="Unwind beside the water and enjoy the tropical surroundings."
              />
              <CategoryCard
                className="floating-category-card"
                badge="COMING SOON"
                icon="🌿"
                title="Spa & Wellness"
                description="Make space for relaxation, balance, and personal well-being."
              />
              <CategoryCard
                className="floating-category-card"
                badge="COMING SOON"
                icon="🥂"
                title="Events & Celebrations"
                description="Bring meaningful gatherings and special occasions to life."
              />
              <CategoryCard
                className="floating-category-card"
                badge="COMING SOON"
                icon="⛵"
                title="Activities & Experiences"
                description="Explore memorable moments for every kind of getaway."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
