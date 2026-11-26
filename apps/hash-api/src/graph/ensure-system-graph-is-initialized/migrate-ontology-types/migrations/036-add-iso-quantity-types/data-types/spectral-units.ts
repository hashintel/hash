import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoDataType } from "../data-types";

export const spectralUnitsDataTypes: IsoDataType[] = [
  {
    dataTypeBaseUrl:
      systemDataTypes.spectralEnergyPerWavelength.dataTypeBaseUrl,
    definition: {
      title: "Spectral Energy per Wavelength",
      titlePlural: "Spectral Energies per Wavelength",
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
    dataTypeBaseUrl:
      systemDataTypes["spectralEnergyPerWavelength(metric)"].dataTypeBaseUrl,
    definition: {
      title: "Spectral Energy per Wavelength (Metric)",
      titlePlural: "Spectral Energies per Wavelength (Metric)",
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
    dataTypeBaseUrl: systemDataTypes.joulePerMeterOfWavelength.dataTypeBaseUrl,
    definition: {
      title: "Joule per Meter of Wavelength",
      titlePlural: "Joules per Meter of Wavelength",
      description:
        "A wavelength spectral density expressed in J/m; its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralEnergyPerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "J/m",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.joulePerNanometer.dataTypeBaseUrl,
    definition: {
      title: "Joule per Nanometer",
      titlePlural: "Joules per Nanometer",
      description:
        "A wavelength spectral density expressed in J/nm; equal to 10^9 J/m.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralEnergyPerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "J/nm",
      },
    },
    conversions: {
      [systemDataTypes.joulePerMeterOfWavelength.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl:
      systemDataTypes.spectralEnergyDensityPerWavelength.dataTypeBaseUrl,
    definition: {
      title: "Spectral Energy Density per Wavelength",
      titlePlural: "Spectral Energy Densities per Wavelength",
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
    dataTypeBaseUrl:
      systemDataTypes["spectralEnergyDensityPerWavelength(metric)"]
        .dataTypeBaseUrl,
    definition: {
      title: "Spectral Energy Density per Wavelength (Metric)",
      titlePlural: "Spectral Energy Densities per Wavelength (Metric)",
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
    dataTypeBaseUrl: systemDataTypes.joulePerFourthPowerMeter.dataTypeBaseUrl,
    definition: {
      title: "Joule per Fourth Power Meter",
      titlePlural: "Joules per Fourth Power Meter",
      description:
        "A wavelength spectral density expressed in J/m⁴; its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralEnergyDensityPerWavelength(metric)"]
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
    dataTypeBaseUrl:
      systemDataTypes.joulePerCubicMeterNanometer.dataTypeBaseUrl,
    definition: {
      title: "Joule per Cubic Meter Nanometer",
      titlePlural: "Joules per Cubic Meter Nanometer",
      description:
        "A wavelength spectral density expressed in J/(m³·nm); equal to 10^9 J/m⁴.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralEnergyDensityPerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "J/(m³·nm)",
      },
    },
    conversions: {
      [systemDataTypes.joulePerFourthPowerMeter.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.spectralPowerPerWavelength.dataTypeBaseUrl,
    definition: {
      title: "Spectral Power per Wavelength",
      titlePlural: "Spectral Powers per Wavelength",
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
    dataTypeBaseUrl:
      systemDataTypes["spectralPowerPerWavelength(metric)"].dataTypeBaseUrl,
    definition: {
      title: "Spectral Power per Wavelength (Metric)",
      titlePlural: "Spectral Powers per Wavelength (Metric)",
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
    dataTypeBaseUrl: systemDataTypes.wattPerMeter.dataTypeBaseUrl,
    definition: {
      title: "Watt per Meter",
      titlePlural: "Watts per Meter",
      description:
        "A wavelength spectral density expressed in W/m; its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralPowerPerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "W/m",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.wattPerNanometer.dataTypeBaseUrl,
    definition: {
      title: "Watt per Nanometer",
      titlePlural: "Watts per Nanometer",
      description:
        "A wavelength spectral density expressed in W/nm; equal to 10^9 W/m.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralPowerPerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "W/nm",
      },
    },
    conversions: {
      [systemDataTypes.wattPerMeter.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl:
      systemDataTypes.spectralIntensityPerWavelength.dataTypeBaseUrl,
    definition: {
      title: "Spectral Intensity per Wavelength",
      titlePlural: "Spectral Intensities per Wavelength",
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
    dataTypeBaseUrl:
      systemDataTypes["spectralIntensityPerWavelength(metric)"].dataTypeBaseUrl,
    definition: {
      title: "Spectral Intensity per Wavelength (Metric)",
      titlePlural: "Spectral Intensities per Wavelength (Metric)",
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
    dataTypeBaseUrl: systemDataTypes.wattPerSteradianMeter.dataTypeBaseUrl,
    definition: {
      title: "Watt per Steradian Meter",
      titlePlural: "Watts per Steradian Meter",
      description:
        "A wavelength spectral density expressed in W/(sr·m); its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralIntensityPerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "W/(sr·m)",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.wattPerSteradianNanometer.dataTypeBaseUrl,
    definition: {
      title: "Watt per Steradian Nanometer",
      titlePlural: "Watts per Steradian Nanometer",
      description:
        "A wavelength spectral density expressed in W/(sr·nm); equal to 10^9 W/(sr·m).",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralIntensityPerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "W/(sr·nm)",
      },
    },
    conversions: {
      [systemDataTypes.wattPerSteradianMeter.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl:
      systemDataTypes.spectralRadiancePerWavelength.dataTypeBaseUrl,
    definition: {
      title: "Spectral Radiance per Wavelength",
      titlePlural: "Spectral Radiances per Wavelength",
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
    dataTypeBaseUrl:
      systemDataTypes["spectralRadiancePerWavelength(metric)"].dataTypeBaseUrl,
    definition: {
      title: "Spectral Radiance per Wavelength (Metric)",
      titlePlural: "Spectral Radiances per Wavelength (Metric)",
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
    dataTypeBaseUrl: systemDataTypes.wattPerSteradianCubicMeter.dataTypeBaseUrl,
    definition: {
      title: "Watt per Steradian Cubic Meter",
      titlePlural: "Watts per Steradian Cubic Meter",
      description:
        "A wavelength spectral density expressed in W/(sr·m³); its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralRadiancePerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "W/(sr·m³)",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.wattPerSteradianSquareMeterNanometer.dataTypeBaseUrl,
    definition: {
      title: "Watt per Steradian Square Meter Nanometer",
      titlePlural: "Watts per Steradian Square Meter Nanometer",
      description:
        "A wavelength spectral density expressed in W/(sr·m²·nm); equal to 10^9 W/(sr·m³).",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralRadiancePerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "W/(sr·m²·nm)",
      },
    },
    conversions: {
      [systemDataTypes.wattPerSteradianCubicMeter.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl:
      systemDataTypes.spectralIrradiancePerWavelength.dataTypeBaseUrl,
    definition: {
      title: "Spectral Irradiance per Wavelength",
      titlePlural: "Spectral Irradiances per Wavelength",
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
    dataTypeBaseUrl:
      systemDataTypes["spectralIrradiancePerWavelength(metric)"]
        .dataTypeBaseUrl,
    definition: {
      title: "Spectral Irradiance per Wavelength (Metric)",
      titlePlural: "Spectral Irradiances per Wavelength (Metric)",
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
    dataTypeBaseUrl: systemDataTypes.wattPerCubicMeter.dataTypeBaseUrl,
    definition: {
      title: "Watt per Cubic Meter",
      titlePlural: "Watts per Cubic Meter",
      description:
        "A wavelength spectral density expressed in W/m³; its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralIrradiancePerWavelength(metric)"]
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
    dataTypeBaseUrl:
      systemDataTypes.wattPerSquareMeterNanometer.dataTypeBaseUrl,
    definition: {
      title: "Watt per Square Meter Nanometer",
      titlePlural: "Watts per Square Meter Nanometer",
      description:
        "A wavelength spectral density expressed in W/(m²·nm); equal to 10^9 W/m³.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralIrradiancePerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "W/(m²·nm)",
      },
    },
    conversions: {
      [systemDataTypes.wattPerCubicMeter.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl:
      systemDataTypes.spectralExposurePerWavelength.dataTypeBaseUrl,
    definition: {
      title: "Spectral Exposure per Wavelength",
      titlePlural: "Spectral Exposures per Wavelength",
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
    dataTypeBaseUrl:
      systemDataTypes["spectralExposurePerWavelength(metric)"].dataTypeBaseUrl,
    definition: {
      title: "Spectral Exposure per Wavelength (Metric)",
      titlePlural: "Spectral Exposures per Wavelength (Metric)",
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
    dataTypeBaseUrl:
      systemDataTypes.joulePerCubicMeterOfWavelength.dataTypeBaseUrl,
    definition: {
      title: "Joule per Cubic Meter of Wavelength",
      titlePlural: "Joules per Cubic Meter of Wavelength",
      description:
        "A wavelength spectral density expressed in J/(m²·m); its spectral variable is wavelength in meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralExposurePerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "J/(m²·m)",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.joulePerSquareMeterNanometer.dataTypeBaseUrl,
    definition: {
      title: "Joule per Square Meter Nanometer",
      titlePlural: "Joules per Square Meter Nanometer",
      description:
        "A wavelength spectral density expressed in J/(m²·nm); equal to 10^9 J/(m²·m).",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["spectralExposurePerWavelength(metric)"]
            .dataTypeId,
        },
      ],
      label: {
        right: "J/(m²·nm)",
      },
    },
    conversions: {
      [systemDataTypes.joulePerCubicMeterOfWavelength.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.electronvoltPerMeter.dataTypeBaseUrl,
    definition: {
      title: "Electronvolt per Meter",
      titlePlural: "Electronvolts per Meter",
      description:
        "A value expressed in eV/m, using the exact SI electronvolt of 1.602176634 × 10^-19 joules.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["energyPerLength(metric)"].dataTypeId,
        },
      ],
      label: {
        right: "eV/m",
      },
    },
    conversions: {
      [systemDataTypes.joulePerMeter.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.electronvoltPerSquareMeter.dataTypeBaseUrl,
    definition: {
      title: "Electronvolt per Square Meter",
      titlePlural: "Electronvolts per Square Meter",
      description:
        "A value expressed in eV/m², using the exact SI electronvolt of 1.602176634 × 10^-19 joules.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["energyPerArea(metric)"].dataTypeId,
        },
      ],
      label: {
        right: "eV/m²",
      },
    },
    conversions: {
      [systemDataTypes.joulePerSquareMeter.dataTypeBaseUrl]: {
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
