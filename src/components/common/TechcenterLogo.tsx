import React from 'react';

interface TechcenterLogoProps {
  variant?: 'white' | 'color' | 'dark';
  collapsed?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const TechcenterLogo: React.FC<TechcenterLogoProps> = ({
  variant = 'white',
  collapsed = false,
  className = '',
  size = 'md'
}) => {
  const isWhite = variant === 'white';
  const mainColor = isWhite ? '#FFFFFF' : '#031E3C';
  const accentColor = isWhite ? '#FFFFFF' : '#FF6B00';

  const iconHeight = size === 'sm' ? 24 : size === 'lg' ? 36 : 28;
  const iconWidth = Math.round(iconHeight * 1.35);

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Official techcenter+ Icon Graphic */}
      <svg
        width={iconWidth}
        height={iconHeight}
        viewBox="0 0 108 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-300"
      >
        {/* Level 1: Top Bar & vertical connector */}
        <rect x="30" y="4" width="48" height="10" rx="5" fill={mainColor} />
        <rect x="50" y="12" width="8" height="10" rx="3" fill={mainColor} />

        {/* Level 2: Upper Wide Bar */}
        <rect x="4" y="22" width="100" height="10" rx="5" fill={mainColor} />

        {/* Level 3: Dot + Right Bar */}
        <circle cx="10" cy="45" r="7" fill={accentColor} />
        <rect x="26" y="40" width="78" height="10" rx="5" fill={mainColor} />

        {/* Level 4: Extended Lower Bar */}
        <rect x="4" y="58" width="92" height="10" rx="5" fill={mainColor} />

        {/* Level 5: Bottom Center Bar */}
        <rect x="40" y="72" width="38" height="8" rx="4" fill={mainColor} />
        <rect x="55" y="66" width="8" height="8" rx="2" fill={mainColor} />
      </svg>

      {/* Official techcenter+ Typography Wordmark */}
      {!collapsed && (
        <div className="flex items-center tracking-tight leading-none">
          <span 
            className="font-bold text-lg sm:text-xl lowercase"
            style={{ 
              fontFamily: "'Poppins', sans-serif",
              color: mainColor,
              letterSpacing: '-0.02em'
            }}
          >
            techcenter
          </span>
          <span 
            className="font-bold text-xl sm:text-2xl ml-0.5"
            style={{ 
              fontFamily: "'Poppins', sans-serif",
              color: isWhite ? '#FF6B00' : '#FF6B00',
              lineHeight: 1
            }}
          >
            +
          </span>
        </div>
      )}
    </div>
  );
};
