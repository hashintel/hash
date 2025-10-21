import { definePreset } from "@pandacss/dev";

export default definePreset({
  name: "@hashintel/ds-theme",
  theme: {
    extend: {
      // Core tokens are the foundational design tokens.
      // https://panda-css.com/docs/theming/tokens#core-tokens
      tokens: {
        colors: {
          brand: {
            DEFAULT: {
              "50": {
                value: "#e3f2ff",
              },
              "100": {
                value: "#b3daff",
              },
              "200": {
                value: "#81c1ff",
              },
              "300": {
                value: "#4fa8ff",
              },
              "400": {
                value: "#1d8fff",
              },
              "500": {
                value: "#0077e6",
              },
              "600": {
                value: "#005bb4",
              },
              "700": {
                value: "#003f82",
              },
              "800": {
                value: "#002551",
              },
              "900": {
                value: "#000b21",
              },
            },
            dark: {
              "50": {
                value: "#001a4d",
              },
              "100": {
                value: "#b3daff",
              },
              "200": {
                value: "#81c1ff",
              },
              "300": {
                value: "#4fa8ff",
              },
              "400": {
                value: "#1d8fff",
              },
              "500": {
                value: "#0077e6",
              },
              "600": {
                value: "#005bb4",
              },
              "700": {
                value: "#003f82",
              },
              "800": {
                value: "#002551",
              },
              "900": {
                value: "#000b21",
              },
            },
          },
          gray: {
            DEFAULT: {
              "0": {
                value: "#FAFAFA",
              },
              "10": {
                value: "#F5F5F5",
              },
              "20": {
                value: "#E5E5E5",
              },
              "30": {
                value: "#D9D9D9",
              },
              "35": {
                value: "#C7C7C7",
              },
              "40": {
                value: "#A3A3A3",
              },
              "50": {
                value: "#737373",
              },
              "60": {
                value: "#525252",
              },
              "70": {
                value: "#404040",
              },
              "80": {
                value: "#262626",
              },
              "90": {
                value: "#171717",
              },
              "95": {
                value: "#0A0A0A",
              },
            },
            dark: {
              "0": {
                value: "#070A0D",
              },
              "10": {
                value: "#1D2836",
              },
              "20": {
                value: "#374151",
              },
              "30": {
                value: "#4B5563",
              },
              "35": {
                value: "#4B5563",
              },
              "40": {
                value: "#6B7280",
              },
              "50": {
                value: "#9CA3AF",
              },
              "60": {
                value: "#DDE0E4",
              },
              "70": {
                value: "#E5E7EB",
              },
              "80": {
                value: "#F0F2F4",
              },
              "90": {
                value: "#F6F8F9",
              },
              "95": {
                value: "#F6F8F9",
              },
            },
          },
          blue: {
            DEFAULT: {
              "0": {
                value: "#E6F3FE",
              },
              "70": {
                value: "#0666C6",
              },
              "140": {
                value: "#266DF0",
              },
            },
            dark: {
              "0": {
                value: "#071E69",
              },
              "140": {
                value: "#629DF0",
              },
            },
          },
          red: {
            DEFAULT: {
              "60": {
                value: "#DC1818",
              },
              "140": {
                value: "#EF4444",
              },
            },
            dark: {
              "0": {
                value: "#7F1D1D",
              },
              "140": {
                value: "#F87171",
              },
            },
          },
          green: {
            DEFAULT: {
              "50": {
                value: "#19A874",
              },
            },
            dark: {
              "0": {
                value: "#054D27",
              },
            },
          },
          purple: {
            DEFAULT: {
              "50": {
                value: "#6633EE",
              },
            },
            dark: {
              "0": {
                value: "#1D0A6B",
              },
            },
          },
          yellow: {
            DEFAULT: {
              "50": {
                value: "#EAB308",
              },
            },
            dark: {
              "0": {
                value: "#713F12",
              },
            },
          },
          orange: {
            DEFAULT: {
              "50": {
                value: "#F97316",
              },
            },
            dark: {
              "0": {
                value: "#7C2D12",
              },
            },
          },
          pink: {
            DEFAULT: {
              "50": {
                value: "#EC4899",
              },
            },
            dark: {
              "0": {
                value: "#831843",
              },
            },
          },
        },
        fonts: {
          display: {
            value: ["Inter Display", "Inter", "sans-serif"],
          },
          body: {
            value: ["Inter", "sans-serif"],
          },
          mono: {
            value: ["Menlo", "monospace"],
          },
        },
        fontWeights: {
          normal: {
            value: 400,
          },
          medium: {
            value: 500,
          },
          semibold: {
            value: 600,
          },
        },
        fontSizes: {
          xs: {
            value: "12px",
          },
          sm: {
            value: "14px",
          },
          base: {
            value: "16px",
          },
          lg: {
            value: "18px",
          },
          xl: {
            value: "20px",
          },
          "2xl": {
            value: "24px",
          },
          "3xl": {
            value: "30px",
          },
          "4xl": {
            value: "36px",
          },
        },
        lineHeights: {
          xs: {
            value: "18px",
          },
          sm: {
            value: "21px",
          },
          base: {
            value: "24px",
          },
          lg: {
            value: "27px",
          },
        },
        spacing: {
          "0": {
            value: "0px",
          },
          "1": {
            value: "4px",
          },
          "2": {
            value: "8px",
          },
          "3": {
            value: "12px",
          },
          "4": {
            value: "16px",
          },
          "5": {
            value: "20px",
          },
          "6": {
            value: "24px",
          },
          "7": {
            value: "28px",
          },
          "8": {
            value: "32px",
          },
          "9": {
            value: "36px",
          },
          "10": {
            value: "40px",
          },
          "11": {
            value: "44px",
          },
          px: {
            value: "1px",
          },
          "0.5": {
            value: "2px",
          },
          "1.5": {
            value: "6px",
          },
          "2.5": {
            value: "10px",
          },
          "3.5": {
            value: "14px",
          },
        },
        radii: {
          none: {
            value: "0px",
          },
          sm: {
            value: "2px",
          },
          DEFAULT: {
            value: "4px",
          },
          md: {
            value: "6px",
          },
          lg: {
            value: "8px",
          },
          "10px": {
            value: "10px",
          },
          xl: {
            value: "12px",
          },
          "2xl": {
            value: "16px",
          },
          "3xl": {
            value: "24px",
          },
          full: {
            value: "9999px",
          },
        },
        shadows: {
          sm: {
            value: "0px 1px 2px rgba(0, 0, 0, 0.05)",
          },
          md: {
            value: "0px 4px 6px rgba(0, 0, 0, 0.1)",
          },
          lg: {
            value: "0px 10px 15px rgba(0, 0, 0, 0.15)",
          },
          xl: {
            value: "0px 20px 25px rgba(0, 0, 0, 0.2)",
          },
          "2xl": {
            value: "0px 25px 50px rgba(0, 0, 0, 0.25)",
          },
        },
      },
    },

    // Semantic tokens are tokens that are designed to be used in a specific context.
    // In most cases, the value of a semantic token references to an existing token.
    // https://panda-css.com/docs/theming/tokens#semantic-tokens
    semanticTokens: {},

    // Text styles combine typography tokens into reusable text styles
    textStyles: {
      "text-xs": {
        value: {
          fontFamily: "Inter, sans-serif",
          fontSize: "12px",
          fontWeight: "400",
          lineHeight: "normal",
        },
      },
      "text-sm": {
        value: {
          fontFamily: "Inter, sans-serif",
          fontSize: "14px",
          fontWeight: "400",
          lineHeight: "normal",
        },
      },
      "text-base": {
        value: {
          fontFamily: "Inter, sans-serif",
          fontSize: "16px",
          fontWeight: "400",
          lineHeight: "normal",
        },
      },
      "text-lg": {
        value: {
          fontFamily: "Inter, sans-serif",
          fontSize: "18px",
          fontWeight: "400",
          lineHeight: "normal",
        },
      },
      "text-3xl": {
        value: {
          fontFamily: "Inter Display, Inter, sans-serif",
          fontSize: "30px",
          fontWeight: "400",
          lineHeight: "normal",
        },
      },
      "text-xs-leading": {
        value: {
          fontFamily: "Inter, sans-serif",
          fontSize: "12px",
          fontWeight: "400",
          lineHeight: "1.5",
        },
      },
      "text-sm-leading": {
        value: {
          fontFamily: "Inter, sans-serif",
          fontSize: "14px",
          fontWeight: "400",
          lineHeight: "1.5",
        },
      },
      "text-base-leading": {
        value: {
          fontFamily: "Inter, sans-serif",
          fontSize: "16px",
          fontWeight: "400",
          lineHeight: "1.5",
        },
      },
      "text-lg-leading": {
        value: {
          fontFamily: "Inter, sans-serif",
          fontSize: "18px",
          fontWeight: "400",
          lineHeight: "1.5",
        },
      },
    },
  },
});
