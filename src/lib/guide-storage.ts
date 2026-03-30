const WELCOME_DISMISS_KEY = 'sd_welcome_dismiss_until';
const TOUR_COMPLETED_KEY = 'sd_tour_completed';

export function isWelcomeDismissed(): boolean {
  const value = localStorage.getItem(WELCOME_DISMISS_KEY);
  if (!value) return false;

  const dismissUntil = new Date(value).getTime();
  if (Number.isNaN(dismissUntil)) return false;

  return dismissUntil > Date.now();
}

export function dismissWelcome(days: number): void {
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  localStorage.setItem(WELCOME_DISMISS_KEY, until.toISOString());
}

export function isTourCompleted(): boolean {
  return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
}

export function setTourCompleted(): void {
  localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
}
