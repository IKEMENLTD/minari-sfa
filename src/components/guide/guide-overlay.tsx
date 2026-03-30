'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useGuide } from './guide-provider';
import { GUIDE_STEPS } from './guide-steps';
import { GuideTooltip } from './guide-tooltip';

export function GuideOverlay() {
  const { isActive, currentStep, skipTour } = useGuide();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateRect = useCallback((element: Element) => {
    const rect = element.getBoundingClientRect();
    // Skip hidden elements (display:none returns all zeros)
    if (rect.width === 0 && rect.height === 0) {
      setTargetRect(null);
      return;
    }
    setTargetRect(rect);
  }, []);

  const getSelector = useCallback(() => {
    const step = GUIDE_STEPS[currentStep];
    if (!step) return null;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return (isMobile && step.mobileTargetSelector) || step.targetSelector;
  }, [currentStep]);

  const findAndTrackElement = useCallback(
    (selector: string) => {
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
          const rect = element.getBoundingClientRect();
          // Skip hidden elements
          if (rect.width === 0 && rect.height === 0) {
            if (Date.now() - startTime < maxRetryMs) {
              retryTimerRef.current = setTimeout(() => {
                requestAnimationFrame(tryFind);
              }, 100);
            } else {
              setTargetRect(null);
            }
            return;
          }

          updateRect(element);

          // Scroll into view if off-screen
          const isOffScreen =
            rect.bottom < 0 ||
            rect.top > window.innerHeight ||
            rect.right < 0 ||
            rect.left > window.innerWidth;

          if (isOffScreen) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            requestAnimationFrame(() => {
              updateRect(element);
            });
          }

          const resizeObserver = new ResizeObserver(() => {
            updateRect(element);
          });
          resizeObserver.observe(element);
          observerRef.current = resizeObserver;
          return;
        }

        if (Date.now() - startTime < maxRetryMs) {
          retryTimerRef.current = setTimeout(() => {
            requestAnimationFrame(tryFind);
          }, 100);
        } else {
          setTargetRect(null);
        }
      };

      requestAnimationFrame(tryFind);
    },
    [updateRect]
  );

  useEffect(() => {
    if (!isActive) {
      setTargetRect(null);
      return;
    }

    const selector = getSelector();
    if (!selector) return;

    findAndTrackElement(selector);

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
  }, [isActive, currentStep, findAndTrackElement, getSelector]);

  useEffect(() => {
    if (!isActive) return;

    const handleUpdate = () => {
      const selector = getSelector();
      if (!selector) return;
      const element = document.querySelector(selector);
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
  }, [isActive, currentStep, updateRect, getSelector]);

  // Escape key to exit tour
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipTour();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, skipTour]);

  if (!isActive) return null;

  const step = GUIDE_STEPS[currentStep];
  if (!step) return null;

  return (
    <div className="fixed inset-0 z-[9998]">
      {/* Click dark area to exit */}
      <div
        className="absolute inset-0"
        onClick={skipTour}
        role="presentation"
      />
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
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
