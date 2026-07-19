import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
}

const LETTERS = 'NEXORA'.split('');

type Phase = 'logoIn' | 'letters' | 'hold' | 'exitLetters' | 'exitLogo';

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [phase, setPhase] = useState<Phase>('logoIn');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('letters'), 600);      // logo done
    const t2 = setTimeout(() => setPhase('hold'), 2000);        // last letter settled
    const t3 = setTimeout(() => setPhase('exitLetters'), 4000); // start reverse dismantle
    const t4 = setTimeout(() => setPhase('exitLogo'), 5000);    // letters gone, logo starts fading
    const t5 = setTimeout(() => onFinish(), 7000);              // all done, show page

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearTimeout(t4); clearTimeout(t5);
    };
  }, [onFinish]);

  // Each letter's animation phase
  const getLetterState = (i: number): 'hidden' | 'entering' | 'visible' | 'exiting' => {
    if (phase === 'logoIn') return 'hidden';
    if (phase === 'letters') {
      // letter enters after its stagger delay
      return i * 120 < 800 ? 'entering' : 'hidden';
    }
    if (phase === 'hold') return 'visible';
    if (phase === 'exitLetters') {
      // exit in reverse: last letter goes first
      const exitIdx = LETTERS.length - 1 - i;
      return `exiting` as any;
    }
    return 'hidden';
  };

  // Compute style per letter based on its current state
  const letterStyle = (i: number): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontSize: '4rem',
      fontWeight: 800,
      color: '#0f172a',
      letterSpacing: '0.02em',
      transitionProperty: 'opacity, transform, filter',
      transitionDuration: '500ms',
      transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      display: 'inline-block',
    };

    switch (phase) {
      case 'logoIn':
        return { ...base, opacity: 0, transform: 'translateY(40px) rotateX(50deg)', filter: 'blur(6px)' };

      case 'letters': {
        const shouldShow = i * 120 < 800; // approximation for stagger check
        return {
          ...base,
          opacity: shouldShow ? 1 : 0,
          transform: shouldShow ? 'translateY(0) rotateX(0deg)' : 'translateY(40px) rotateX(50deg)',
          filter: shouldShow ? 'blur(0px)' : 'blur(6px)',
          transitionDelay: `${i * 120}ms`,
        };
      }

      case 'hold':
        return {
          ...base,
          opacity: 1,
          transform: 'translateY(0) rotateX(0deg)',
          filter: 'blur(0px)',
          transitionDelay: '0ms',
        };

      case 'exitLetters': {
        // Reverse order: last letter (index 5 = X) exits first
        const exitOrder = LETTERS.length - 1 - i;
        return {
          ...base,
          opacity: 0,
          transform: 'translateY(-30px) rotateX(-40deg)',
          filter: 'blur(4px)',
          transitionDelay: `${exitOrder * 100}ms`,
        };
      }

      case 'exitLogo':
        return {
          ...base,
          opacity: 0,
          transform: 'translateY(-30px) rotateX(-40deg)',
          filter: 'blur(8px)',
          transitionDelay: '0ms',
        };

      default:
        return base;
    }
  };

  const showTagline = phase === 'hold';
  const fadingOut = phase === 'exitLetters' || phase === 'exitLogo';

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(180deg, #f0f4ff 0%, #f8fafc 40%, #ffffff 100%)',
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 1800ms cubic-bezier(0.4, 0, 0.2, 1)',
        transitionDelay: fadingOut ? '600ms' : '0ms',
      }}
    >
      {/* Decorative glow circles */}
      <div
        className="absolute rounded-full transition-all duration-1500"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
          width: '600px', height: '600px',
          top: '50%', left: '50%',
          transform: `translate(-50%, -50%) scale(${fadingOut ? 1.3 : 1})`,
          opacity: fadingOut ? 0 : 1,
        }}
      />
      <div
        className="absolute rounded-full transition-all duration-1500"
        style={{
          background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)',
          width: '400px', height: '400px',
          top: 'calc(50% + 80px)', left: 'calc(50% - 100px)',
          transform: `translate(-50%, -50%) scale(${fadingOut ? 0.8 : 1})`,
          opacity: fadingOut ? 0 : 1,
        }}
      />

      {/* Logo */}
      <img
        src="/nexora-logo.png"
        alt=""
        className="relative z-10 mb-10"
        style={{
          width: phase === 'logoIn' ? '0px' : '200px',
          height: phase === 'logoIn' ? '0px' : '200px',
          opacity: phase === 'logoIn' ? 0 : phase === 'exitLogo' ? 0 : 1,
          transform: phase === 'logoIn'
            ? 'scale(0) rotate(-30deg)'
            : phase === 'exitLogo'
              ? 'scale(0.8) rotate(10deg)'
              : 'scale(1) rotate(0deg)',
          filter: phase === 'exitLogo' ? 'blur(16px)' : 'blur(0px)',
          transition: 'all 800ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      />

      {/* Letter-by-letter brand name */}
      <div className="relative z-10 flex items-center gap-1">
        {LETTERS.map((letter, i) => (
          <span key={i} style={letterStyle(i)}>
            {letter}
          </span>
        ))}
      </div>

      {/* Tagline */}
      <p
        className="relative z-10 text-center mt-5 transition-all duration-500"
        style={{
          opacity: showTagline ? 0.5 : 0,
          transform: showTagline ? 'translateY(0)' : 'translateY(12px)',
          transitionDelay: showTagline ? '400ms' : '0ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <span
          className="text-xs tracking-[0.4em] uppercase font-medium"
          style={{ color: '#64748b' }}
        >
          One Core &middot; All Commerce
        </span>
      </p>
    </div>
  );
};
