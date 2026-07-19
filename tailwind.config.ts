import type { Config } from 'tailwindcss';

/**
 * Material Design 3 tonal palette + type scale, matching the Stitch "Smart
 * Academic Toolkit" reference exactly. Colors map to CSS-variable tokens in
 * src/styles/tokens.css — components must use these utilities, never raw hex.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        'primary-container': 'var(--primary-container)',
        'on-primary': 'var(--on-primary)',
        'on-primary-container': 'var(--on-primary-container)',
        'primary-fixed': 'var(--primary-fixed)',
        'primary-fixed-dim': 'var(--primary-fixed-dim)',
        'on-primary-fixed': 'var(--on-primary-fixed)',
        'on-primary-fixed-variant': 'var(--on-primary-fixed-variant)',
        'surface-tint': 'var(--surface-tint)',

        secondary: 'var(--secondary)',
        'secondary-container': 'var(--secondary-container)',
        'on-secondary': 'var(--on-secondary)',
        'on-secondary-container': 'var(--on-secondary-container)',
        'secondary-fixed': 'var(--secondary-fixed)',
        'secondary-fixed-dim': 'var(--secondary-fixed-dim)',
        'on-secondary-fixed': 'var(--on-secondary-fixed)',
        'on-secondary-fixed-variant': 'var(--on-secondary-fixed-variant)',

        background: 'var(--background)',
        'on-background': 'var(--on-background)',
        surface: 'var(--surface)',
        'surface-dim': 'var(--surface-dim)',
        'surface-bright': 'var(--surface-bright)',
        'surface-container-lowest': 'var(--surface-container-lowest)',
        'surface-container-low': 'var(--surface-container-low)',
        'surface-container': 'var(--surface-container)',
        'surface-container-high': 'var(--surface-container-high)',
        'surface-container-highest': 'var(--surface-container-highest)',
        'surface-variant': 'var(--surface-variant)',
        'on-surface': 'var(--on-surface)',
        'on-surface-variant': 'var(--on-surface-variant)',

        outline: 'var(--outline)',
        'outline-variant': 'var(--outline-variant)',

        error: 'var(--error)',
        'error-container': 'var(--error-container)',
        'on-error': 'var(--on-error)',
        'on-error-container': 'var(--on-error-container)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        'display-xl': ['64px', { lineHeight: '72px', letterSpacing: '-0.02em', fontWeight: '800' }],
        'headline-lg': ['40px', { lineHeight: '48px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-md': ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'title-lg': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-lg': ['14px', { lineHeight: '20px', letterSpacing: '0.02em', fontWeight: '600' }],
        'label-sm': ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
      borderRadius: {
        DEFAULT: 'var(--radius-default)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        card: 'var(--shadow-card)',
        flashcard: 'var(--shadow-flashcard)',
        modal: 'var(--shadow-modal)',
        nav: 'var(--shadow-nav)',
      },
      spacing: {
        xs: 'var(--space-xs)',
        sm: 'var(--space-sm)',
        'stack-sm': 'var(--space-stack-sm)',
        'stack-md': 'var(--space-stack-md)',
        'stack-xl': 'var(--space-stack-xl)',
        gutter: 'var(--space-gutter)',
        'margin-desktop': 'var(--space-margin-desktop)',
      },
      maxWidth: {
        'container-max': 'var(--container-max)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '320ms',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
