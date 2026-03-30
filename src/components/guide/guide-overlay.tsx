'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useGuide } from './guide-provider';
import { GUIDE_STEPS } from './guide-steps';
import { GuideTooltip } from './guide-tooltip';

export function GuideOverlay() {
  const { isActive, currentStep } = useGuide();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateRect = useCallback((element: Element) => {
    const rect = element.getBoundingClientRect();
    setTargetRect(rect);
  }, []);

  const findAndTrackElement = useCallback(
    (selector: string) => {
      // Clean up previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      const startTime = Date.now();
      const maxRetryMs = 2000;

      const tryFind = () => {
        const element = document.querySelector(selector);

        if (element) {
          updateRect(element);

          // Scroll into view if off-screen
          const rect = element.getBoundingClientRect();
          const isOffScreen =
            rect.bottom < 0 ||
            rect.top > window.innerHeight ||
            rect.right < 0 ||
            rect.left > window.innerWidth;

          if (isOffScreen) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Re-measure after scroll
            requestAnimationFrame(() => {
              updateRect(element);
            });
          }

          // Observe resize
          const resizeObserver = new ResizeObserver(() => {
            updateRect(element);
          });
          resizeObserver.observe(element);
          observerRef.current = resizeObserver;

          return;
        }

        // Retry with rAF until max time
        if (Date.now() - startTime < maxRetryMs) {
          retryTimerRef.current = setTimeout(() => {
            requestAnimationFrame(tryFind);
          }, 100);
        } else {
          // Element not found, show overlay without spotlight
          setTargetRect(null);
        }
      };

      requestAnimationFrame(tryFind);
    },
    [updateRect]
  );

  // Track current step's target element
  useEffect(() => {
    if (!isActive) {
      setTargetRect(null);
      return;
    }

    const step = GUIDE_STEPS[currentStep];
    if (!step) return;

    findAndTrackElement(step.targetSelector);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [isActive, currentStep, findAndTrackElement]);

  // Re-measure on scroll and resize
  useEffect(() => {
    if (!isActive) return;

    const handleUpdate = () => {
      const step = GUIDE_STEPS[currentStep];
      if (!step) return;
      const element = document.querySelector(step.targetSelector);
      if (element) {
        updateRect(element);
      }
    };

    window.addEventListener('scroll', handleUpdate, { passive: true });
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isActive, currentStep, updateRect]);

  if (!isActive) return null;

  const step = GUIDE_STEPS[currentStep];
  if (!step) return null;

  return (
    <div className="fixed inset-0 z-[9998]">
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="guide-mask">
            <rect fill="white" width="100%" height="100%" />
            {targetRect && (
              <rect
                fill="black"
                x={targetRect.x - 8}
                y={targetRect.y - 8}
                width={targetRect.width + 16}
                height={targetRect.height + 16}
                rx="8"
              />
            )}
          </mask>
        </defs>
        <rect
          fill="rgba(0,0,0,0.6)"
          mask="url(#guide-mask)"
          width="100%"
          height="100%"
        />
      </svg>

      <GuideTooltip targetRect={targetRect} step={step} />
    </div>
  );
}
