import { definePreset } from "@pandacss/dev";
export default definePreset({
  name: "@hashintel/ds-theme",
  theme: {
    tokens: {
      colors: {
        border: {
          neutral: {
            hover: {
              value: "{colors.core.gray.35}",
            },
            default: {
              value: "{colors.core.gray.20}",
            },
            subtle: {
              value: "{colors.core.gray.20}",
            },
            muted: {
              value: "{colors.core.gray.10}",
            },
            active: {
              value: "{colors.core.gray.90}",
            },
            emphasis: {
              value: "{colors.core.gray.30}",
            },
          },
          status: {
            info: {
              value: "{colors.core.blue.10}",
            },
            caution: {
              value: "{colors.core.yellow.10}",
            },
            warning: {
              value: "{colors.core.orange.10}",
            },
            critical: {
              value: "{colors.core.red.10}",
            },
            success: {
              value: "{colors.core.green.10}",
            },
          },
        },
        text: {
          primary: {
            value: "{colors.core.gray.90}",
          },
          secondary: {
            value: "{colors.core.gray.70}",
          },
          tertiary: {
            value: "{colors.core.gray.50}",
          },
          disabled: {
            value: "{colors.core.gray.40}",
          },
          inverted: {
            value: "{colors.core.neutral.white}",
          },
          semantic: {
            info: {
              value: "{colors.core.blue.90}",
            },
            success: {
              value: "{colors.core.green.80}",
            },
            warning: {
              value: "{colors.core.orange.80}",
            },
            critical: {
              value: "{colors.core.red.80}",
            },
          },
          link: {
            value: "{colors.core.custom.60}",
          },
          linkhover: {
            value: "{colors.core.custom.70}",
          },
        },
        surface: {
          default: {
            value: "{colors.core.neutral.white}",
          },
          emphasis: {
            value: "{colors.core.gray.20}",
          },
          subtle: {
            value: "{colors.core.gray.20}",
          },
          alt: {
            value: "{colors.core.gray.00}",
          },
          muted: {
            value: "{colors.core.gray.10}",
          },
          inverted: {
            value: "{colors.core.gray.90}",
          },
        },
        bg: {
          brand: {
            subtle: {
              default: {
                value: "{colors.core.custom.00}",
              },
              hover: {
                value: "{colors.core.custom.10}",
              },
              active: {
                value: "{colors.core.custom.00}",
              },
            },
            bold: {
              default: {
                value: "{colors.core.custom.50}",
              },
              hover: {
                value: "{colors.core.custom.60}",
              },
              selected: {
                value: "{colors.core.custom.60}",
              },
              active: {
                value: "{colors.core.custom.50}",
              },
            },
          },
          neutral: {
            subtle: {
              default: {
                value: "{colors.core.neutral.white}",
              },
              hover: {
                value: "{colors.core.gray.10}",
              },
              active: {
                value: "{colors.core.gray.20}",
              },
              selected: {
                value: "{colors.core.gray.10}",
              },
            },
            bold: {
              default: {
                value: "{colors.core.gray.80}",
              },
              hover: {
                value: "{colors.core.gray.70}",
              },
              active: {
                value: "{colors.core.gray.80}",
              },
              selected: {
                value: "{colors.core.gray.70}",
              },
            },
          },
          status: {
            info: {
              subtle: {
                default: {
                  value: "{colors.core.blue.00}",
                },
                hover: {
                  value: "{colors.core.blue.10}",
                },
                active: {
                  value: "{colors.core.blue.00}",
                },
              },
            },
            success: {
              subtle: {
                default: {
                  value: "{colors.core.green.00}",
                },
                hover: {
                  value: "{colors.core.green.10}",
                },
                active: {
                  value: "{colors.core.green.00}",
                },
              },
            },
            caution: {
              subtle: {
                default: {
                  value: "{colors.core.yellow.00}",
                },
                hover: {
                  value: "{colors.core.yellow.10}",
                },
                active: {
                  value: "{colors.core.yellow.00}",
                },
              },
            },
            warning: {
              subtle: {
                default: {
                  value: "{colors.core.orange.00}",
                },
                hover: {
                  value: "{colors.core.orange.10}",
                },
                active: {
                  value: "{colors.core.orange.00}",
                },
              },
            },
            critical: {
              subtle: {
                default: {
                  value: "{colors.core.red.00}",
                },
                hover: {
                  value: "{colors.core.red.10}",
                },
                active: {
                  value: "{colors.core.red.00}",
                },
              },
              strong: {
                default: {
                  value: "{colors.core.red.50}",
                },
                hover: {
                  value: "{colors.core.red.60}",
                },
                active: {
                  value: "{colors.core.red.50}",
                },
              },
            },
          },
        },
        icon: {
          primary: {
            value: "{colors.core.gray.70}",
          },
          secondary: {
            value: "{colors.core.gray.50}",
          },
          tertiary: {
            value: "{colors.core.gray.40}",
          },
          disabled: {
            value: "{colors.core.gray.30}",
          },
          inverted: {
            value: "{colors.core.neutral.white}",
          },
          link: {
            value: "{colors.core.custom.60}",
          },
          linkhover: {
            value: "{colors.core.custom.70}",
          },
          semantic: {
            info: {
              value: "{colors.core.blue.90}",
            },
            success: {
              value: "{colors.core.green.80}",
            },
            warning: {
              value: "{colors.core.orange.70}",
            },
            critical: {
              value: "{colors.core.red.70}",
            },
          },
        },
        surfaceglass: {
          "50": {
            value: "{colors.core.gray.20}",
          },
          "60": {
            value: "{colors.core.whitealpha.60}",
          },
          "70": {
            value: "{colors.core.whitealpha.70}",
          },
          default: {
            value: "{colors.core.whitealpha.90}",
          },
          alt: {
            value: "{colors.core.whitealpha.60}",
          },
        },
        color: {
          accent: {
            "10": {
              value: "#ffffff",
            },
            "20": {
              value: "#f7dccb",
            },
            "30": {
              value: "#f2c1ac",
            },
            "40": {
              value: "#e88372",
            },
            "50": {
              value: "#dd3c3c",
            },
            "60": {
              value: "#ffffff",
            },
            "70": {
              value: "#ffffff",
            },
            "80": {
              value: "#ffffff",
            },
            "90": {
              value: "#ffffff",
            },
            "95": {
              value: "#ffffff",
            },
            "00": {
              value: "#ffffff",
            },
          },
          accentgray: {
            "10": {
              value: "#ffffff",
            },
            "20": {
              value: "#ffffff",
            },
            "30": {
              value: "#ffffff",
            },
            "40": {
              value: "#ffffff",
            },
            "50": {
              value: "#968c8c",
            },
            "60": {
              value: "#ffffff",
            },
            "70": {
              value: "#ffffff",
            },
            "80": {
              value: "#ffffff",
            },
            "90": {
              value: "#ffffff",
            },
            "95": {
              value: "#ffffff",
            },
            "00": {
              value: "#ffffff",
            },
          },
        },
      },
      spacing: {
        spacing: {
          "0": {
            value: "{spacing.spacing.default.0}",
          },
          "1": {
            value: "{spacing.spacing.default.1}",
          },
          "2": {
            value: "{spacing.spacing.default.2}",
          },
          "3": {
            value: "{spacing.spacing.default.3}",
          },
          "4": {
            value: "{spacing.spacing.default.4}",
          },
          "5": {
            value: "{spacing.spacing.default.5}",
          },
          "6": {
            value: "{spacing.spacing.default.6}",
          },
          "7": {
            value: "{spacing.spacing.default.7}",
          },
          "8": {
            value: "{spacing.spacing.default.8}",
          },
          "9": {
            value: "{spacing.spacing.default.9}",
          },
          "10": {
            value: "{spacing.spacing.default.10}",
          },
          default: {
            "0": {
              value: "0px",
            },
            "1": {
              value: "1px",
            },
            "2": {
              value: "2px",
            },
            "3": {
              value: "4px",
            },
            "4": {
              value: "6px",
            },
            "5": {
              value: "8px",
            },
            "6": {
              value: "10px",
            },
            "7": {
              value: "12px",
            },
            "8": {
              value: "14px",
            },
            "9": {
              value: "16px",
            },
            "10": {
              value: "20px",
            },
            "11": {
              value: "24px",
            },
            "12": {
              value: "28px",
            },
          },
          compact: {
            "0": {
              value: "0px",
            },
            "1": {
              value: "1px",
            },
            "2": {
              value: "1px",
            },
            "3": {
              value: "2px",
            },
            "4": {
              value: "4px",
            },
            "5": {
              value: "6px",
            },
            "6": {
              value: "8px",
            },
            "7": {
              value: "10px",
            },
            "8": {
              value: "12px",
            },
            "9": {
              value: "14px",
            },
            "10": {
              value: "16px",
            },
            "11": {
              value: "20px",
            },
            "12": {
              value: "24px",
            },
          },
          comfortable: {
            "0": {
              value: "0px",
            },
            "1": {
              value: "2px",
            },
            "2": {
              value: "4px",
            },
            "3": {
              value: "6px",
            },
            "4": {
              value: "8px",
            },
            "5": {
              value: "10px",
            },
            "6": {
              value: "12px",
            },
            "7": {
              value: "14px",
            },
            "8": {
              value: "16px",
            },
            "9": {
              value: "20px",
            },
            "10": {
              value: "24px",
            },
            "11": {
              value: "28px",
            },
            "12": {
              value: "32px",
            },
          },
        },
      },
      fonts: {
        family: {
          display: {
            value: "Inter Display",
          },
          body: {
            value: "Inter",
          },
        },
        weight: {
          normaldelete: {
            value: "Regular",
          },
          mediumdelete: {
            value: "Medium",
          },
          semibolddelete: {
            value: "SemiBold",
          },
        },
        typography: {
          fontfamily: {
            display: {
              value: "Inter Display",
            },
            body: {
              value: "Inter",
            },
            code: {
              value: "Inter",
            },
          },
        },
      },
      fontSizes: {
        size: {
          text3xl: {
            value: "30px",
          },
          textsm: {
            value: "14px",
          },
          textbase: {
            value: "16px",
          },
          textxs: {
            value: "12px",
          },
          textxl: {
            value: "20px",
          },
          textlg: {
            value: "18px",
          },
          text2xl: {
            value: "24px",
          },
          text4xl: {
            value: "36px",
          },
        },
      },
      lineHeights: {
        leading: {
          none: {
            text3xl: {
              value: "{fontSizes.size.text3xl}",
            },
            textsm: {
              value: "{fontSizes.size.textsm}",
            },
            textxs: {
              value: "{fontSizes.size.textxs}",
            },
            textbase: {
              value: "{fontSizes.size.textbase}",
            },
            textlg: {
              value: "{fontSizes.size.textlg}",
            },
          },
          normal: {
            textxs: {
              value: 18,
            },
            textsm: {
              value: 21,
            },
            textbase: {
              value: 24,
            },
            textlg: {
              value: 27,
            },
          },
        },
      },
      radii: {
        core: {
          md: {
            "0": {
              value: "0px",
            },
            "1": {
              value: "2px",
            },
            "2": {
              value: "4px",
            },
            "3": {
              value: "6px",
            },
            "4": {
              value: "8px",
            },
            "5": {
              value: "10px",
            },
            "6": {
              value: "12px",
            },
            "7": {
              value: "16px",
            },
            "8": {
              value: "20px",
            },
            "9": {
              value: "24px",
            },
            "10": {
              value: "32px",
            },
            full: {
              value: "9999px",
            },
          },
          sm: {
            "0": {
              value: "0px",
            },
            "1": {
              value: "1px",
            },
            "2": {
              value: "2px",
            },
            "3": {
              value: "4px",
            },
            "4": {
              value: "6px",
            },
            "5": {
              value: "8px",
            },
            "6": {
              value: "10px",
            },
            "7": {
              value: "12px",
            },
            "8": {
              value: "16px",
            },
            "9": {
              value: "20px",
            },
            "10": {
              value: "24px",
            },
            full: {
              value: "9999px",
            },
          },
          lg: {
            "0": {
              value: "0px",
            },
            "1": {
              value: "4px",
            },
            "2": {
              value: "6px",
            },
            "3": {
              value: "8px",
            },
            "4": {
              value: "10px",
            },
            "5": {
              value: "12px",
            },
            "6": {
              value: "16px",
            },
            "7": {
              value: "20px",
            },
            "8": {
              value: "24px",
            },
            "9": {
              value: "32px",
            },
            "10": {
              value: "40px",
            },
            full: {
              value: "9999px",
            },
          },
          full: {
            "0": {
              value: "9999px",
            },
            "1": {
              value: "9999px",
            },
            "2": {
              value: "9999px",
            },
            "3": {
              value: "9999px",
            },
            "4": {
              value: "9999px",
            },
            "5": {
              value: "9999px",
            },
            "6": {
              value: "9999px",
            },
            "7": {
              value: "9999px",
            },
            "8": {
              value: "9999px",
            },
            "9": {
              value: "9999px",
            },
            "10": {
              value: "9999px",
            },
            full: {
              value: "9999px",
            },
          },
          none: {
            "0": {
              value: "0px",
            },
            "1": {
              value: "0px",
            },
            "2": {
              value: "0px",
            },
            "3": {
              value: "0px",
            },
            "4": {
              value: "0px",
            },
            "5": {
              value: "0px",
            },
            "6": {
              value: "0px",
            },
            "7": {
              value: "0px",
            },
            "8": {
              value: "0px",
            },
            "9": {
              value: "0px",
            },
            "10": {
              value: "0px",
            },
            full: {
              value: "0px",
            },
          },
        },
        component: {
          button: {
            sm: {
              value: "{radii.radius.4}",
            },
            md: {
              value: "{radii.radius.4}",
            },
            lg: {
              value: "{radii.radius.5}",
            },
            xs: {
              value: "{radii.radius.2}",
            },
          },
        },
        radius: {
          "0": {
            value: "{radii.core.md.0}",
          },
          "1": {
            value: "{radii.core.md.1}",
          },
          "2": {
            value: "{radii.core.md.2}",
          },
          "3": {
            value: "{radii.core.md.3}",
          },
          "4": {
            value: "{radii.core.md.4}",
          },
          "5": {
            value: "{radii.core.md.5}",
          },
          "6": {
            value: "{radii.core.md.6}",
          },
          "7": {
            value: "{radii.core.md.7}",
          },
          "8": {
            value: "{radii.core.md.8}",
          },
          "9": {
            value: "{radii.core.md.9}",
          },
          "10": {
            value: "{radii.core.md.10}",
          },
          full: {
            value: "{radii.core.md.full}",
          },
        },
      },
    },
    semanticTokens: {
      colors: {
        core: {
          gray: {
            "10": {
              value: {
                _dark: "#1d2836",
                base: "#f5f5f5",
              },
            },
            "20": {
              value: {
                _dark: "#374151",
                base: "#e5e5e5",
              },
            },
            "30": {
              value: {
                _dark: "#4b5563",
                base: "#d9d9d9",
              },
            },
            "35": {
              value: {
                _dark: "#4b5563",
                base: "#c7c7c7",
              },
            },
            "40": {
              value: {
                _dark: "#6b7280",
                base: "#a3a3a3",
              },
            },
            "50": {
              value: {
                _dark: "#9ca3af",
                base: "#737373",
              },
            },
            "60": {
              value: {
                _dark: "#dde0e4",
                base: "#525252",
              },
            },
            "70": {
              value: {
                _dark: "#e5e7eb",
                base: "#404040",
              },
            },
            "80": {
              value: {
                _dark: "#f0f2f4",
                base: "#262626",
              },
            },
            "90": {
              value: {
                _dark: "#f6f8f9",
                base: "#171717",
              },
            },
            "95": {
              value: {
                _dark: "#f6f8f9",
                base: "#0a0a0a",
              },
            },
            "00": {
              value: {
                _dark: "#070a0d",
                base: "#fafafa",
              },
            },
          },
          red: {
            "10": {
              value: {
                _dark: "#991b1b",
                base: "#fbd5d7",
              },
            },
            "20": {
              value: {
                _dark: "#b91c1c",
                base: "#f5a3a3",
              },
            },
            "30": {
              value: {
                _dark: "#dc2626",
                base: "#f17e7e",
              },
            },
            "40": {
              value: {
                _dark: "#ef4444",
                base: "#ed5a5a",
              },
            },
            "50": {
              value: {
                _dark: "#f87171",
                base: "#e93535",
              },
            },
            "60": {
              value: {
                _dark: "#fca5a5",
                base: "#dc1818",
              },
            },
            "70": {
              value: {
                _dark: "#fecaca",
                base: "#b81414",
              },
            },
            "80": {
              value: {
                _dark: "#fee2e2",
                base: "#931010",
              },
            },
            "90": {
              value: {
                _dark: "#fef2f2",
                base: "#6e0c0c",
              },
            },
            "00": {
              value: {
                _dark: "#7f1d1d",
                base: "#fde8e9",
              },
            },
          },
          orange: {
            "10": {
              value: {
                _dark: "#9a3412",
                base: "#ffe0b8",
              },
            },
            "20": {
              value: {
                _dark: "#c2410c",
                base: "#fed7aa",
              },
            },
            "30": {
              value: {
                _dark: "#d97706",
                base: "#fdba74",
              },
            },
            "40": {
              value: {
                _dark: "#f97316",
                base: "#fb923c",
              },
            },
            "50": {
              value: {
                _dark: "#fb923c",
                base: "#f97316",
              },
            },
            "60": {
              value: {
                _dark: "#fdba74",
                base: "#d97706",
              },
            },
            "70": {
              value: {
                _dark: "#fed7aa",
                base: "#c2410c",
              },
            },
            "80": {
              value: {
                _dark: "#ffedd5",
                base: "#9a3412",
              },
            },
            "90": {
              value: {
                _dark: "#fff7ed",
                base: "#7c2d12",
              },
            },
            "00": {
              value: {
                _dark: "#7c2d12",
                base: "#fff1e0",
              },
            },
          },
          green: {
            "10": {
              value: {
                _dark: "#096638",
                base: "#e4f7f3",
              },
            },
            "20": {
              value: {
                _dark: "#0e7d4b",
                base: "#b9ebdf",
              },
            },
            "30": {
              value: {
                _dark: "#159663",
                base: "#91dbc9",
              },
            },
            "40": {
              value: {
                _dark: "#19a874",
                base: "#4fc29e",
              },
            },
            "50": {
              value: {
                _dark: "#4fc29e",
                base: "#19a874",
              },
            },
            "60": {
              value: {
                _dark: "#91dbc9",
                base: "#159663",
              },
            },
            "70": {
              value: {
                _dark: "#b9ebdf",
                base: "#0e7d4b",
              },
            },
            "80": {
              value: {
                _dark: "#e4f7f3",
                base: "#096638",
              },
            },
            "90": {
              value: {
                _dark: "#edfaf7",
                base: "#054d27",
              },
            },
            "00": {
              value: {
                _dark: "#054d27",
                base: "#edfaf7",
              },
            },
          },
          blue: {
            "10": {
              value: {
                _dark: "#0e2e8c",
                base: "#daf0ff",
              },
            },
            "20": {
              value: {
                _dark: "#1541b0",
                base: "#bee6ff",
              },
            },
            "30": {
              value: {
                _dark: "#1c62e3",
                base: "#78c0fc",
              },
            },
            "40": {
              value: {
                _dark: "#266df0",
                base: "#56b0fb",
              },
            },
            "50": {
              value: {
                _dark: "#629df0",
                base: "#34a0fa",
              },
            },
            "60": {
              value: {
                _dark: "#a3cff7",
                base: "#2a80c8",
              },
            },
            "70": {
              value: {
                _dark: "#c5e3fa",
                base: "#0666c6",
              },
            },
            "80": {
              value: {
                _dark: "#e5eeff",
                base: "#05529e",
              },
            },
            "90": {
              value: {
                _dark: "#f5fbff",
                base: "#043d77",
              },
            },
            "00": {
              value: {
                _dark: "#071e69",
                base: "#eff9ff",
              },
            },
          },
          neutral: {
            white: {
              value: {
                _dark: "#000000",
                base: "#ffffff",
              },
            },
            black: {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
          },
          purple: {
            "10": {
              value: {
                _dark: "#2d138f",
                base: "#e0d6fc",
              },
            },
            "20": {
              value: {
                _dark: "#401db3",
                base: "#c2adf8",
              },
            },
            "30": {
              value: {
                _dark: "#5429d6",
                base: "#a385f5",
              },
            },
            "40": {
              value: {
                _dark: "#6633ee",
                base: "#865cf1",
              },
            },
            "50": {
              value: {
                _dark: "#865cf1",
                base: "#6633ee",
              },
            },
            "60": {
              value: {
                _dark: "#a385f5",
                base: "#5429d6",
              },
            },
            "70": {
              value: {
                _dark: "#c2adf8",
                base: "#401db3",
              },
            },
            "80": {
              value: {
                _dark: "#e0d6fc",
                base: "#2d138f",
              },
            },
            "90": {
              value: {
                _dark: "#eee6f3",
                base: "#1d0a6b",
              },
            },
            "00": {
              value: {
                _dark: "#1d0a6b",
                base: "#eee6f3",
              },
            },
          },
          pink: {
            "10": {
              value: {
                _dark: "#9d174d",
                base: "#fce7f3",
              },
            },
            "20": {
              value: {
                _dark: "#be185d",
                base: "#fbcfe8",
              },
            },
            "30": {
              value: {
                _dark: "#db2777",
                base: "#f9a8d4",
              },
            },
            "40": {
              value: {
                _dark: "#ec4899",
                base: "#f174b2",
              },
            },
            "50": {
              value: {
                _dark: "#f174b2",
                base: "#ec4899",
              },
            },
            "60": {
              value: {
                _dark: "#f9a8d4",
                base: "#db2777",
              },
            },
            "70": {
              value: {
                _dark: "#fbcfe8",
                base: "#be185d",
              },
            },
            "80": {
              value: {
                _dark: "#fce7f3",
                base: "#9d174d",
              },
            },
            "90": {
              value: {
                _dark: "#fdf2f8",
                base: "#831843",
              },
            },
            "00": {
              value: {
                _dark: "#831843",
                base: "#fdf2f8",
              },
            },
          },
          yellow: {
            "10": {
              value: {
                _dark: "#854d0e",
                base: "#fef9c3",
              },
            },
            "20": {
              value: {
                _dark: "#a16207",
                base: "#fef08a",
              },
            },
            "30": {
              value: {
                _dark: "#ca8a04",
                base: "#fde047",
              },
            },
            "40": {
              value: {
                _dark: "#eab308",
                base: "#facc15",
              },
            },
            "50": {
              value: {
                _dark: "#facc15",
                base: "#eab308",
              },
            },
            "60": {
              value: {
                _dark: "#fde047",
                base: "#ca8a04",
              },
            },
            "70": {
              value: {
                _dark: "#fef08a",
                base: "#a16207",
              },
            },
            "80": {
              value: {
                _dark: "#fef9c3",
                base: "#854d0e",
              },
            },
            "90": {
              value: {
                _dark: "#fefce8",
                base: "#713f12",
              },
            },
            "00": {
              value: {
                _dark: "#713f12",
                base: "#fefce8",
              },
            },
          },
          custom: {
            "10": {
              value: {
                _dark: "#0e2e8c",
                base: "#bbdffd",
              },
            },
            "20": {
              value: {
                _dark: "#1541b0",
                base: "#9ad0fd",
              },
            },
            "30": {
              value: {
                _dark: "#1c62e3",
                base: "#78c0fc",
              },
            },
            "40": {
              value: {
                _dark: "#266df0",
                base: "#56b0fb",
              },
            },
            "50": {
              value: {
                _dark: "#629df0",
                base: "#2070e6",
              },
            },
            "60": {
              value: {
                _dark: "#a3cff7",
                base: "#1567e0",
              },
            },
            "70": {
              value: {
                _dark: "#c5e3fa",
                base: "#0666c6",
              },
            },
            "80": {
              value: {
                _dark: "#e5eeff",
                base: "#05529e",
              },
            },
            "90": {
              value: {
                _dark: "#f5fbff",
                base: "#043d77",
              },
            },
            "00": {
              value: {
                _dark: "#071e69",
                base: "#ddeffe",
              },
            },
          },
          grayalpha: {
            "10": {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
            "20": {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
            "30": {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
            "40": {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
            "50": {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
            "60": {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
            "70": {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
            "80": {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
            "90": {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
            "95": {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
            "00": {
              value: {
                _dark: "#ffffff",
                base: "#000000",
              },
            },
          },
          customalpha: {
            "10": {
              value: {
                _dark: "#0e2e8c",
                base: "#2679f3",
              },
            },
            "20": {
              value: {
                _dark: "#1541b0",
                base: "#2679f3",
              },
            },
            "30": {
              value: {
                _dark: "#1c62e3",
                base: "#2679f3",
              },
            },
            "40": {
              value: {
                _dark: "#266df0",
                base: "#2679f3",
              },
            },
            "50": {
              value: {
                _dark: "#629df0",
                base: "#2679f3",
              },
            },
            "60": {
              value: {
                _dark: "#a3cff7",
                base: "#1567e0",
              },
            },
            "70": {
              value: {
                _dark: "#c5e3fa",
                base: "#2679f3",
              },
            },
            "80": {
              value: {
                _dark: "#e5eeff",
                base: "#2679f3",
              },
            },
            "90": {
              value: {
                _dark: "#f5fbff",
                base: "#2679f3",
              },
            },
            "00": {
              value: {
                _dark: "#071e69",
                base: "#2679f3",
              },
            },
          },
          whitealpha: {
            "10": {
              value: {
                _dark: "#000000",
                base: "#ffffff",
              },
            },
            "20": {
              value: {
                _dark: "#000000",
                base: "#ffffff",
              },
            },
            "30": {
              value: {
                _dark: "#ffffff",
                base: "#ffffff",
              },
            },
            "40": {
              value: {
                _dark: "#ffffff",
                base: "#ffffff",
              },
            },
            "50": {
              value: {
                _dark: "#ffffff",
                base: "#ffffff",
              },
            },
            "60": {
              value: {
                _dark: "#ffffff",
                base: "#ffffff",
              },
            },
            "70": {
              value: {
                _dark: "#ffffff",
                base: "#ffffff",
              },
            },
            "80": {
              value: {
                _dark: "#ffffff",
                base: "#ffffff",
              },
            },
            "90": {
              value: {
                _dark: "#ffffff",
                base: "#ffffff",
              },
            },
            "95": {
              value: {
                _dark: "#ffffff",
                base: "#ffffff",
              },
            },
            "00": {
              value: {
                _dark: "#000000",
                base: "#ffffff",
              },
            },
          },
        },
      },
    },
  },
});
