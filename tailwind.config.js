/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0B0A08',
          900: '#12100D',
          850: '#171411',
          800: '#1D1A15',
          700: '#2A251E',
          600: '#3B342A',
          500: '#4E4638',
        },
        cream: {
          100: '#EFE7D7',
          300: '#D8CDB8',
          500: '#A99C84',
          600: '#7D7260',
        },
        rust: {
          300: '#E08B4E',
          400: '#D97A3D',
          500: '#C05B24',
          600: '#9A4A1E',
          700: '#7A3A18',
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
