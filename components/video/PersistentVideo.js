'use client';

import { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';
import styles from './PersistentVideo.module.css';

export const PLAYBACK_MODES = {
  PHASE1_SCROLL: 'PHASE1_SCROLL',
  PHASE1_AUTO: 'PHASE1_AUTO',
  PHASE2_SCROLL: 'PHASE2_SCROLL',
  PHASE2_AUTO_LOOP: 'PHASE2_AUTO_LOOP',
};

const VideoTimelineContext = createContext(null);

/**
 * Critically Damped Harmonic Oscillator (Unity / Game Programming Gems SmoothDamp)
 * Guarantees smooth acceleration, zero jerk, smooth deceleration, and no overshooting.
 */
function smoothDamp(current, target, currentVelocityRef, smoothTime, maxSpeed, deltaTime) {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2.0 / st;
  const x = omega * deltaTime;
  const exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);

  let change = current - target;
  const originalTo = target;

  const maxChange = maxSpeed * st;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  const fromTarget = current - change;

  const temp = (currentVelocityRef.current + omega * change) * deltaTime;
  currentVelocityRef.current = (currentVelocityRef.current - omega * temp) * exp;
  let output = fromTarget + (change + temp) * exp;

  // Prevent overshooting the target
  if ((originalTo - current > 0.0) === (output > originalTo)) {
    output = originalTo;
    currentVelocityRef.current = 0;
  }

  return output;
}

/**
 * Adaptive smooth time based on scroll distance:
 * - Small scroll (dist <= 0.5s): smoothTime = 0.30s (settles in ~1.0s)
 * - Moderate scroll (dist = 3s): smoothTime = 0.34s (settles in ~1.1 - 1.2s)
 * - Large/fast scroll (dist >= 15s): smoothTime = 0.45s (settles in ~1.5s)
 */
function getAdaptiveSmoothTime(dist) {
  const clamped = Math.min(16, Math.max(0.5, dist));
  const t = (clamped - 0.5) / 15.5; // 0.0 to 1.0
  const ease = t * t * (3 - 2 * t);  // smoothstep
  return 0.30 + ease * 0.15;         // scales smoothly between 0.30s and 0.45s
}

