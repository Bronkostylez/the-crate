/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* xerox black — the photocopied night ground, darkest to lightest slate */
        ink: {
          950: '#0C0D14',
          900: '#11121B',
          850: '#181924',
          800: '#1F212E',
          700: '#2A2C3A',
          600: '#3A3D4C',
          500: '#565A6B',
        },
        /* bone white — handwriting and paper scraps on the dark ground */
        cream: {
          100: '#EFE9DC',
          300: '#CBC5B6',
          500: '#9D9789',
          600: '#7C766C',
        },
        /* marker pens — red is the star, tape-yellow and cop-light blue support */
        marker: {
          yellow: '#E9C46A',
          olive: '#8A8B5C',
          blue: '#7C9AAC',
        },
        /* xerox red — the big block letters and marker outlines from the video */
        rust: {
          300: '#F06545',
          400: '#E04424',
          500: '#C93018',
          600: '#A32412',
          700: '#7E1C0E',
        },
      },
      fontFamily: {
        display: ['"Caveat"', 'cursive'],
        block: ['"Archivo Black"', 'sans-serif'],
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
