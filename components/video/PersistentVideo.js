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

export function PersistentVideoProvider({ children }) {
  const videoRef = useRef(null);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [duration, setDuration] = useState(170.32);

  // Active segment settings (Phase 1 default 0-30s; Phase 2 default 30-170.2s)
  const isTourInitial = typeof window !== 'undefined' && window.location.pathname.startsWith('/tour');
  const segmentRef = useRef({
    start: isTourInitial ? 30 : 0,
    end: isTourInitial ? 170.2 : 30,
  });

  // Authoritative Playback State Machine
  const modeRef = useRef(isTourInitial ? PLAYBACK_MODES.PHASE2_SCROLL : PLAYBACK_MODES.PHASE1_SCROLL);
  const [playbackMode, setPlaybackModeState] = useState(modeRef.current);

  const targetTimeRef = useRef(isTourInitial ? 30 : 0);
  const isSeekingRef = useRef(false);
  const lastSeekTimestampRef = useRef(0);
  const rafIdRef = useRef(null);
  const lastAssignedTimeRef = useRef(-1);
  const onHandoffRef = useRef(null);
  const isLoopingRef = useRef(false);

  // Set the handoff callback for automatic Phase 1 -> Phase 2 transition
  const setOnHandoff = useCallback((cb) => {
    onHandoffRef.current = cb;
  }, []);

  // Central Mode Switcher: handles clean transitions between scroll-control and autoplay
  const setPlaybackMode = useCallback((newMode) => {
    if (modeRef.current === newMode) return;

    const prevMode = modeRef.current;
    modeRef.current = newMode;
    setPlaybackModeState(newMode);

    const video = videoRef.current;
    if (!video) return;

    if (newMode === PLAYBACK_MODES.PHASE1_AUTO || newMode === PLAYBACK_MODES.PHASE2_AUTO_LOOP) {
      // Entering Auto Mode: cancel pending seek rAFs and play smoothly
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      isSeekingRef.current = false;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } else if (newMode === PLAYBACK_MODES.PHASE1_SCROLL || newMode === PLAYBACK_MODES.PHASE2_SCROLL) {
      // Entering Scroll Mode: pause playback so scrubbing has exclusive control
      if (!video.paused) {
        video.pause();
      }
    }
  }, []);

  // Central, high-performance seek dispatcher for scroll-controlled modes
  const performSeek = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Never seek while in auto-play modes to prevent fighting
    const mode = modeRef.current;
    if (mode === PLAYBACK_MODES.PHASE1_AUTO || mode === PLAYBACK_MODES.PHASE2_AUTO_LOOP) {
      return;
    }

    const dur = video.duration && !Number.isNaN(video.duration) ? video.duration : 170.32;
    const target = Math.max(0, Math.min(targetTimeRef.current, dur - 0.05));

    // Avoid redundant seeks when difference is negligible (< 12ms)
    if (Math.abs(video.currentTime - target) < 0.012 && Math.abs(lastAssignedTimeRef.current - target) < 0.01) {
      return;
    }

    const now = performance.now();
    // Non-blocking seek queue: if a seek is currently in flight and fresh (< 50ms), queue on next rAF
    if (isSeekingRef.current && (now - lastSeekTimestampRef.current < 50)) {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(performSeek);
      return;
    }

    try {
      isSeekingRef.current = true;
      lastSeekTimestampRef.current = now;
      lastAssignedTimeRef.current = target;
      video.currentTime = target;
    } catch {
      isSeekingRef.current = false;
    }
  }, []);

  // Schedule seek on next animation frame
  const scheduleSeek = useCallback((time) => {
    // Only schedule seeks in scroll-controlled modes
    const mode = modeRef.current;
    if (mode === PLAYBACK_MODES.PHASE1_AUTO || mode === PLAYBACK_MODES.PHASE2_AUTO_LOOP) {
      return;
    }

    targetTimeRef.current = time;

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      performSeek();
    });
  }, [performSeek]);

  const handleSeeked = useCallback(() => {
    isSeekingRef.current = false;
    const video = videoRef.current;
    if (!video) return;

    // If in scroll mode and target changed while seek was resolving, dispatch next frame
    const mode = modeRef.current;
    if (mode === PLAYBACK_MODES.PHASE1_SCROLL || mode === PLAYBACK_MODES.PHASE2_SCROLL) {
      if (Math.abs(video.currentTime - targetTimeRef.current) >= 0.015) {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
        }
        rafIdRef.current = requestAnimationFrame(() => {
          performSeek();
        });
      }
    }
  }, [performSeek]);

  // Set the active segment for the current route
  const setSegment = useCallback((config) => {
    const start = config.start ?? 0;
    const end = config.end ?? 30;

    segmentRef.current = {
      start,
      end,
    };

    const video = videoRef.current;
    if (video) {
      const current = video.currentTime;
      // Only seek if video is far outside bounds (e.g. entering /tour directly at 0s)
      // If it is already around the handoff timestamp (29-31s), DO NOT re-seek to avoid decode flicker!
      if (current < start - 1.2 || current > end + 1.2) {
        targetTimeRef.current = start;
        if (video.readyState >= 1) {
          video.currentTime = start;
          lastAssignedTimeRef.current = start;
        }
      }
    } else {
      targetTimeRef.current = start;
    }
  }, []);

  // Seek relative to current segment progress [0.0 - 1.0]
  const seek = useCallback((progress) => {
    // Locked out during automatic continuation / loop zones
    const mode = modeRef.current;
    if (mode === PLAYBACK_MODES.PHASE1_AUTO || mode === PLAYBACK_MODES.PHASE2_AUTO_LOOP) {
      return;
    }

    const seg = segmentRef.current;
    const p = Math.max(0, Math.min(1, progress));
    const target = seg.start + p * (seg.end - seg.start);
    scheduleSeek(target);
  }, [scheduleSeek]);

  // Seek to absolute timestamp in seconds
  const seekDirect = useCallback((seconds) => {
    const mode = modeRef.current;
    if (mode === PLAYBACK_MODES.PHASE1_AUTO || mode === PLAYBACK_MODES.PHASE2_AUTO_LOOP) {
      return;
    }
    scheduleSeek(seconds);
  }, [scheduleSeek]);

  const playLoop = useCallback(() => {}, []);
  const pause = useCallback(() => {
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
            } else {
              video.currentTime = 0;
              lastAssignedTimeRef.current = 0;
            }
          })
          .catch(() => {
            if (target > 0) {
              video.currentTime = target;
              lastAssignedTimeRef.current = target;
            }
          });
      } else {
        if (target > 0) {
          video.currentTime = target;
          lastAssignedTimeRef.current = target;
        }
      }
    };

    const onError = (e) => {
      console.error('Persistent video playback error:', e);
      setHasVideoError(true);
    };

    // Continuous time monitor for Phase 1 auto handoff & Phase 2 T1 -> T2 -> T1 looping
    const onTimeUpdate = () => {
      const mode = modeRef.current;

      // Mode B: Phase 1 Automatic Continuation (approaching 30.0s handoff)
      if (mode === PLAYBACK_MODES.PHASE1_AUTO) {
        if (video.currentTime >= 29.85) {
          if (onHandoffRef.current) {
            onHandoffRef.current();
          }
        }
      }

      // Mode D: Phase 2 Automatic Beach Loop (T1 = 30.0s, T2 = 170.2s)
      if (mode === PLAYBACK_MODES.PHASE2_AUTO_LOOP) {
        const T1 = 30.0;
        const T2 = 170.0;
        if (video.currentTime >= T2 || video.ended) {
          if (!isLoopingRef.current) {
            isLoopingRef.current = true;
            video.currentTime = T1;
            if (video.paused) {
              video.play().catch(() => {});
            }
            setTimeout(() => {
              isLoopingRef.current = false;
            }, 300);
          }
        }
      }
    };

    const onEnded = () => {
      if (modeRef.current === PLAYBACK_MODES.PHASE2_AUTO_LOOP) {
        video.currentTime = 30.0;
        video.play().catch(() => {});
      }
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
    setSegment,
    seek,
    seekDirect,
    playLoop,
    pause,
    hasVideoError,
    isReady,
    duration,
  };

  return (
    <VideoTimelineContext.Provider value={value}>
      {/* Full-viewport Persistent Background Video */}
      <div className={styles.videoBackdrop} aria-hidden="true">
        <video
          ref={videoRef}
          src="/videos/vid.mp4"
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
