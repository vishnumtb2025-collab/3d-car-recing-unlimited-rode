import React from 'react';
import { CarStatsScriptableObject } from '../data/carData';

interface Props {
  car: CarStatsScriptableObject;
  className?: string;
}

export const CarThumbnailSvg: React.FC<Props> = ({ car, className = 'w-full h-full' }) => {
  const { primaryColor, secondaryColor, bodyStyle, stripeStyle, interiorColor } = car;

  if (bodyStyle === 'fortuner_suv' || bodyStyle === 'mahindra_thar') {
    const isThar = bodyStyle === 'mahindra_thar';
    return (
      <svg viewBox="0 0 160 88" className={className} fill="none">
        {/* Floor shadow */}
        <ellipse cx="82" cy="74" rx="60" ry="8" fill="rgba(0,0,0,0.65)" />
        {/* Upper cabin */}
        <path
          d={isThar ? 'M50 18 H128 L132 42 H42 Z' : 'M40 21 H128 L140 42 H28 Z'}
          fill={isThar ? secondaryColor : primaryColor}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1.5"
        />
        {/* Tinted Windows */}
        <path d="M52 23 H84 V39 H44 Z" fill="#0f172a" />
        <path d="M90 23 H122 L126 39 H90 Z" fill="#0f172a" />
        {/* Lower body */}
        <rect x="20" y="39" width="122" height="25" rx="6" fill={primaryColor} />
        {/* Spare tyre on Mahindra Thar rear */}
        {isThar && <rect x="139" y="34" width="7" height="22" rx="2" fill="#18181b" />}
        {/* Grille & LED Headlight */}
        <rect x="18" y="42" width="10" height="15" rx="2" fill="#111827" />
        <rect x="20" y="44" width="8" height="4.5" rx="1" fill="#fef08a" />
        {/* Wheel arches */}
        <path d="M32 64 A16 16 0 0 1 64 64 Z" fill="#090d16" />
        <path d="M98 64 A16 16 0 0 1 130 64 Z" fill="#090d16" />
        {/* Wheels */}
        <circle cx="48" cy="64" r="13" fill="#18181b" stroke="#cbd5e1" strokeWidth="2.5" />
        <circle cx="48" cy="64" r="6" fill="#94a3b8" />
        <circle cx="114" cy="64" r="13" fill="#18181b" stroke="#cbd5e1" strokeWidth="2.5" />
        <circle cx="114" cy="64" r="6" fill="#94a3b8" />
      </svg>
    );
  }

  if (bodyStyle === 'truck') {
    return (
      <svg viewBox="0 0 160 88" className={className} fill="none">
        <ellipse cx="82" cy="75" rx="64" ry="7" fill="rgba(0,0,0,0.65)" />
        <rect x="76" y="14" width="6" height="44" rx="2" fill="#e2e8f0" />
        <path d="M34 22 H80 V62 H18 V40 L34 36 Z" fill={primaryColor} />
        <path d="M37 26 H68 V39 H35 Z" fill="#090d16" />
        <rect x="80" y="44" width="64" height="18" rx="3" fill="#1e293b" />
        <rect x="16" y="41" width="7" height="18" rx="1.5" fill="#e2e8f0" />
        {[40, 100, 126].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="64" r="12" fill="#18181b" stroke="#cbd5e1" strokeWidth="2.5" />
            <circle cx={cx} cy="64" r="5" fill="#94a3b8" />
          </g>
        ))}
      </svg>
    );
  }

  if (bodyStyle === 'bus') {
    return (
      <svg viewBox="0 0 160 88" className={className} fill="none">
        <ellipse cx="80" cy="75" rx="66" ry="7" fill="rgba(0,0,0,0.65)" />
        <rect x="16" y="22" width="128" height="42" rx="7" fill={primaryColor} />
        <rect x="20" y="27" width="120" height="15" rx="3" fill="#090d16" />
        <rect x="16" y="46" width="128" height="5" fill={secondaryColor} />
        <rect x="16" y="53" width="8" height="6" rx="1.5" fill="#fef08a" />
        {[44, 118].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="65" r="11.5" fill="#18181b" stroke="#cbd5e1" strokeWidth="2.5" />
            <circle cx={cx} cy="65" r="5" fill="#94a3b8" />
          </g>
        ))}
      </svg>
    );
  }

  // Ferrari F8 Tributo / Jaguar F-Type Convertible / Lamborghini Huracan EVO / Sports / Sedan
  const isConvertible = bodyStyle === 'jaguar_ftype';
  return (
    <svg viewBox="0 0 160 88" className={className} fill="none">
      {/* Ground shadow */}
      <ellipse cx="80" cy="73" rx="64" ry="8" fill="rgba(0,0,0,0.7)" />
      {/* Rear Spoiler */}
      {!isConvertible && (
        <path
          d="M132 33 L146 30 L144 36 L130 42 Z"
          fill={secondaryColor === '#ffffff' ? primaryColor : '#1e293b'}
        />
      )}
      {/* Aerodynamic Canopy or Open Convertible Cabin with Visible Tan Leather Seat */}
      {isConvertible ? (
        <>
          <path d="M48 42 L62 27 H67 L55 42 Z" fill="#bae6fd" />
          <path d="M76 31 H88 L84 43 H72 Z" fill={interiorColor || '#d6b48a'} />
        </>
      ) : (
        <>
          <path
            d="M50 28 C66 20, 98 20, 118 35 L102 44 H42 Z"
            fill="rgba(15,23,42,0.82)"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1"
          />
          {/* Visible Tan Leather Seat Headrest inside cockpit */}
          <rect x="68" y="29" width="12" height="12" rx="3" fill={interiorColor || '#c27838'} />
        </>
      )}
      {/* Main Sculpted Supercar Body */}
      <path
        d="M14 54 C16 42, 32 38, 50 37 L122 36 C136 36, 145 42, 146 54 L144 63 H16 Z"
        fill={primaryColor}
      />
      {/* Gloss highlight line */}
      <path
        d="M22 46 Q75 39 136 44"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Dual White Racing Stripes on Hood for Apex R1 (Ferrari F8 Tributo) */}
      {stripeStyle === 'dual_white' && (
        <>
          <path d="M18 51 L52 38 L58 38 L25 53 Z" fill="#ffffff" />
          <path d="M26 52 L60 38 L66 38 L33 54 Z" fill="#ffffff" />
        </>
      )}
      {stripeStyle === 'cyber_trim' && (
        <path d="M20 58 H140" stroke={secondaryColor} strokeWidth="3" strokeLinecap="round" />
      )}
      {/* Side Air Intake */}
      <polygon points="74,45 98,43 92,56 68,56" fill="#090d16" />
      {/* Swept LED Headlight */}
      <polygon points="18,48 34,45 30,51 16,52" fill="#ffffff" />
      {/* Wheels with Red Brake Calipers */}
      <circle cx="45" cy="62" r="12.5" fill="#111827" stroke="#cbd5e1" strokeWidth="2.5" />
      <circle cx="45" cy="62" r="5.5" fill="#dc2626" />
      <circle cx="117" cy="62" r="13" fill="#111827" stroke="#cbd5e1" strokeWidth="2.5" />
      <circle cx="117" cy="62" r="5.5" fill="#dc2626" />
    </svg>
  );
};
