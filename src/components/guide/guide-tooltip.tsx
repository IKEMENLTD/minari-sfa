'use client';

import { useMemo } from 'react';
import { useGuide } from './guide-provider';
import type { GuideStep } from './guide-steps';

interface GuideTooltipProps {
  targetRect: DOMRect | null;
  step: GuideStep;
}

type ResolvedPosition = 'top' | 'bottom' | 'left' | 'right';

const GAP = 16;
const TOOLTIP_MAX_WIDTH = 384; // max-w-sm

function resolvePosition(
  position: GuideStep['position'],
  rect: DOMRect | null
): ResolvedPosition {
  if (position !== 'auto') return position;
  if (!rect) return 'bottom';

  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  return spaceBelow >= spaceAbove ? 'bottom' : 'top';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function GuideTooltip({ targetRect, step }: GuideTooltipProps) {
  const { nextStep, prevStep, skipTour, endTour, currentStep, totalSteps } =
    useGuide();

  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  const isMobile =
    typeof window !== 'undefined' ? window.innerWidth < 768 : false;

  const { style, resolved } = useMemo(() => {
    // Mobile: fixed bottom
    if (isMobile) {
      return {
        style: {
          position: 'fixed' as const,
          bottom: 0,
          left: 0,
          right: 0,
        },
        resolved: 'bottom' as ResolvedPosition,
      };
    }

    // No target: center of screen
    if (!targetRect) {
      return {
        style: {
          position: 'fixed' as const,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        },
        resolved: 'bottom' as ResolvedPosition,
      };
    }

    const pos = resolvePosition(step.position, targetRect);
    const computedStyle: Record<string, string | number> = {
      position: 'absolute',
    };

    switch (pos) {
      case 'bottom': {
        computedStyle.top = targetRect.bottom + GAP;
        const idealLeft =
          targetRect.left + targetRect.width / 2 - TOOLTIP_MAX_WIDTH / 2;
        computedStyle.left = clamp(
          idealLeft,
          8,
          window.innerWidth - TOOLTIP_MAX_WIDTH - 8
        );
        break;
      }
      case 'top': {
        computedStyle.bottom = window.innerHeight - targetRect.top + GAP;
        const idealLeft =
          targetRect.left + targetRect.width / 2 - TOOLTIP_MAX_WIDTH / 2;
        computedStyle.left = clamp(
          idealLeft,
          8,
          window.innerWidth - TOOLTIP_MAX_WIDTH - 8
        );
        break;
      }
      case 'right': {
        computedStyle.left = targetRect.right + GAP;
        computedStyle.top = clamp(
          targetRect.top,
          8,
          window.innerHeight - 200
        );
        break;
      }
      case 'left': {
        computedStyle.right =
          window.innerWidth - targetRect.left + GAP;
        computedStyle.top = clamp(
          targetRect.top,
          8,
          window.innerHeight - 200
        );
        break;
      }
    }

    return { style: computedStyle, resolved: pos };
  }, [targetRect, step.position, isMobile]);

  return (
    <div
      className={`${isMobile ? 'w-full rounded-t-xl' : 'max-w-sm w-[calc(100vw-2rem)]'} bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg p-4`}
      style={style}
    >
      {/* Arrow pointer (non-mobile only, with target) */}
      {!isMobile && targetRect && (
        <ArrowPointer position={resolved} />
      )}

      <h3 className="font-bold text-base text-[var(--color-text)] mb-1">
        {step.title}
      </h3>
      <p className="text-sm text-[var(--color-text-secondary)] mb-4">
        {step.description}
      </p>

      {/* Progress dots */}
      <div className="flex items-center gap-1.5 mb-3">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentStep
                ? 'bg-[var(--color-accent)]'
                : 'bg-[var(--color-border)]'
            }`}
          />
        ))}
        <span className="ml-2 text-xs text-[var(--color-text-secondary)]">
          {currentStep + 1}/{totalSteps}
        </span>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={skipTour}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors px-2 py-1"
        >
          スキップ
        </button>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              type="button"
              onClick={prevStep}
              className="text-sm border border-[var(--color-border)] text-[var(--color-text)] px-3 py-1.5 rounded hover:bg-[var(--color-border)]/30 transition-colors"
            >
              前へ
            </button>
          )}
          <button
            type="button"
            onClick={isLast ? endTour : nextStep}
            className="text-sm bg-[var(--color-accent)] text-white px-3 py-1.5 rounded hover:opacity-90 transition-opacity"
          >
            {isLast ? '完了' : '次へ'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ArrowPointer({ position }: { position: ResolvedPosition }) {
  const base = 'absolute w-0 h-0';

  switch (position) {
    case 'bottom':
      return (
        <div
          className={`${base} -top-2 left-1/2 -translate-x-1/2`}
          style={{
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderBottom: '8px solid var(--color-surface)',
          }}
        />
      );
    case 'top':
      return (
        <div
          className={`${base} -bottom-2 left-1/2 -translate-x-1/2`}
          style={{
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid var(--color-surface)',
          }}
        />
      );
    case 'right':
      return (
        <div
          className={`${base} top-4 -left-2`}
          style={{
            borderTop: '8px solid transparent',
            borderBottom: '8px solid transparent',
            borderRight: '8px solid var(--color-surface)',
          }}
        />
      );
    case 'left':
      return (
        <div
          className={`${base} top-4 -right-2`}
          style={{
            borderTop: '8px solid transparent',
            borderBottom: '8px solid transparent',
            borderLeft: '8px solid var(--color-surface)',
          }}
        />
      );
  }
}