export function PersistentVideoProvider({ children }) {
  const videoRef = useRef(null);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [duration, setDuration] = useState(170.32);

  // Active segment settings (Phase 1 default 0-30s; Phase 2 default 30-163.2s)
  const isTourInitial = typeof window !== 'undefined' && window.location.pathname.startsWith('/tour');
  const segmentRef = useRef({
    start: isTourInitial ? 30 : 0,
    end: isTourInitial ? 163.2 : 30,
  });

  // Authoritative Playback State Machine
  const modeRef = useRef(isTourInitial ? PLAYBACK_MODES.PHASE2_SCROLL : PLAYBACK_MODES.PHASE1_SCROLL);
  const [playbackMode, setPlaybackModeState] = useState(modeRef.current);
  const [hasSeenIntro, setHasSeenIntro] = useState(false);

  const targetTimeRef = useRef(isTourInitial ? 30 : 0);
  const currentSmoothedTimeRef = useRef(isTourInitial ? 30 : 0);
  const velocityRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const lastTickTimestampRef = useRef(0);
  const handoffTimestampRef = useRef(null);
  const isSeekingRef = useRef(false);
  const pendingTargetRef = useRef(null);
  const lastSeekTimestampRef = useRef(0);
  const rafIdRef = useRef(null);
  const lastAssignedTimeRef = useRef(-1);

  // Page 1 keeps its existing smoothDamp controller.
  // Page 2 uses numeric GSAP scrub for smoothing and this component only dispatches eased seeks.
  const tourRafIdRef = useRef(null);
  const tourAnimatingRef = useRef(false);
  const tourLastTickRef = useRef(0);
  const tourTargetTimeRef = useRef(isTourInitial ? 30 : 0);
  const onHandoffRef = useRef(null);
  const isLoopingRef = useRef(false);
  const hasPrimedRef = useRef(false);

  // Set the handoff callback for automatic Phase 1 -> Phase 2 transition
  const setOnHandoff = useCallback((cb) => {
    onHandoffRef.current = cb;
  }, []);

  // Capture and lock the authoritative video timestamp when transitioning from Page 1 to Page 2.
  // Prefer targetTimeRef (the latest scroll-assigned seek target) over video.currentTime
  // because currentTime lags behind during active scrubbing and causes a frame jump on Page 2.
  const captureHandoff = useCallback((timeOverride) => {
    const video = videoRef.current;
    let time = 30.0;
    if (typeof timeOverride === 'number' && timeOverride > 1) {
      time = timeOverride;
    } else if (targetTimeRef.current > 5) {
      // Primary: use the most recent scroll-driven target — always up-to-date
      time = targetTimeRef.current;
    } else if (video && video.currentTime > 5) {
      // Fallback: decoded currentTime if target not yet set
      time = video.currentTime;
    }
    handoffTimestampRef.current = time;
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('handoffVideoTimestamp', time.toFixed(3));
      } catch { }
    }
    return time;
  }, []);

  // Retrieve the preserved handoff timestamp for Page 2 segment initialization
  const getHandoffTimestamp = useCallback(() => {
    if (handoffTimestampRef.current !== null && handoffTimestampRef.current > 1) {
      return handoffTimestampRef.current;
    }
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('handoffVideoTimestamp');
        if (stored) {
          const parsed = parseFloat(stored);
          if (!Number.isNaN(parsed) && parsed > 1) {
            handoffTimestampRef.current = parsed;
            return parsed;
          }
        }
      } catch { }
    }
    const video = videoRef.current;
    if (video && video.currentTime > 5) {
      handoffTimestampRef.current = video.currentTime;
      return video.currentTime;
    }
    return 30.0;
  }, []);

  // Central Mode Switcher: handles clean transitions between scroll-control and autoplay
  const setPlaybackMode = useCallback((newMode) => {
    if (modeRef.current === newMode) return;

    modeRef.current = newMode;
    setPlaybackModeState(newMode);

    const video = videoRef.current;
    if (!video) return;

    if (newMode === PLAYBACK_MODES.PHASE1_AUTO) {
      // Entering Phase 1 Auto Mode: cancel pending seek rAFs and play smoothly
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      isSeekingRef.current = false;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => { });
      }
    } else if (newMode === PLAYBACK_MODES.PHASE1_SCROLL || newMode === PLAYBACK_MODES.PHASE2_SCROLL) {
      // Entering Scroll Mode: pause playback so scrubbing has exclusive control
      if (!video.paused) {
        video.pause();
      }
    }
  }, []);

  // Low-level seek dispatcher to the native video element with presentation verification
  const commitVideoSeek = useCallback((timeToSeek, now) => {
    const video = videoRef.current;
    if (!video) return;

    const dur = video.duration && !Number.isNaN(video.duration) ? video.duration : 170.32;
    const clamped = Math.max(0, Math.min(timeToSeek, dur - 0.05));

    // Avoid redundant seek if identical to last assigned time
    if (Math.abs(clamped - lastAssignedTimeRef.current) < 0.005) {
      return;
    }

    try {
      isSeekingRef.current = true;
      lastSeekTimestampRef.current = now;
      lastAssignedTimeRef.current = clamped;
      video.currentTime = clamped;

      // Keep exactly one native seek in flight. The `seeked` event is the
      // authority for releasing the lock; requestVideoFrameCallback can fire
      // for an older presented frame and unlock too early during rapid scrubs.
    } catch {
      isSeekingRef.current = false;
    }
  }, []);

  // Central adaptive smoothing animation frame tick
  const smoothingTick = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      isAnimatingRef.current = false;
      return;
    }

    const mode = modeRef.current;
    if (mode === PLAYBACK_MODES.PHASE1_AUTO) {
      isAnimatingRef.current = false;
      return;
    }

    const now = performance.now();
    let dt = (now - lastTickTimestampRef.current) / 1000;
    lastTickTimestampRef.current = now;
    if (dt <= 0 || dt > 0.1) {
      dt = 0.016;
    }

    const dur = video.duration && !Number.isNaN(video.duration) ? video.duration : 170.32;
    const target = Math.max(0, Math.min(targetTimeRef.current, dur - 0.05));
    const current = currentSmoothedTimeRef.current;
    const dist = Math.abs(target - current);

    // Continuous smooth simulation via smoothDamp down to sub-frame accuracy
    const isMathSettled = dist < 0.008 && Math.abs(velocityRef.current) < 0.05;

    if (isMathSettled) {
      currentSmoothedTimeRef.current = target;
      velocityRef.current = 0;

      const isVideoAligned = Math.abs(video.currentTime - target) < 0.002;
      const isDecoderIdle = !isSeekingRef.current && !video.seeking && pendingTargetRef.current === null;

      // Only stop the loop when the video element is confirmed to have rendered the final frame!
      if (isVideoAligned && isDecoderIdle) {
        isAnimatingRef.current = false;
        return;
      }

      // If video element is not yet aligned, dispatch or queue final seek
      if (!isVideoAligned) {
        if (isDecoderIdle) {
          commitVideoSeek(target, now);
        } else {
          pendingTargetRef.current = target;
        }
      }

      // Keep animation frame loop alive while the final seek is resolving/presenting
      rafIdRef.current = requestAnimationFrame(smoothingTick);
      return;
    }

    // Adaptive smoothing duration: ~1.0s for small scrolls, ~1.5s for fast long scrolls
    const smoothTime = getAdaptiveSmoothTime(dist);
    const maxSpeed = 85.0; // Limit peak seek speed to 85s of video per second
    const nextTime = smoothDamp(current, target, velocityRef, smoothTime, maxSpeed, dt);
    currentSmoothedTimeRef.current = nextTime;

    // Fluid frame dispatch:
    // Dispatch whenever change from last assigned currentTime >= 20ms (~0.6 frame)
    // or if 33ms (~1 frame interval) have elapsed since the last seek dispatch
    const change = Math.abs(nextTime - lastAssignedTimeRef.current);
    const timeSinceLastSeek = now - lastSeekTimestampRef.current;
    const isDecoderBusy = isSeekingRef.current || video.seeking;

    if (change >= 0.020 || timeSinceLastSeek >= 33) {
      if (!isDecoderBusy || timeSinceLastSeek >= 50) {
        commitVideoSeek(nextTime, now);
      } else {
        // Coalesce into pending target without interrupting in-flight seek
        pendingTargetRef.current = nextTime;
      }
    }

    rafIdRef.current = requestAnimationFrame(smoothingTick);
  }, [commitVideoSeek]);

  // Schedule seek with adaptive smoothing
  const scheduleSeek = useCallback((time) => {
    // Only schedule seeks in scroll-controlled modes
    const mode = modeRef.current;
    if (mode === PLAYBACK_MODES.PHASE1_AUTO) {
      return;
    }

    targetTimeRef.current = time;

    // Start smoothing animation loop if not currently active
    if (!isAnimatingRef.current) {
      const video = videoRef.current;
      // Sync starting time if uninitialized or drifted far from video current time
      if (video && Math.abs(currentSmoothedTimeRef.current - video.currentTime) > 3) {
        currentSmoothedTimeRef.current = video.currentTime;
      }
      isAnimatingRef.current = true;
      lastTickTimestampRef.current = performance.now();
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(smoothingTick);
    }
  }, [smoothingTick]);

  const handleSeeked = useCallback(() => {
    isSeekingRef.current = false;
    // If a pending seek was queued and not handled by rVFC, dispatch it now
    if (pendingTargetRef.current !== null) {
      const next = pendingTargetRef.current;
      pendingTargetRef.current = null;
      commitVideoSeek(next, performance.now());
    }
  }, [commitVideoSeek]);

  // Set the active segment for the current route
  const setSegment = useCallback((config) => {
    // Stop either prior route's animation loop before assigning the new segment.
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (tourRafIdRef.current) {
      cancelAnimationFrame(tourRafIdRef.current);
      tourRafIdRef.current = null;
    }
    isAnimatingRef.current = false;
    tourAnimatingRef.current = false;

    const video = videoRef.current;
    const current = video ? video.currentTime : 0;
    const start = typeof config.start === 'number' ? config.start : (current > 1 ? current : 0);
    const end = config.end ?? (video?.duration || 163.2);

    segmentRef.current = {
      start,
      end,
    };

    // If the video's current frame is already within this segment's valid range [start - 1.0, end + 1.0],
    // preserve the frame completely! Do NOT seek or reset to start!
    if (video && current >= start - 1.0 && current <= end + 1.0) {
      targetTimeRef.current = current;
      tourTargetTimeRef.current = current;
      currentSmoothedTimeRef.current = current;
      lastAssignedTimeRef.current = current;
      pendingTargetRef.current = null;
      velocityRef.current = 0;
      isAnimatingRef.current = false;
      return;
    }

    // Check if returning from Tour to Story — preserve end/handoff frame instead of resetting to 0 (KORA building)
    const isReturningToStory = typeof window !== 'undefined' && sessionStorage.getItem('returnToStory') === 'true';
    const fallbackTime = isReturningToStory ? (handoffTimestampRef.current || end) : start;

    targetTimeRef.current = fallbackTime;
    tourTargetTimeRef.current = fallbackTime;
    currentSmoothedTimeRef.current = fallbackTime;
    lastAssignedTimeRef.current = fallbackTime;
    pendingTargetRef.current = null;
    velocityRef.current = 0;
    isAnimatingRef.current = false;
    if (video && video.readyState >= 1) {
      try {
        video.currentTime = fallbackTime;
      } catch { }
    }
  }, []);

  // Seek relative to current segment progress [0.0 - 1.0]
  const seek = useCallback((progress) => {
    // Page 1 uses the existing smoothDamp controller.
    const mode = modeRef.current;
    if (mode === PLAYBACK_MODES.PHASE1_AUTO) {
      return;
    }

    const seg = segmentRef.current;
    const p = Math.max(0, Math.min(1, progress));
    const target = seg.start + p * (seg.end - seg.start);
    scheduleSeek(target);
  }, [scheduleSeek]);

  // Page 2 seek dispatcher.
  // GSAP ScrollTrigger's numeric scrub now performs the smoothing. This loop does
  // not interpolate a second time; it only sends the latest eased target to the
  // video at a decoder-friendly cadence.
  const tourSmoothingTick = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      tourAnimatingRef.current = false;
      tourRafIdRef.current = null;
      return;
    }

    const now = performance.now();
    tourLastTickRef.current = now;

    const duration =
      video.duration && Number.isFinite(video.duration)
        ? video.duration
        : 170.32;

    const target = Math.max(
      0,
      Math.min(tourTargetTimeRef.current, duration - 0.05)
    );

    // No second smoothing layer: the GSAP playhead already eases this target.
    currentSmoothedTimeRef.current = target;

    const timeSinceSeek = now - lastSeekTimestampRef.current;
    if (isSeekingRef.current && timeSinceSeek > 250) {
      isSeekingRef.current = false;
    }
    const changedEnough =
      Math.abs(target - lastAssignedTimeRef.current) >= 0.025;
    const decoderBusy = isSeekingRef.current || video.seeking;

    if (changedEnough || timeSinceSeek >= 50) {
      if (!decoderBusy) {
        pendingTargetRef.current = null;
        commitVideoSeek(target, now);
      } else {
        // Keep only the newest eased GSAP target while decoding.
        pendingTargetRef.current = target;
      }
    }

    const targetWasAssigned =
      Math.abs(lastAssignedTimeRef.current - target) < 0.025;
    const fullySettled =
      targetWasAssigned &&
      !isSeekingRef.current &&
      !video.seeking &&
      pendingTargetRef.current === null;

    if (fullySettled) {
      tourAnimatingRef.current = false;
      tourRafIdRef.current = null;
      return;
    }

    tourRafIdRef.current = requestAnimationFrame(tourSmoothingTick);
  }, [commitVideoSeek]);

  // Map GSAP progress to the active tour segment without an independent second smoother.
  // The rendered scroll controller on Page 2 already provides the authoritative smooth
  // motion; tourSmoothingTick dispatches seeks directly to the video element at a
  // decoder-friendly cadence, guaranteeing instant synchronization without fighting dampers.
  const seekTour = useCallback((progress) => {
    if (modeRef.current === PLAYBACK_MODES.PHASE1_AUTO) return;

    const seg = segmentRef.current;
    const p = Math.max(0, Math.min(1, progress));
    const target = seg.start + p * (seg.end - seg.start);

    tourTargetTimeRef.current = target;

    if (!tourAnimatingRef.current) {
      tourAnimatingRef.current = true;
      if (tourRafIdRef.current) {
        cancelAnimationFrame(tourRafIdRef.current);
      }
      tourRafIdRef.current = requestAnimationFrame(tourSmoothingTick);
    }
  }, [tourSmoothingTick]);

  // Seek to absolute timestamp in seconds
  const seekDirect = useCallback((seconds, immediate = false) => {
    const mode = modeRef.current;
    if (mode === PLAYBACK_MODES.PHASE1_AUTO) {
      return;
    }
    if (immediate) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      isAnimatingRef.current = false;
      velocityRef.current = 0;
      pendingTargetRef.current = null;
      targetTimeRef.current = seconds;
      currentSmoothedTimeRef.current = seconds;
      lastAssignedTimeRef.current = seconds;
      const video = videoRef.current;
      if (video && video.readyState >= 1) {
        try {
          video.currentTime = seconds;
        } catch { }
      }
      return;
    }
    scheduleSeek(seconds);
  }, [scheduleSeek]);

  const playLoop = useCallback(() => { }, []);
  const pause = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    isAnimatingRef.current = false;
    velocityRef.current = 0;
    pendingTargetRef.current = null;
    isSeekingRef.current = false;
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onMetadata = () => {
      if (video.duration && !Number.isNaN(video.duration)) {
        setDuration(video.duration);
      }
      setIsReady(true);

      // Only prime the decoder once on initial startup, never re-prime during navigation
      if (hasPrimedRef.current) return;
      hasPrimedRef.current = true;

      const target = targetTimeRef.current;

      // Prime the video decoder so seeking responds instantly on the very first scroll
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // If in a scroll mode, pause; if in auto mode, stay playing
            if (modeRef.current === PLAYBACK_MODES.PHASE1_SCROLL || modeRef.current === PLAYBACK_MODES.PHASE2_SCROLL) {
              video.pause();
            }
            if (target > 0) {
              video.currentTime = target;
              lastAssignedTimeRef.current = target;
              currentSmoothedTimeRef.current = target;
            } else {
              video.currentTime = 0;
              lastAssignedTimeRef.current = 0;
              currentSmoothedTimeRef.current = 0;
            }
            velocityRef.current = 0;
          })
          .catch(() => {
            if (target > 0) {
              video.currentTime = target;
              lastAssignedTimeRef.current = target;
              currentSmoothedTimeRef.current = target;
            } else {
              currentSmoothedTimeRef.current = 0;
            }
            velocityRef.current = 0;
          });
      } else {
        if (target > 0) {
          video.currentTime = target;
          lastAssignedTimeRef.current = target;
          currentSmoothedTimeRef.current = target;
        } else {
          currentSmoothedTimeRef.current = 0;
        }
        velocityRef.current = 0;
      }
    };

    const onError = (e) => {
      console.error('Persistent video playback error:', e);
      setHasVideoError(true);
    };

    // Continuous time monitor for Phase 1 auto handoff (if ever triggered)
    const onTimeUpdate = () => {
      const mode = modeRef.current;

      // Phase 1 Automatic Continuation (approaching 30.0s handoff)
      if (mode === PLAYBACK_MODES.PHASE1_AUTO) {
        if (video.currentTime >= 29.85) {
          if (onHandoffRef.current) {
            onHandoffRef.current();
          }
        }
      }
    };

    const onEnded = () => {
      // Phase 2 remains stopped on its final frame without auto-looping
    };

    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('canplay', onMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);

    if (video.readyState >= 1) {
      onMetadata();
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (tourRafIdRef.current) {
        cancelAnimationFrame(tourRafIdRef.current);
      }
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('canplay', onMetadata);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };
  }, [handleSeeked]);

  const value = {
    videoRef,
    playbackMode,
    setPlaybackMode,
    setOnHandoff,
    captureHandoff,
    getHandoffTimestamp,
    setSegment,
    seek,
    seekTour,
    seekDirect,
    playLoop,
    pause,
    hasVideoError,
    isReady,
    duration,
    hasSeenIntro,
    setHasSeenIntro,
  };

  return (
    <VideoTimelineContext.Provider value={value}>
      {/* Full-viewport Persistent Background Video */}
      <div className={styles.videoBackdrop} aria-hidden="true">
        <video
          ref={videoRef}
          src="/videos/vid-optimized-final.mp4"
          playsInline
          muted
          preload="auto"
          className={styles.video}
          onError={() => setHasVideoError(true)}
        />
        <div className={styles.overlayGradient} />

        {hasVideoError && (
          <div className={styles.videoErrorFallback}>
            <div className={styles.fallbackIcon}>✦</div>
            <h3 className={styles.fallbackTitle}>Magical Resort</h3>
            <p className={styles.fallbackText}>
              The sanctuary drone video could not be decoded. Please verify your browser's MP4 hardware acceleration.
            </p>
          </div>
        )}
      </div>

      {children}
    </VideoTimelineContext.Provider>
  );
}

export function useVideoTimeline() {
  const ctx = useContext(VideoTimelineContext);
  if (!ctx) {
    throw new Error('useVideoTimeline must be used within PersistentVideoProvider');
  }
  return ctx;
}
