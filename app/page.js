'use client';

import { useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import GoldenSunriseIntro from '@/components/intro/GoldenSunriseIntro';
import { useVideoTimeline, PLAYBACK_MODES } from '@/components/video/PersistentVideo';
import TextSplit from '@/components/animations/TextSplit';
import styles from './page.module.css';

export default function StoryPage() {
  const router = useRouter();
  const containerRef = useRef(null);
  const pinWrapperRef = useRef(null);
  const hasNavigatedRef = useRef(false);

  const { videoRef, setSegment, seek, setPlaybackMode, setOnHandoff, captureHandoff, pause, isReady } = useVideoTimeline();

  const handleIntroComplete = useCallback(() => {
    // Refresh ScrollTrigger after intro exit and layout reflow
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
      });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    hasNavigatedRef.current = false;

    // Check if returning from Tour page
    let isReturning = false;
    try {
      if (typeof window !== 'undefined') {
        isReturning = sessionStorage.getItem('returnToStory') === 'true';
        if (isReturning) {
          sessionStorage.removeItem('returnToStory');
        }
      }
    } catch {}

    // Reset scroll to top unless returning from Tour
    if (typeof window !== 'undefined') {
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }
      if (!isReturning) {
        window.scrollTo(0, 0);
      }
      ScrollTrigger.clearScrollMemory();
    }

    const container = containerRef.current;
    const pinWrapper = pinWrapperRef.current;
    if (!container || !pinWrapper) return;

    // Assign Segment 1 (0.0s to 30.0s) for Phase 1 Intro
    setSegment({
      start: 0,
      end: 30,
    });

    const triggerHandoff = () => {
      // Don't auto-navigate when user just returned from Tour
      if (isReturning) return;
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      pause();
      const current = videoRef.current?.currentTime;
      captureHandoff(typeof current === 'number' && current > 5 ? current : 30.0);
      router.push('/tour');
    };

    // Register automatic handoff callback to navigate seamlessly to Phase 2
    setOnHandoff(() => {
      if (!isMounted) return;
      triggerHandoff();
    });

    // Prefetch Phase 2 so route swap is instantaneous
    router.prefetch('/tour');

    let ctx = null;

    const setupScrubber = () => {
      if (!isMounted) return;
      if (ctx) ctx.revert();

      ctx = gsap.context(() => {
        // Professional, velocity-aware scrub timeline (+770% for gradual cinematic pacing)
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: pinWrapper,
            start: 'top top',
            end: '+=770%',
            pin: true,
            scrub: true, // Immediate 1:1 scroll responsiveness without artificial inertia lag
            anticipatePin: 1,
            onLeave: () => {
              if (!isMounted) return;
              triggerHandoff();
            },
          },
        });

        // Continuous scroll-controlled seeking across the entire Phase 1 scroll range
        tl.eventCallback('onUpdate', () => {
          if (!isMounted) return;
          const p = tl.progress();
          setPlaybackMode(PLAYBACK_MODES.PHASE1_SCROLL);
          seek(p);
        });

        // Ensure initial frame is locked in immediately
        seek(tl.progress());

        // Initial setup for overlay containers and letter-by-letter characters
        // CRITICAL: Overlays 1 & 2 and CTA must start completely hidden and un-rendered
        gsap.set(['.overlay-welcome', '.overlay-relax', '.home-cta'], { autoAlpha: 0 });
        gsap.set(['.hero-title-char', '.hero-para-char', '.welcome-heading-char', '.welcome-support-char', '.relax-heading-char', '.relax-support-char'], { opacity: 0, y: 6 });

        // Scroll Cue fades out as soon as user begins scrolling (0.0 to 0.4 on timeline)
        tl.to('.home-scroll-cue', {
          opacity: 0,
          y: -15,
          duration: 0.6,
          ease: 'power2.out',
        }, 0);

        // -------------------------------------------------------------------
        // OPENING VIDEO TITLE: EST. 2024 / Where Every Dream Finds Its Place
        // Visible at start of video (0s - 7s), fades out before 00:10
        // -------------------------------------------------------------------
        tl.to('.overlay-hero-title', { autoAlpha: 1, duration: 0.01 }, 0);

        tl.fromTo('.hero-est',
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' },
          0
        );

        tl.to('.hero-title-char', {
          opacity: 1,
          y: 0,
          duration: 0.4,
          stagger: 0.015,
          ease: 'power2.out',
        }, 0.1);

        tl.to('.hero-para-char', {
          opacity: 1,
          y: 0,
          duration: 0.35,
          stagger: 0.008,
          ease: 'power2.out',
        }, 0.4);

        // Exit: letter-by-letter exit upward for opening title (completes before 00:10)
        tl.to('.hero-title-char', {
          opacity: 0,
          y: -8,
          duration: 0.3,
          stagger: 0.01,
          ease: 'power2.in',
        }, 1.7);

        tl.to('.hero-para-char', {
          opacity: 0,
          y: -6,
          duration: 0.25,
          stagger: 0.006,
          ease: 'power2.in',
        }, 1.75);

        tl.to('.hero-est', {
          opacity: 0,
          y: -10,
          duration: 0.4,
          ease: 'power2.in',
        }, 2.0);

        tl.to('.overlay-hero-title', { autoAlpha: 0, duration: 0.01 }, 2.4);

        // -------------------------------------------------------------------
        // OVERLAY 1: A Grand Welcome (Reception at 00:10 -> pos ~3.3 in 0-10)
        // Brief 2-3s overlay: entrance at 2.9, peak at 3.3, exits by 4.5
        // -------------------------------------------------------------------
        tl.to('.overlay-welcome', { autoAlpha: 1, duration: 0.01 }, 2.9);

        tl.to('.welcome-heading-char', {
          opacity: 1,
          y: 0,
          duration: 0.35,
          stagger: 0.018,
          ease: 'power2.out',
        }, 2.95);

        tl.to('.welcome-support-char', {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.01,
          ease: 'power2.out',
        }, 3.15);

        // Exit letter-by-letter before next scene
        tl.to('.welcome-heading-char', {
          opacity: 0,
          y: -8,
          duration: 0.25,
          stagger: 0.01,
          ease: 'power2.in',
        }, 4.2);

        tl.to('.welcome-support-char', {
          opacity: 0,
          y: -6,
          duration: 0.2,
          stagger: 0.006,
          ease: 'power2.in',
        }, 4.25);

        tl.to('.overlay-welcome', { autoAlpha: 0, duration: 0.01 }, 4.55);

        // -------------------------------------------------------------------
        // OVERLAY 2: Relax. Unwind. Enjoy. (Pool at 00:23 -> pos ~7.6 in 0-10)
        // Brief 2-3s overlay: entrance at 6.8, peak at 7.6, exits by 8.4
        // -------------------------------------------------------------------
        tl.to('.overlay-relax', { autoAlpha: 1, duration: 0.01 }, 6.8);

        tl.to('.relax-heading-char', {
          opacity: 1,
          y: 0,
          duration: 0.35,
          stagger: 0.018,
          ease: 'power2.out',
        }, 6.85);

        tl.to('.relax-support-char', {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.01,
          ease: 'power2.out',
        }, 7.05);

        // Exit letter-by-letter
        tl.to('.relax-heading-char', {
          opacity: 0,
          y: -8,
          duration: 0.25,
          stagger: 0.01,
          ease: 'power2.in',
        }, 8.1);

        tl.to('.relax-support-char', {
          opacity: 0,
          y: -6,
          duration: 0.2,
          stagger: 0.006,
          ease: 'power2.in',
        }, 8.15);

        tl.to('.overlay-relax', { autoAlpha: 0, duration: 0.01 }, 8.45);

        // -------------------------------------------------------------------
        // Phase 1 Conclusion & "Enter the Resort" CTA (28s - 30s)
        // Transitions into Mode B automatic forward continuation
        // -------------------------------------------------------------------
        tl.fromTo('.home-cta',
          { autoAlpha: 0, y: 25, pointerEvents: 'none' },
          { autoAlpha: 1, y: 0, pointerEvents: 'auto', ease: 'power2.out', duration: 0.9 },
          8.9
        );

        // If returning from Tour, position at the end of Phase 1 handoff
        if (isReturning) {
          ScrollTrigger.refresh();
          const st = tl.scrollTrigger;
          if (st) {
            window.scrollTo(0, st.end);
            tl.progress(1);
            setPlaybackMode(PLAYBACK_MODES.PHASE1_SCROLL);
            seek(1);
          }
        }
      }, container);

      ScrollTrigger.refresh();
    };

    setupScrubber();

    return () => {
      isMounted = false;
      if (ctx) ctx.revert();
      ScrollTrigger.getAll().forEach(st => {
        if (st.vars.trigger === pinWrapper) {
          st.kill();
        }
      });
    };
  }, [setSegment, seek, setPlaybackMode, setOnHandoff, router]);

  // When video metadata is ready, recalculate ScrollTrigger pin boundaries
  useEffect(() => {
    if (isReady && typeof window !== 'undefined') {
      ScrollTrigger.refresh();
    }
  }, [isReady]);

  return (
    <>
      {/* Cinematic Golden Sunrise Intro */}
      <GoldenSunriseIntro onComplete={handleIntroComplete} />

      <div ref={containerRef} className={styles.container}>
        <div ref={pinWrapperRef} className={styles.pinWrapper}>
          {/* Brand header */}
          <div className={styles.topBrand}>Magical Resort</div>

          {/* Approved Story Text Overlays (synced to scroll progress) */}
          <div className={styles.storyContent}>
            {/* Scroll Cue at bottom */}
            <div className={`home-scroll-cue ${styles.scrollCue}`}>
              <span>Scroll to Begin Experience</span>
              <div className={styles.scrollLine} />
            </div>

            {/* Opening Video Title (Reference Design: Large Editorial Serif Typography) */}
            <div className={`overlay-hero-title ${styles.heroTitleOverlay}`}>
              <span className={`hero-est ${styles.heroEst}`}>EST. 2024</span>
              <h1 className={styles.heroHeading}>
                <TextSplit
                  text="Where Every Dream Finds Its Place"
                  letterClassName="hero-title-char"
                />
              </h1>
              <p className={styles.heroParagraph}>
                <TextSplit
                  text="Magical Resort was born from a vision to create a sanctuary where nature and luxury exist in perfect harmony."
                  letterClassName="hero-para-char"
                />
              </p>
            </div>

            {/* Overlay 1 — Reception (00:10, Middle-Right) */}
            <div className={`overlay-welcome ${styles.moment} ${styles.posMiddleRight}`}>
              <h2 className={styles.momentHeading}>
                <TextSplit text="A Grand Welcome" letterClassName="welcome-heading-char" />
              </h2>
              <p className={styles.momentSupport}>
                <TextSplit
                  text="Every memorable escape begins with a warm welcome."
                  letterClassName="welcome-support-char"
                />
              </p>
            </div>

            {/* Overlay 2 — Pool and Relaxation (00:23, Middle-Left) */}
            <div className={`overlay-relax ${styles.moment} ${styles.posMiddleLeft}`}>
              <h2 className={styles.momentHeading}>
                <TextSplit text="Relax. Unwind. Enjoy." letterClassName="relax-heading-char" />
              </h2>
              <p className={styles.momentSupport}>
                <TextSplit
                  text="Find your rhythm beside the water."
                  letterClassName="relax-support-char"
                />
              </p>
            </div>

            {/* Phase 1 Completion & Enter the Resort Button */}
            <div className={`home-cta ${styles.ctaMoment}`} style={{ opacity: 0 }}>
              <span className={styles.momentSubtitle}>The Journey Continues</span>
              <h2 className={styles.momentHeading}>Discover Our Sanctuary</h2>
              <div className={styles.ctaWrapper}>
                <Link
                  href="/tour"
                  className={styles.enterButton}
                  scroll={true}
                  onClick={() => {
                    triggerHandoff();
                  }}
                >
                  <span>Enter the Resort</span>
                  <span className={styles.buttonArrow}>&rarr;</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
