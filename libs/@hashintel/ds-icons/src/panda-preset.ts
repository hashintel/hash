export const dsIconsPandaPreset = {
  name: "@hashintel/ds-icons/panda-preset",

  theme: {
    extend: {
      keyframes: {
        petriconRunnerBob: {
          "0%, 50%, 100%": { transform: "translateY(0)" },
          "25%, 75%": { transform: "translateY(-0.7px)" },
        },
        petriconRunnerBackArm: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "50%": { transform: "rotate(-100deg)" },
        },
        petriconRunnerFrontArm: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "50%": { transform: "rotate(100deg)" },
        },
        petriconRunnerBackLeg: {
          "0%, 100%": { d: 'path("M10 15L6 19L2 19")' },
          "25%": { d: 'path("M10 15L6 16L5 12")' },
          "50%": { d: 'path("M10 15L15 18L14 22")' },
          "75%": { d: 'path("M10 15L10 20L6 22")' },
        },
        petriconRunnerFrontLeg: {
          "0%, 100%": { d: 'path("M10 15L15 18L14 22")' },
          "25%": { d: 'path("M10 15L10 20L6 22")' },
          "50%": { d: 'path("M10 15L6 19L2 19")' },
          "75%": { d: 'path("M10 15L6 16L5 12")' },
        },
        petriconSequence: {
          "0%, 100%": { transform: "translateY(0)", opacity: "1" },
          "40%": { transform: "translateY(-1px)", opacity: "0.72" },
        },
        petriconNotation: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "35%": { transform: "translate(1px, -0.5px)" },
          "70%": { transform: "translate(-0.4px, 0.2px)" },
        },
        petriconSignal: {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "35%": { transform: "scale(0.9)", opacity: "0.65" },
          "65%": { transform: "scale(1.04)", opacity: "1" },
        },
        petriconDistribution: {
          "0%, 100%": { transform: "translateX(0) skewX(0)" },
          "30%": { transform: "translateX(-0.5px) skewX(-5deg)" },
          "65%": { transform: "translateX(0.3px) skewX(3deg)" },
        },
        petriconOrbit: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "40%": { transform: "rotate(14deg)" },
          "75%": { transform: "rotate(-3deg)" },
        },
        petriconBlink: {
          "0%, 100%": { transform: "scaleY(1)" },
          "40%": { transform: "scaleY(0.2)" },
        },
        petriconScan: {
          "0%, 100%": { transform: "scaleY(1)", opacity: "1" },
          "45%": { transform: "scaleY(0.8)", opacity: "0.5" },
        },
        petrinautIconParameterScrub: {
          "0%, 100%": { transform: "translateX(0)" },
          "30%": {
            transform:
              "translateX(calc(var(--parameter-scrub-direction) * 3px))",
          },
          "65%": {
            transform:
              "translateX(calc(var(--parameter-scrub-direction) * -1px))",
          },
        },
        petrinautIconLiquidWave: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "25%": { transform: "translate(1px, -0.5px)" },
          "65%": { transform: "translate(-0.5px, 0)" },
        },
      },
    },
  },
};
