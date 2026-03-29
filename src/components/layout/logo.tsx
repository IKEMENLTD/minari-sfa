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
        x="3"
        y="5"
        width="20"
        height="22"
        rx="2"
        fill="#1d4ed8"
        opacity="0.3"
        transform="rotate(-6 3 5)"
      />
      {/* Middle card */}
      <rect
        x="5"
        y="4"
        width="20"
        height="22"
        rx="2"
        fill="#2563eb"
        opacity="0.55"
        transform="rotate(-2 5 4)"
      />
      {/* Front card */}
      <rect
        x="7"
        y="5"
        width="20"
        height="22"
        rx="2"
        fill="#2563eb"
      />
      {/* Bar chart on front card */}
      <rect x="11" y="16" width="3" height="7" rx="0.5" fill="white" opacity="0.9" />
      <rect x="15.5" y="13" width="3" height="10" rx="0.5" fill="white" opacity="0.9" />
      <rect x="20" y="10" width="3" height="13" rx="0.5" fill="white" opacity="0.9" />
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
