/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // "Conifer & Flag" — tokens resolve through CSS variables so the
        // .dark class flips the whole palette (see globals.css)
        ink: 'rgb(var(--ink) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        canopy: {
          50: 'rgb(var(--canopy-50) / <alpha-value>)',
          100: 'rgb(var(--canopy-100) / <alpha-value>)',
          600: 'rgb(var(--canopy-600) / <alpha-value>)',
          700: 'rgb(var(--canopy-700) / <alpha-value>)',
          800: 'rgb(var(--canopy-800) / <alpha-value>)',
        },
        bark: 'rgb(var(--bark) / <alpha-value>)',
        flag: {
          600: 'rgb(var(--flag-600) / <alpha-value>)',
          700: 'rgb(var(--flag-700) / <alpha-value>)',
        },
        line: 'rgb(var(--line) / <alpha-value>)',
        status: {
          healthy: '#1F9D4D',
          stressed: '#DB9E00',
          dead: '#C0392B',
          unknown: '#7C8894',
        },
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
      },
      boxShadow: {
        xs: '0 1px 2px rgb(20 33 26 / 0.06)',
        md: '0 4px 16px rgb(20 33 26 / 0.12)',
        lg: '0 12px 32px rgb(20 33 26 / 0.18)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.2, 0, 0, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '300ms',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
