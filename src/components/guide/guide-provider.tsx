'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { GUIDE_STEPS, type GuideStep } from './guide-steps';
import { setTourCompleted } from '@/lib/guide-storage';

interface GuideContextType {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  endTour: () => void;
}

const GuideContext = createContext<GuideContextType | null>(null);

export function GuideProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const totalSteps = GUIDE_STEPS.length;

  const endTour = useCallback(() => {
    setIsActive(false);
    setTourCompleted();
  }, []);

  const skipTour = useCallback(() => {
    setIsActive(false);
    setTourCompleted();
  }, []);

  const startTour = useCallback(() => {
    setIsActive(true);
    setCurrentStep(0);
    const firstStep: GuideStep = GUIDE_STEPS[0];
    if (firstStep.page !== pathname) {
      router.push(firstStep.page);
    }
  }, [pathname, router]);

  const nextStep = useCallback(() => {
    const nextIndex = currentStep + 1;
    if (nextIndex >= totalSteps) {
      endTour();
      return;
    }
    const next: GuideStep = GUIDE_STEPS[nextIndex];
    if (next.page !== pathname) {
      setCurrentStep(nextIndex);
      router.push(next.page);
    } else {
      setCurrentStep(nextIndex);
    }
  }, [currentStep, totalSteps, pathname, router, endTour]);

  const prevStep = useCallback(() => {
    const prevIndex = currentStep - 1;
    if (prevIndex < 0) return;
    const prev: GuideStep = GUIDE_STEPS[prevIndex];
    if (prev.page !== pathname) {
      setCurrentStep(prevIndex);
      router.push(prev.page);
    } else {
      setCurrentStep(prevIndex);
    }
  }, [currentStep, pathname, router]);

  useEffect(() => {
    if (!isActive) return;

    const current: GuideStep = GUIDE_STEPS[currentStep];
    if (current.page === pathname) return;

    const matchIndex = GUIDE_STEPS.findIndex(
      (step: GuideStep) => step.page === pathname
    );
    if (matchIndex !== -1) {
      setCurrentStep(matchIndex);
    }
  }, [pathname, isActive, currentStep]);

  const value = useMemo<GuideContextType>(
    () => ({
      isActive,
      currentStep,
      totalSteps,
      startTour,
      nextStep,
      prevStep,
      skipTour,
      endTour,
    }),
    [isActive, currentStep, totalSteps, startTour, nextStep, prevStep, skipTour, endTour]
  );

  return (
    <GuideContext.Provider value={value}>{children}</GuideContext.Provider>
  );
}

export function useGuide(): GuideContextType {
  const context = useContext(GuideContext);
  if (!context) {
    throw new Error('useGuide must be used within a GuideProvider');
  }
  return context;
}
