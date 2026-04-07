interface LogoIconProps {
  size?: number;
  className?: string;
}

interface LogoProps {
  size?: number;
  className?: string;
}

/** Icon-only: signal/pulse representing deal tracking */
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
      {/* Background */}
      <rect width="32" height="32" rx="4" fill="#050505" />
      {/* Pulse line */}
      <polyline
        points="4,20 9,20 12,10 16,24 20,14 24,18 28,18"
        stroke="#3b82f6"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Dot accent */}
      <circle cx="16" cy="24" r="1.5" fill="#ccff00" opacity="0.8" />
    </svg>
  );
}

/** Full logo: icon + "DEAL BOARD" text */
function Logo({ size = 28, className }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <LogoIcon size={size} />
      <span className="text-sm font-semibold text-text tracking-tight uppercase">
        DEAL BOARD
      </span>
    </div>
  );
}

export { LogoIcon, Logo };
