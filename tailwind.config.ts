import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // src/lib is scanned too: several modules there hold the class strings for
    // a status pill or a colour swatch (incidents, assignments, inspections,
    // reports, the project board). Leaving it out meant any class used ONLY in
    // one of those files was never generated, so it silently did nothing.
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Indirection vars so the active theme can swap typefaces: dark keeps
        // Poppins/Orbitron/Inter; the light theme switches to Nunito throughout.
        body: ['var(--font-body-active)', 'sans-serif'],
        headline: ['var(--font-body-active)', 'sans-serif'],
        code: ['monospace'],
        display: [
          'var(--font-display-active)',
          'ui-sans-serif',
          'sans-serif',
        ],
        sans: [
          'var(--font-sans-active)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: [
          'var(--font-jetbrains)',
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          '"SF Mono"',
          '"Cascadia Mono"',
          '"Roboto Mono"',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      // The whole app was set in bold and extra-bold. The look now is a quiet
      // one: regular text, medium for emphasis, semibold for headings and
      // nothing heavier. Remapping the scale here turns every existing
      // font-bold / font-extrabold down at once, rather than editing the
      // several hundred places that ask for them.
      fontWeight: {
        medium: '400',
        semibold: '500',
        bold: '500',
        extrabold: '600',
        black: '600',
      },
      // Minimal re-skin: no neon glow. "glow-subtle" is now an extremely soft
      // depth shadow; louder variants collapse to that so every existing
      // shadow-glow-* class reads calm without per-site edits.
      boxShadow: {
        'glow-none': 'none',
        'glow-subtle': 'none',
        'glow-strong': 'none',
        'glow-caution': 'none',
        'glow-alert': 'none',
      },
      dropShadow: {
        'glow-none': 'none',
        'glow-subtle': 'none',
        'glow-strong': 'none',
        'glow-caution': 'none',
      },
      colors: {
        // --- Palette ---------------------------------------------------------
        // Warm cream paper with near-black ink. There is one accent and it is
        // the ink itself: primary buttons, the active nav mark and key numbers
        // are all black, the way they would be on a printed page. Mustard is
        // kept as the single highlight colour. The names (brand, sun, line…)
        // are unchanged from the navy-and-blue scheme this replaces, so every
        // component follows without being rewritten.
        ink: {
          DEFAULT: '#1C1A17',
          soft: '#33302B',
          muted: '#55514A',
          dim: '#6F6A61',
          placeholder: '#938D82',
        },
        brand: {
          DEFAULT: '#1C1A17',
          hover: '#000000',
          tint: '#EAE5D8',
        },
        // The highlight, turned right down from mustard to a sand that sits
        // inside the cream rather than on top of it.
        sun: {
          DEFAULT: '#DCCB9A',
          soft: '#EDE4C8',
          panel: '#F2ECD9',
          ink: '#4A4230',
          deep: '#5F5846',
        },
        line: {
          DEFAULT: '#DFD9CB',
          row: '#EBE6DA',
          fill: '#E7E2D5',
          check: '#C8C1B0',
        },
        danger: {
          DEFAULT: '#CF2F2B',
          deep: '#A92420',
          tint: '#F9E1DC',
        },
        ok: {
          DEFAULT: '#2BB67A',
          deep: '#11855A',
          darker: '#0E6B47',
          tint: '#E1F2E7',
        },
        // The phone's top bar and menu sheet, and the desktop rail.
        header: {
          bg: '#FCFAF5',
          text: '#55514A',
          dim: '#938D82',
          divider: '#DFD9CB',
        },
        invictus: {
          base: 'rgb(var(--invictus-base) / <alpha-value>)',
          surface: 'rgb(var(--invictus-surface) / <alpha-value>)',
          raised: 'rgb(var(--invictus-raised) / <alpha-value>)',
          // Brand accent as channels so the light (scrapbook) theme can swap
          // crimson for its dark-blue ink without touching components.
          crimson: 'rgb(var(--invictus-crimson) / <alpha-value>)',
          'crimson-bright': 'rgb(var(--invictus-crimson-bright) / <alpha-value>)',
        },
        alert: {
          DEFAULT: '#CF2F2B',
          dim: '#A92420',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'scan-beam': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        scanlines: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 8px' },
        },
        waveform: {
          '0%, 100%': { transform: 'scaleY(0.25)' },
          '50%': { transform: 'scaleY(1)' },
        },
        'float-sparkle': {
          '0%': { transform: 'translateY(0) scale(0.6)', opacity: '0' },
          '30%': { opacity: '1' },
          '100%': { transform: 'translateY(-26px) scale(1)', opacity: '0' },
        },
        'cloud-drift': {
          '0%, 100%': { transform: 'translateX(-10px)' },
          '50%': { transform: 'translateX(10px)' },
        },
        'rain-fall': {
          '0%': { transform: 'translateY(0)', opacity: '0.9' },
          '100%': { transform: 'translateY(36px)', opacity: '0' },
        },
        'snow-fall': {
          '0%': { transform: 'translate(0, 0)', opacity: '0.9' },
          '100%': { transform: 'translate(10px, 46px)', opacity: '0' },
        },
        'bolt-flash': {
          '0%, 100%': { opacity: '0.25' },
          '45%': { opacity: '0.25' },
          '50%': { opacity: '1' },
          '55%': { opacity: '0.25' },
          '75%': { opacity: '0.85' },
          '80%': { opacity: '0.25' },
        },
        'fog-drift': {
          '0%, 100%': { transform: 'translateX(-12px)', opacity: '0.5' },
          '50%': { transform: 'translateX(12px)', opacity: '0.85' },
        },
        'card-in': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-alert': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        marquee: 'marquee 28s linear infinite',
        'scan-beam': 'scan-beam 3s ease-in-out infinite',
        scanlines: 'scanlines 9s linear infinite',
        'pulse-alert': 'pulse-alert 1.4s ease-in-out infinite',
        waveform: 'waveform 1s ease-in-out infinite',
        'float-sparkle': 'float-sparkle 3s ease-in-out infinite',
        'cloud-drift': 'cloud-drift 9s ease-in-out infinite',
        'rain-fall': 'rain-fall 0.9s linear infinite',
        'snow-fall': 'snow-fall 4s linear infinite',
        'bolt-flash': 'bolt-flash 3.2s ease-in-out infinite',
        'fog-drift': 'fog-drift 10s ease-in-out infinite',
        'card-in': 'card-in 0.42s ease-out both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
