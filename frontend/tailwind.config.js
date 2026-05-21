/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "sans-serif"],
        mono: ["'DM Mono'", "monospace"],
      },
      colors: {
        // Design-System Farben
        brand: {
          50:  "#f0f4ff",
          100: "#e0e9ff",
          200: "#c7d7fe",
          300: "#a5b8fc",
          400: "#8193f8",
          500: "#6270f1",
          600: "#4e54e5",
          700: "#3f42cc",
          800: "#3438a5",
          900: "#2f3382",
          950: "#1c1e4d",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted:   "#f8f9fc",
          subtle:  "#f1f3f9",
          border:  "#e4e7ef",
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        "card-hover": "0 4px 12px 0 rgb(0 0 0 / 0.08), 0 2px 4px -1px rgb(0 0 0 / 0.06)",
        panel: "0 0 0 1px rgb(0 0 0 / 0.06), 0 2px 8px 0 rgb(0 0 0 / 0.08)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};
