"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Convert accumulated input percentage into actual webpage scroll percentage.
function mapScrollInput(x) {
    if (x <= 5) return x;
    if (x < 30) return 5;
    return 5 + 0.5 * (x - 5);
}

// Critical second-order smooth damping with velocity capping
function smoothDamp(
    current,
    target,
    currentVelocity,
    smoothTime,
    maxSpeed,
    deltaTime
) {
    smoothTime = Math.max(0.0001, smoothTime);
    const omega = 2 / smoothTime;
    const x = omega * deltaTime;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    let change = current - target;
    const originalTo = target;

    const maxChange = maxSpeed * smoothTime;
    change = Math.max(-maxChange, Math.min(maxChange, change));
    target = current - change;

    const temp = (currentVelocity + omega * change) * deltaTime;
    let newVelocity = (currentVelocity - omega * temp) * exp;
    let output = target + (change + temp) * exp;

    // Prevent overshoot past original target
    if ((originalTo - current > 0) === (output > originalTo)) {
        output = originalTo;
        newVelocity = (output - originalTo) / deltaTime;
    }

    return { value: output, velocity: newVelocity };
}

if (typeof window !== "undefined") {
    window.__mapScrollInput = mapScrollInput;
}

export default function SmoothScroll({ children }) {
    const pathname = usePathname();
    const lenisRef = useRef(null);

    // --------------------------------------------------
    // 1. Shared Lenis instance
    // Page 1 retains its original smooth scrolling behavior.
    // On Page 2, virtualScroll callback prevents Lenis from
    // independently processing wheel/touch events.
    // --------------------------------------------------
    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger);

        if ("scrollRestoration" in history) {
            history.scrollRestoration = "manual";
        }

        const lenis = new Lenis({
            autoRaf: false,
            smoothWheel: true,
            lerp: 0.1,
            virtualScroll: (data) => {
                // When tour scroll limiter is active, prevent Lenis from
                // initiating its own independent scroll animation loop
                if (
                    typeof window !== "undefined" &&
                    window.__tourScrollLimiterActive
                ) {
                    if (data.event?.cancelable) {
                        data.event.preventDefault();
                    }
                    return false;
                }
                return true;
            },
        });

        lenisRef.current = lenis;
        window.__lenis = lenis;

        const handleScroll = () => {
            ScrollTrigger.update();
        };

        lenis.on("scroll", handleScroll);

        const update = (time) => {
            lenis.raf(time * 1000);
        };

        gsap.ticker.add(update);
        gsap.ticker.lagSmoothing(0);

        const handleBeforeUnload = () => {
            if ("scrollRestoration" in history) {
                history.scrollRestoration = "manual";
            }
            window.scrollTo(0, 0);
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        window.addEventListener("pagehide", handleBeforeUnload);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            window.removeEventListener("pagehide", handleBeforeUnload);

            lenis.off("scroll", handleScroll);
            gsap.ticker.remove(update);

            lenis.destroy();
            lenisRef.current = null;

            window.__lenis = null;
            window.__resetScrollLimiter = null;
            window.__getScrollLimiterState = null;
            window.__mapScrollInput = null;
            window.__tourScrollLimiterActive = false;

            gsap.ticker.lagSmoothing(500, 33);
        };
    }, []);

    // --------------------------------------------------
    // 2. Page 2 only: 3-System Architectural Scroll Engine
    //    A. Raw Input Accumulator & Gesture Tracker
    //    B. Restriction / Destination Mapping
    //    C. Rendered Scroll Controller & 3-Second Transition
    // --------------------------------------------------
    useEffect(() => {
        const isTourPage =
            pathname === "/tour" || pathname.startsWith("/tour/");

        if (!isTourPage) {
            if (typeof window !== "undefined") {
                window.__tourScrollLimiterActive = false;
            }
            return;
        }

        const lenis = lenisRef.current;
        if (!lenis) {
            return;
        }

        // Activate limiter flag for Lenis virtualScroll interceptor
        window.__tourScrollLimiterActive = true;

        // Prevent native browser touch compositor scrolling on Page 2
        const prevHtmlTouchAction = document.documentElement.style.touchAction;
        const prevBodyTouchAction = document.body.style.touchAction;
        document.documentElement.style.touchAction = "none";
        document.body.style.touchAction = "none";

        // Clean starting position on entry
        window.scrollTo(0, 0);
        lenis.scrollTo(0, { immediate: true, force: true });

        // --------------------------------------------------
        // STATE: 3 Clear, Independent Responsibilities
        // --------------------------------------------------
        // 1. Raw Input Accumulator & Gesture Tracker
        let accumulatedInput = 0;
        let gestureDirection = 0;
        let gestureBaseScroll = 0;
        let reverseThresholdAccumulator = 0;

        // 2. Restricted Destination
        let targetRestrictedScroll = 0;

        // 3. Rendered Webpage Position & Velocity
        let currentRenderedScroll = 0;
        let renderedVelocity = 0;
        let isProgrammaticScroll = false;
        let lastFrameTimestamp = performance.now();

        // Gesture timers and input tracking
        let idleTimer = null;
        const IDLE_RESET_DELAY = 200;

        let lastTouchY = 0;
        let lastTouchTime = 0;
        let touchVelocity = 0;

        const heldKeys = new Set();
        let keyTickRaf = null;

        const getMaxScroll = () => {
            return Math.max(
                1,
                document.documentElement.scrollHeight - window.innerHeight
            );
        };

        // System A: Idle Reset
        // After 200ms of inactivity, reset accumulated raw input to zero.
        // The next gesture starts seamlessly from the webpage's current scroll position.
        const resetGesture = () => {
            accumulatedInput = 0;
            gestureDirection = 0;
            reverseThresholdAccumulator = 0;
            // Anchor next gesture to current destination
            gestureBaseScroll = targetRestrictedScroll;

            if (idleTimer !== null) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
        };

        const scheduleIdleReset = () => {
            if (idleTimer !== null) {
                clearTimeout(idleTimer);
            }

            idleTimer = setTimeout(() => {
                // If keyboard keys are still held, the user has not stopped scrolling
                if (heldKeys.size > 0) return;
                resetGesture();
            }, IDLE_RESET_DELAY);
        };

        // System B: Core Restriction Mapping
        // Feeds raw user scroll input into the exact custom restriction formula
        // and updates targetRestrictedScroll. Never touches rendered position directly.
        const applyScrollInput = (rawDelta) => {
            if (!rawDelta || Math.abs(rawDelta) < 0.05) return;

            const direction = Math.sign(rawDelta);
            const absDelta = Math.abs(rawDelta);
            const maxScroll = getMaxScroll();

            // Handle direction reversal with hysteresis deadzone (prevents micro-jitter reset):
            // When user explicitly reverses scroll direction (> 20px opposite input),
            // immediately stop forward progress and begin reverse gesture from current rendered position!
            if (gestureDirection !== 0 && direction !== gestureDirection) {
                reverseThresholdAccumulator += absDelta;
                if (reverseThresholdAccumulator < 20) {
                    return; // Ignore sub-pixel trackpad/wheel jitter
                }
                accumulatedInput = 0;
                gestureBaseScroll = currentRenderedScroll;
                targetRestrictedScroll = currentRenderedScroll;
                renderedVelocity = 0;
                reverseThresholdAccumulator = 0;
            } else {
                reverseThresholdAccumulator = 0;
            }

            gestureDirection = direction;
            accumulatedInput += absDelta;

            const inputPercent = (accumulatedInput / maxScroll) * 100;
            const mappedPercent = mapScrollInput(inputPercent);
            const mappedDistance = (mappedPercent / 100) * maxScroll;

            const targetScroll =
                gestureBaseScroll + direction * mappedDistance;

            targetRestrictedScroll = Math.max(
                0,
                Math.min(maxScroll, targetScroll)
            );

            scheduleIdleReset();
        };

        // System C: Rendered Scroll Controller & 3-Second Transition
        // Smoothly advances currentRenderedScroll towards targetRestrictedScroll.
        // Uses time-based smoothDamp with speed calibrated so that the 12.5% step
        // across the 30% threshold takes approximately 3 seconds.
        const onSmoothTick = () => {
            const now = performance.now();
            let dt = (now - lastFrameTimestamp) / 1000;
            lastFrameTimestamp = now;

            // Clamp dt to avoid frame spikes after tab suspension
            if (dt <= 0 || dt > 0.1) {
                dt = 0.016;
            }

            const maxScroll = getMaxScroll();
            const clampedTarget = Math.max(
                0,
                Math.min(maxScroll, targetRestrictedScroll)
            );

            // Speed calibration: 12.5% threshold step (0.125 * maxScroll) takes ~3.0s
            const maxSpeed = (0.125 * maxScroll) / 2.2; // ~1420 px/s
            const smoothTime = 0.35; // smooth acceleration/deceleration time

            const diff = clampedTarget - currentRenderedScroll;

            if (Math.abs(diff) > 0.5 || Math.abs(renderedVelocity) > 1.0) {
                const res = smoothDamp(
                    currentRenderedScroll,
                    clampedTarget,
                    renderedVelocity,
                    smoothTime,
                    maxSpeed,
                    dt
                );

                currentRenderedScroll = res.value;
                renderedVelocity = res.velocity;

                // Render authoritative position to webpage and Lenis
                isProgrammaticScroll = true;
                window.scrollTo(0, currentRenderedScroll);
                lenis.scrollTo(currentRenderedScroll, {
                    immediate: true,
                    force: true,
                });
                isProgrammaticScroll = false;

                // Update ScrollTrigger to synchronize video timeline
                ScrollTrigger.update();
            } else if (currentRenderedScroll !== clampedTarget) {
                currentRenderedScroll = clampedTarget;
                renderedVelocity = 0;

                isProgrammaticScroll = true;
                window.scrollTo(0, currentRenderedScroll);
                lenis.scrollTo(currentRenderedScroll, {
                    immediate: true,
                    force: true,
                });
                isProgrammaticScroll = false;

                ScrollTrigger.update();
            }
        };

        gsap.ticker.add(onSmoothTick);

        // Native scroll guard: catches browser scrollbar dragging or history restorations
        const handleNativeScroll = () => {
            if (isProgrammaticScroll) return;
            if (Math.abs(window.scrollY - currentRenderedScroll) > 3) {
                isProgrammaticScroll = true;
                window.scrollTo(0, currentRenderedScroll);
                lenis.scrollTo(currentRenderedScroll, {
                    immediate: true,
                    force: true,
                });
                isProgrammaticScroll = false;
            }
        };

        // --------------------------------------------------
        // Input Interception: Mouse Wheel and Trackpad
        // --------------------------------------------------
        const handleWheel = (event) => {
            if (event.ctrlKey) return;

            let delta = event.deltaY;
            if (Math.abs(delta) < 0.1) return;

            // Completely prevent native browser wheel scrolling
            if (event.cancelable) {
                event.preventDefault();
            }
            event.stopImmediatePropagation();

            if (event.deltaMode === 1) {
                delta *= 16;
            } else if (event.deltaMode === 2) {
                delta *= window.innerHeight;
            }

            // Normalizing wheel/trackpad delta to give a natural, responsive feel on the 25k px page:
            // Standard mouse wheel notch (deltaY ~ 100) scaled by 3.5 gives 350px per click (~1.4% input)
            // Trackpad micro-increments (deltaY ~ 2-15) scale smoothly and continuously
            applyScrollInput(delta * 3.5);
        };

        // --------------------------------------------------
        // Input Interception: Touchscreen Swiping
        // --------------------------------------------------
        const handleTouchStart = (event) => {
            // Note: DO NOT call event.preventDefault() here! Calling preventDefault on touchstart
            // cancels the touch gesture in mobile browsers and suppresses subsequent touchmove events!
            if (!event.touches.length) return;
            lastTouchY = event.touches[0].clientY;
            lastTouchTime = performance.now();
            touchVelocity = 0;
        };

        const handleTouchMove = (event) => {
            if (!event.touches.length) return;

            if (event.cancelable) {
                event.preventDefault(); // Prevents native browser panning
            }
            event.stopImmediatePropagation();

            const currentY = event.touches[0].clientY;
            const now = performance.now();
            const dt = Math.max(1, now - lastTouchTime);
            const rawDelta = lastTouchY - currentY;

            touchVelocity = rawDelta / dt;
            lastTouchY = currentY;
            lastTouchTime = now;

            // Normalize touch delta: swipe of ~200px gives ~700px input (~2.8%)
            applyScrollInput(rawDelta * 3.5);
        };

        const handleTouchEnd = (event) => {
            event.stopImmediatePropagation();

            // Natural flick momentum if swiped with speed
            if (Math.abs(touchVelocity) > 0.15) {
                const momentum = touchVelocity * 350;
                applyScrollInput(momentum);
            }
            scheduleIdleReset();
        };

        // --------------------------------------------------
        // Input Interception: Keyboard Navigation
        // Preserves the slow, smooth, cinematic continuous hold
        // --------------------------------------------------
        const runKeyTick = () => {
            if (heldKeys.size === 0) {
                keyTickRaf = null;
                return;
            }

            // Steady continuous input rate while holding key (~2,100px input / sec)
            let stepDelta = 0;
            if (heldKeys.has("ArrowDown")) stepDelta += 35;
            if (heldKeys.has("ArrowUp")) stepDelta -= 35;

            if (stepDelta !== 0) {
                applyScrollInput(stepDelta);
            }

            keyTickRaf = requestAnimationFrame(runKeyTick);
        };

        const handleKeyDown = (event) => {
            const target = event.target;

            // Do not interfere with text inputs, textareas, selects, or buttons
            if (
                target instanceof HTMLElement &&
                target.closest(
                    'input, textarea, select, button, a, [contenteditable="true"], [role="button"]'
                )
            ) {
                return;
            }

            const maxScroll = getMaxScroll();
            let delta = 0;

            switch (event.key) {
                case "ArrowDown":
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    if (!heldKeys.has("ArrowDown")) {
                        heldKeys.add("ArrowDown");
                        applyScrollInput(35);
                        if (!keyTickRaf) {
                            keyTickRaf = requestAnimationFrame(runKeyTick);
                        }
                    }
                    return;

                case "ArrowUp":
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    if (!heldKeys.has("ArrowUp")) {
                        heldKeys.add("ArrowUp");
                        applyScrollInput(-35);
                        if (!keyTickRaf) {
                            keyTickRaf = requestAnimationFrame(runKeyTick);
                        }
                    }
                    return;

                case "PageDown":
                    delta = window.innerHeight * 1.5;
                    break;

                case "PageUp":
                    delta = -window.innerHeight * 1.5;
                    break;

                case " ":
                    delta = event.shiftKey
                        ? -window.innerHeight * 1.5
                        : window.innerHeight * 1.5;
                    break;

                case "Home":
                    delta = -maxScroll;
                    break;

                case "End":
                    delta = maxScroll;
                    break;

                default:
                    return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            applyScrollInput(delta);
        };

        const handleKeyUp = (event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                heldKeys.delete(event.key);
                if (heldKeys.size === 0) {
                    if (keyTickRaf) {
                        cancelAnimationFrame(keyTickRaf);
                        keyTickRaf = null;
                    }
                    scheduleIdleReset();
                }
            }
        };

        // --------------------------------------------------
        // Capture Phase Listeners on Window
        // --------------------------------------------------
        window.addEventListener("wheel", handleWheel, {
            passive: false,
            capture: true,
        });

        window.addEventListener("touchstart", handleTouchStart, {
            passive: true,
            capture: true,
        });

        window.addEventListener("touchmove", handleTouchMove, {
            passive: false,
            capture: true,
        });

        window.addEventListener("touchend", handleTouchEnd, {
            passive: false,
            capture: true,
        });

        window.addEventListener("keydown", handleKeyDown, {
            passive: false,
            capture: true,
        });

        window.addEventListener("keyup", handleKeyUp, {
            passive: true,
            capture: true,
        });

        window.addEventListener("scroll", handleNativeScroll, {
            passive: false,
            capture: true,
        });

        // --------------------------------------------------
        // Diagnostic Helpers
        // --------------------------------------------------
        window.__mapScrollInput = mapScrollInput;
        window.__resetScrollLimiter = resetGesture;
        window.__getScrollLimiterState = () => {
            const maxScroll = getMaxScroll();
            const inputPercent = (accumulatedInput / maxScroll) * 100;

            return {
                route: pathname,
                inputScroll: accumulatedInput,
                inputPercent,
                mappedPercent: mapScrollInput(inputPercent),
                actualScroll: currentRenderedScroll,
                targetScroll: targetRestrictedScroll,
                gestureBaseScroll,
                maxScroll,
            };
        };

        // --------------------------------------------------
        // Cleanup when leaving Page 2
        // --------------------------------------------------
        return () => {
            window.__tourScrollLimiterActive = false;

            document.documentElement.style.touchAction = prevHtmlTouchAction;
            document.body.style.touchAction = prevBodyTouchAction;

            window.removeEventListener("wheel", handleWheel, true);
            window.removeEventListener("touchstart", handleTouchStart, true);
            window.removeEventListener("touchmove", handleTouchMove, true);
            window.removeEventListener("touchend", handleTouchEnd, true);
            window.removeEventListener("keydown", handleKeyDown, true);
            window.removeEventListener("keyup", handleKeyUp, true);
            window.removeEventListener("scroll", handleNativeScroll, true);

            gsap.ticker.remove(onSmoothTick);

            if (keyTickRaf) {
                cancelAnimationFrame(keyTickRaf);
                keyTickRaf = null;
            }

            if (idleTimer !== null) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }

            heldKeys.clear();

            window.__resetScrollLimiter = null;
            window.__getScrollLimiterState = null;
        };
    }, [pathname]);

    return children;
}
