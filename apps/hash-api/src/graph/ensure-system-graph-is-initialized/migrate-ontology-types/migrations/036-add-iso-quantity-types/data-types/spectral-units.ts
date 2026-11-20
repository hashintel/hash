import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoDataType } from "../data-types";

export const spectralUnitsDataTypes: IsoDataType[] = [
  {
    definition: {
      title: "Spectral Energy per Wavelength",
      description:
        "Numeric values in convertible units of spectral energy per wavelength.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Spectral Energy per Wavelength (Metric)",
      description:
        "Spectral Energy per Wavelength expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralEnergyPerWavelength.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Joules per Meter",
      description:
        "A wavelength spectral density expressed in J/m; its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralEnergyPerWavelengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "J/m",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Joules per Nanometer",
      description:
        "A wavelength spectral density expressed in J/nm; equal to 10^9 J/m.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralEnergyPerWavelengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "J/nm",
      },
    },
    conversions: {
      [systemDataTypes.joulesPerMeter.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Spectral Energy Density per Wavelength",
      description:
        "Numeric values in convertible units of spectral energy density per wavelength.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Spectral Energy Density per Wavelength (Metric)",
      description:
        "Spectral Energy Density per Wavelength expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralEnergyDensityPerWavelength.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Joules per Fourth Power Meter",
      description:
        "A wavelength spectral density expressed in J/m⁴; its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralEnergyDensityPerWavelengthMetric
            .dataTypeId,
        },
      ],
      label: {
        right: "J/m⁴",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Joules per Cubic Meter Nanometer",
      description:
        "A wavelength spectral density expressed in J/(m³·nm); equal to 10^9 J/m⁴.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralEnergyDensityPerWavelengthMetric
            .dataTypeId,
        },
      ],
      label: {
        right: "J/(m³·nm)",
      },
    },
    conversions: {
      [systemDataTypes.joulesPerFourthPowerMeter.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Spectral Power per Wavelength",
      description:
        "Numeric values in convertible units of spectral power per wavelength.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Spectral Power per Wavelength (Metric)",
      description:
        "Spectral Power per Wavelength expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralPowerPerWavelength.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Watts per Meter",
      description:
        "A wavelength spectral density expressed in W/m; its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralPowerPerWavelengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "W/m",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Watts per Nanometer",
      description:
        "A wavelength spectral density expressed in W/nm; equal to 10^9 W/m.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralPowerPerWavelengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "W/nm",
      },
    },
    conversions: {
      [systemDataTypes.wattsPerMeter.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Spectral Intensity per Wavelength",
      description:
        "Numeric values in convertible units of spectral intensity per wavelength.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Spectral Intensity per Wavelength (Metric)",
      description:
        "Spectral Intensity per Wavelength expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralIntensityPerWavelength.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Watts per Steradian Meter",
      description:
        "A wavelength spectral density expressed in W/(sr·m); its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralIntensityPerWavelengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "W/(sr·m)",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Watts per Steradian Nanometer",
      description:
        "A wavelength spectral density expressed in W/(sr·nm); equal to 10^9 W/(sr·m).",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralIntensityPerWavelengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "W/(sr·nm)",
      },
    },
    conversions: {
      [systemDataTypes.wattsPerSteradianMeter.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Spectral Radiance per Wavelength",
      description:
        "Numeric values in convertible units of spectral radiance per wavelength.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Spectral Radiance per Wavelength (Metric)",
      description:
        "Spectral Radiance per Wavelength expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralRadiancePerWavelength.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Watts per Steradian Cubic Meter",
      description:
        "A wavelength spectral density expressed in W/(sr·m³); its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralRadiancePerWavelengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "W/(sr·m³)",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Watts per Steradian Square Meter Nanometer",
      description:
        "A wavelength spectral density expressed in W/(sr·m²·nm); equal to 10^9 W/(sr·m³).",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralRadiancePerWavelengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "W/(sr·m²·nm)",
      },
    },
    conversions: {
      [systemDataTypes.wattsPerSteradianCubicMeter.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Spectral Irradiance per Wavelength",
      description:
        "Numeric values in convertible units of spectral irradiance per wavelength.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Spectral Irradiance per Wavelength (Metric)",
      description:
        "Spectral Irradiance per Wavelength expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralIrradiancePerWavelength.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Watts per Cubic Meter",
      description:
        "A wavelength spectral density expressed in W/m³; its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralIrradiancePerWavelengthMetric
            .dataTypeId,
        },
      ],
      label: {
        right: "W/m³",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Watts per Square Meter Nanometer",
      description:
        "A wavelength spectral density expressed in W/(m²·nm); equal to 10^9 W/m³.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralIrradiancePerWavelengthMetric
            .dataTypeId,
        },
      ],
      label: {
        right: "W/(m²·nm)",
      },
    },
    conversions: {
      [systemDataTypes.wattsPerCubicMeter.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Spectral Exposure per Wavelength",
      description:
        "Numeric values in convertible units of spectral exposure per wavelength.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Spectral Exposure per Wavelength (Metric)",
      description:
        "Spectral Exposure per Wavelength expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralExposurePerWavelength.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Joules per Cubic Meter of Wavelength",
      description:
        "A wavelength spectral density expressed in J/(m²·m); its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralExposurePerWavelengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "J/(m²·m)",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Joules per Square Meter Nanometer",
      description:
        "A wavelength spectral density expressed in J/(m²·nm); equal to 10^9 J/(m²·m).",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralExposurePerWavelengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "J/(m²·nm)",
      },
    },
    conversions: {
      [systemDataTypes.joulesPerCubicMeterOfWavelength.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Electronvolts per Meter",
      description:
        "A value expressed in eV/m, using the exact SI electronvolt of 1.602176634 × 10^-19 joules.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.spectralEnergyPerWavelengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "eV/m",
      },
    },
    conversions: {
      [systemDataTypes.joulesPerMeter.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1.602176634e-19,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1.602176634e-19,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Electronvolts per Square Meter",
      description:
        "A value expressed in eV/m², using the exact SI electronvolt of 1.602176634 × 10^-19 joules.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.energyPerAreaMetric.dataTypeId,
        },
      ],
      label: {
        right: "eV/m²",
      },
    },
    conversions: {
      [systemDataTypes.joulesPerSquareMeter.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1.602176634e-19,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1.602176634e-19,
              type: "number",
            },
          ],
        },
      },
    },
  },
];
