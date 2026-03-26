interface LogoIconProps {
  size?: number;
  className?: string;
}

interface LogoProps {
  size?: number;
  className?: string;
}

/** Icon-only version: stacked cards representing a deck */
function LogoIcon({ size = 28, className }: LogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Back card */}
      <rect
        x="6"
        y="4"
        width="18"
        height="24"
        rx="2"
        fill="#1d4ed8"
        opacity="0.35"
      />
      {/* Middle card */}
      <rect
        x="9"
        y="3"
        width="18"
        height="24"
        rx="2"
        fill="#2563eb"
        opacity="0.6"
      />
      {/* Front card */}
      <rect
        x="8"
        y="6"
        width="18"
        height="24"
        rx="2"
        fill="#2563eb"
      />
      {/* Bar chart lines on front card */}
      <rect x="12" y="18" width="3" height="8" rx="0.5" fill="white" opacity="0.9" />
      <rect x="17" y="14" width="3" height="12" rx="0.5" fill="white" opacity="0.9" />
      <rect x="22" y="10" width="3" height="16" rx="0.5" fill="white" opacity="0.9" />
    </svg>
  );
}

/** Full logo: icon + "SALES DECK" text */
function Logo({ size = 28, className }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <LogoIcon size={size} />
      <span className="text-sm font-semibold text-text tracking-tight uppercase">
        SALES DECK
      </span>
    </div>
  );
}

export { LogoIcon, Logo };
