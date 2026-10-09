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
        // --- Redesign palette (see design_handoff_invictus_redesign) --------
        // Navy header and ink, blue for primary actions and key numbers,
        // yellow for highlights. Named so new markup can reach for them
        // directly; the older invictus.* tokens below are remapped onto the
        // same system so existing components follow without being rewritten.
        ink: {
          DEFAULT: '#0E1A3A',
          soft: '#2C3452',
          muted: '#4A5270',
          dim: '#6B7290',
          placeholder: '#8A90A8',
        },
        brand: {
          DEFAULT: '#1F4FFF',
          hover: '#1A43DB',
          tint: '#E8EEFF',
        },
        sun: {
          DEFAULT: '#FFC83D',
          soft: '#FFE7A3',
          panel: '#FFF3CC',
          ink: '#5C4300',
          deep: '#4A3800',
        },
        line: {
          DEFAULT: '#DDE1EC',
          row: '#ECEEF4',
          fill: '#E4E7EF',
          check: '#C3C9DC',
        },
        danger: {
          DEFAULT: '#E5383B',
          deep: '#C1272D',
          tint: '#FDE3E4',
        },
        ok: {
          DEFAULT: '#2BD18A',
          deep: '#119A5E',
          darker: '#0E7A4A',
          tint: '#E3F8EE',
        },
        header: {
          bg: '#0E1A3A',
          text: '#B6C0E2',
          dim: '#8C98C2',
          divider: '#2A3866',
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
          DEFAULT: '#E5383B',
          dim: '#C1272D',
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
