/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* aged newsprint — 90s rap-magazine paper, lightest to darkest tan */
        ink: {
          950: '#E8DFC6',
          900: '#EFE7D2',
          850: '#F7F0DE',
          800: '#E5DABE',
          700: '#D3C5A0',
          600: '#B7A67C',
          500: '#94835C',
        },
        /* print ink — warm near-black for text on paper */
        cream: {
          100: '#211A0E',
          300: '#3D3421',
          500: '#675A3B',
          600: '#827452',
        },
        /* aged cover red — printed, slightly faded, never neon */
        rust: {
          300: '#C4703F',
          400: '#B0542A',
          500: '#9C4420',
          600: '#80371A',
          700: '#662C14',
        },
      },
      fontFamily: {
        display: ['"Archivo Black"', 'Archivo', 'system-ui', 'sans-serif'],
        sans: ['Archivo', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        kicker: '0.18em',
      },
    },
  },
  plugins: [],
}
