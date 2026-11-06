import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Colors come from CSS variables in app/globals.css, so the user's
      // palette and dark mode apply everywhere without dark: variants.
      colors: {
        paper: "var(--paper)",
        surface: "var(--surface)",
        fg: "var(--text)",
        muted: "var(--muted)",
        line: "var(--line)",
        danger: "var(--danger)",
        wash: "var(--wash)",
        pigment: "var(--pigment)",
        ink: "var(--ink)",
        "on-ink": "var(--on-ink)",
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
