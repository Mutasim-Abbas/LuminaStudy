import type { Config } from 'tailwindcss';

/**
 * All colors map 1:1 to the CSS-variable design tokens in
 * src/styles/tokens.css, derived from the Lumina Study design system
 * (primary indigo #2E3192, secondary mint #98FFD9, tertiary #F0F4FF,
 * neutral slate #64748B). Components must use these utilities — never raw hex.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg-page)',
        'surface-1': 'var(--bg-surface-1)',
        'surface-2': 'var(--bg-surface-2)',
        tertiary: 'var(--bg-tertiary)',
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-active': 'var(--accent-active)',
        'accent-soft': 'var(--accent-soft)',
        'on-accent': 'var(--on-accent)',
        mint: 'var(--mint)',
        'mint-hover': 'var(--mint-hover)',
        'mint-soft': 'var(--mint-soft)',
        'on-mint': 'var(--on-mint)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        focusring: 'var(--focus-ring)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        success: 'var(--success)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        clay: 'var(--shadow-clay)',
        'clay-lg': 'var(--shadow-clay-lg)',
        'clay-pressed': 'var(--shadow-clay-pressed)',
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
