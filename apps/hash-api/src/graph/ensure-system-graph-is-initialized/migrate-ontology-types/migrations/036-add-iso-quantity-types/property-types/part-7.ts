import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoPropertyType } from "../property-types";

export const part7PropertyTypes: IsoPropertyType[] = [
  {
    definition: {
      title: "Speed of Light in a Medium",
      description:
        "The speed of light in a medium of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.speed.dataTypeId,
        },
      ],
    },
    isoItems: ["7-1.1"],
  },
  {
    definition: {
      title: "Refractive Index",
      description:
        "The ratio of light speed in vacuum to its phase speed in the medium.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["7-1.2"],
  },
  {
    definition: {
      title: "Radiant Energy",
      description:
        "The radiant energy of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["7-2.1", "10-45"],
  },
  {
    definition: {
      title: "Spectral Radiant Energy",
      description:
        "The spectral radiant energy of the specified system or process in light and radiation. This value is a density per wavelength, not per frequency; state the wavelength at which it is evaluated.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.spectralEnergyPerWavelength.dataTypeId,
        },
      ],
    },
    isoItems: ["7-2.2"],
  },
  {
    definition: {
      title: "Radiant Energy Density",
      description:
        "The radiant energy density of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energyDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["7-3.1"],
  },
  {
    definition: {
      title: "Spectral Radiant Energy Density in Terms of Wavelength",
      description:
        "The spectral radiant energy density in terms of wavelength of the specified system or process in light and radiation. This value is a density per wavelength, not per frequency; state the wavelength at which it is evaluated.",
      possibleValues: [
        {
          dataTypeId:
            systemDataTypes.spectralEnergyDensityPerWavelength.dataTypeId,
        },
      ],
    },
    isoItems: ["7-3.2"],
  },
  {
    definition: {
      title: "Radiant Energy Density per Wavenumber",
      description:
        "The spectral radiant energy density in terms of wavenumber of the specified system or process in light and radiation. This value is a density per wavelength, not per frequency; state the wavelength at which it is evaluated.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energyPerArea.dataTypeId,
        },
      ],
    },
    isoItems: ["7-3.3"],
  },
  {
    definition: {
      title: "Radiant Flux",
      description: "The rate at which radiant energy is transferred.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.power.dataTypeId,
        },
      ],
    },
    isoItems: ["7-4.1"],
  },
  {
    definition: {
      title: "Spectral Radiant Flux",
      description:
        "The spectral radiant flux of the specified system or process in light and radiation. This value is a density per wavelength, not per frequency; state the wavelength at which it is evaluated.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.spectralPowerPerWavelength.dataTypeId,
        },
      ],
    },
    isoItems: ["7-4.2"],
  },
  {
    definition: {
      title: "Radiant Intensity",
      description:
        "The radiant intensity of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.radiantIntensity.dataTypeId,
        },
      ],
    },
    isoItems: ["7-5.1"],
  },
  {
    definition: {
      title: "Spectral Radiant Intensity",
      description:
        "The spectral radiant intensity of the specified system or process in light and radiation. This value is a density per wavelength, not per frequency; state the wavelength at which it is evaluated.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.spectralIntensityPerWavelength.dataTypeId,
        },
      ],
    },
    isoItems: ["7-5.2"],
  },
  {
    definition: {
      title: "Radiance",
      description: "Radiant power per unit projected area and solid angle.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.radiance.dataTypeId,
        },
      ],
    },
    isoItems: ["7-6.1"],
  },
  {
    definition: {
      title: "Spectral Radiance",
      description:
        "The spectral radiance of the specified system or process in light and radiation. This value is a density per wavelength, not per frequency; state the wavelength at which it is evaluated.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.spectralRadiancePerWavelength.dataTypeId,
        },
      ],
    },
    isoItems: ["7-6.2"],
  },
  {
    definition: {
      title: "Irradiance",
      description: "Radiant power incident per unit area.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["7-7.1"],
  },
  {
    definition: {
      title: "Spectral Irradiance",
      description:
        "The spectral irradiance of the specified system or process in light and radiation. This value is a density per wavelength, not per frequency; state the wavelength at which it is evaluated.",
      possibleValues: [
        {
          dataTypeId:
            systemDataTypes.spectralIrradiancePerWavelength.dataTypeId,
        },
      ],
    },
    isoItems: ["7-7.2"],
  },
  {
    definition: {
      title: "Radiant Exitance",
      description: "Radiant power leaving a surface per unit area.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["7-8.1"],
  },
  {
    definition: {
      title: "Spectral Radiant Exitance",
      description:
        "The spectral radiant exitance of the specified system or process in light and radiation. This value is a density per wavelength, not per frequency; state the wavelength at which it is evaluated.",
      possibleValues: [
        {
          dataTypeId:
            systemDataTypes.spectralIrradiancePerWavelength.dataTypeId,
        },
      ],
    },
    isoItems: ["7-8.2"],
  },
  {
    definition: {
      title: "Radiant Exposure",
      description:
        "The radiant exposure of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energyPerArea.dataTypeId,
        },
      ],
    },
    isoItems: ["7-9.1"],
  },
  {
    definition: {
      title: "Spectral Radiant Exposure",
      description:
        "The spectral radiant exposure of the specified system or process in light and radiation. This value is a density per wavelength, not per frequency; state the wavelength at which it is evaluated.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.spectralExposurePerWavelength.dataTypeId,
        },
      ],
    },
    isoItems: ["7-9.2"],
  },
  {
    definition: {
      title: "Luminous Efficiency",
      description:
        "The luminous efficiency of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["7-10.1"],
  },
  {
    definition: {
      title: "Spectral Luminous Efficiency",
      description:
        "The spectral luminous efficiency of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["7-10.2"],
  },
  {
    definition: {
      title: "Luminous Efficacy of Radiation",
      description:
        "The luminous efficacy of radiation of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.luminousEfficacy.dataTypeId,
        },
      ],
    },
    isoItems: ["7-11.1"],
  },
  {
    definition: {
      title: "Spectral Luminous Efficacy",
      description:
        "The spectral luminous efficacy of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.luminousEfficacy.dataTypeId,
        },
      ],
    },
    isoItems: ["7-11.2"],
  },
  {
    definition: {
      title: "Maximum Luminous Efficacy",
      description:
        "The maximum luminous efficacy of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.luminousEfficacy.dataTypeId,
        },
      ],
    },
    isoItems: ["7-11.3"],
  },
  {
    definition: {
      title: "Luminous Efficacy of a Source",
      description:
        "Emitted luminous flux divided by the input power of the source.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.luminousEfficacy.dataTypeId,
        },
      ],
    },
    isoItems: ["7-11.4"],
  },
  {
    definition: {
      title: "Luminous Energy",
      description:
        "The luminous energy of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.luminousEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["7-12"],
  },
  {
    definition: {
      title: "Luminous Flux",
      description:
        "The luminous flux of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.luminousFlux.dataTypeId,
        },
      ],
    },
    isoItems: ["7-13"],
  },
  {
    definition: {
      title: "Luminous Intensity",
      description:
        "The luminous intensity of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.luminousIntensity.dataTypeId,
        },
      ],
    },
    isoItems: ["7-14"],
  },
  {
    definition: {
      title: "Luminance",
      description:
        "Luminous intensity per unit projected area in a specified direction.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.luminance.dataTypeId,
        },
      ],
    },
    isoItems: ["7-15"],
  },
  {
    definition: {
      title: "Illuminance",
      description:
        "The illuminance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.illuminance.dataTypeId,
        },
      ],
    },
    isoItems: ["7-16"],
  },
  {
    definition: {
      title: "Luminous Exitance",
      description:
        "The luminous exitance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.illuminance.dataTypeId,
        },
      ],
    },
    isoItems: ["7-17"],
  },
  {
    definition: {
      title: "Luminous Exposure",
      description:
        "The luminous exposure of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.luminousExposure.dataTypeId,
        },
      ],
    },
    isoItems: ["7-18"],
  },
  {
    definition: {
      title: "Photon Number",
      description:
        "The photon number of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["7-19.1"],
  },
  {
    definition: {
      title: "Photon Energy",
      description:
        "The photon energy of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["7-19.2"],
  },
  {
    definition: {
      title: "Photon Flux",
      description:
        "The photon flux of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalDuration.dataTypeId,
        },
      ],
    },
    isoItems: ["7-20"],
  },
  {
    definition: {
      title: "Photon Intensity",
      description:
        "The photon intensity of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.particleIntensity.dataTypeId,
        },
      ],
    },
    isoItems: ["7-21"],
  },
  {
    definition: {
      title: "Photon Radiance",
      description:
        "The photon radiance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.particleRadiance.dataTypeId,
        },
      ],
    },
    isoItems: ["7-22"],
  },
  {
    definition: {
      title: "Photon Irradiance",
      description:
        "The photon irradiance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.particleFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["7-23"],
  },
  {
    definition: {
      title: "Photon Exitance",
      description:
        "The photon exitance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.particleFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["7-24"],
  },
  {
    definition: {
      title: "Photon Exposure",
      description:
        "The photon exposure of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.numberPerArea.dataTypeId,
        },
      ],
    },
    isoItems: ["7-25"],
  },
  {
    definition: {
      title: "Tristimulus Values for the CIE 1931 Standard Observer",
      description:
        "The tristimulus values for the CIE 1931 standard observer of the specified system or process in light and radiation.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.cie1931XTristimulusValue.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.cie1931XTristimulusValue
                  .propertyTypeId,
              },
            [systemPropertyTypes.cie1931YTristimulusValue.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.cie1931YTristimulusValue
                  .propertyTypeId,
              },
            [systemPropertyTypes.cie1931ZTristimulusValue.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.cie1931ZTristimulusValue
                  .propertyTypeId,
              },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.cie1931XTristimulusValue.propertyTypeBaseUrl,
            systemPropertyTypes.cie1931YTristimulusValue.propertyTypeBaseUrl,
            systemPropertyTypes.cie1931ZTristimulusValue.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["7-26.1"],
  },
  {
    definition: {
      title: "Tristimulus Values for the CIE 1964 Standard Observer",
      description:
        "The tristimulus values for the CIE 1964 standard observer of the specified system or process in light and radiation.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.cie1964XTristimulusValue.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.cie1964XTristimulusValue
                  .propertyTypeId,
              },
            [systemPropertyTypes.cie1964YTristimulusValue.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.cie1964YTristimulusValue
                  .propertyTypeId,
              },
            [systemPropertyTypes.cie1964ZTristimulusValue.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.cie1964ZTristimulusValue
                  .propertyTypeId,
              },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.cie1964XTristimulusValue.propertyTypeBaseUrl,
            systemPropertyTypes.cie1964YTristimulusValue.propertyTypeBaseUrl,
            systemPropertyTypes.cie1964ZTristimulusValue.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["7-26.2"],
  },
  {
    definition: {
      title: "CIE Colour-matching Functions for the CIE 1931 Standard Observer",
      description:
        "The CIE colour-matching functions for the CIE 1931 standard observer of the specified system or process in light and radiation.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.cie1931XColorMatchingValue
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1931XColorMatchingValue
                .propertyTypeId,
            },
            [systemPropertyTypes.cie1931YColorMatchingValue
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1931YColorMatchingValue
                .propertyTypeId,
            },
            [systemPropertyTypes.cie1931ZColorMatchingValue
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1931ZColorMatchingValue
                .propertyTypeId,
            },
            [systemPropertyTypes.wavelength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.wavelength.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.cie1931XColorMatchingValue.propertyTypeBaseUrl,
            systemPropertyTypes.cie1931YColorMatchingValue.propertyTypeBaseUrl,
            systemPropertyTypes.cie1931ZColorMatchingValue.propertyTypeBaseUrl,
            systemPropertyTypes.wavelength.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["7-27.1"],
  },
  {
    definition: {
      title: "CIE Colour-matching Functions for the CIE 1964 Standard Observer",
      description:
        "The CIE colour-matching functions for the CIE 1964 standard observer of the specified system or process in light and radiation.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.cie1964XColorMatchingValue
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1964XColorMatchingValue
                .propertyTypeId,
            },
            [systemPropertyTypes.cie1964YColorMatchingValue
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1964YColorMatchingValue
                .propertyTypeId,
            },
            [systemPropertyTypes.cie1964ZColorMatchingValue
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1964ZColorMatchingValue
                .propertyTypeId,
            },
            [systemPropertyTypes.wavelength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.wavelength.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.cie1964XColorMatchingValue.propertyTypeBaseUrl,
            systemPropertyTypes.cie1964YColorMatchingValue.propertyTypeBaseUrl,
            systemPropertyTypes.cie1964ZColorMatchingValue.propertyTypeBaseUrl,
            systemPropertyTypes.wavelength.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["7-27.2"],
  },
  {
    definition: {
      title: "Chromaticity Coordinates in the CIE 1931 Standard System",
      description:
        "The chromaticity coordinates in the CIE 1931 standard system of the specified system or process in light and radiation.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.cie1931XChromaticityCoordinate
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1931XChromaticityCoordinate
                .propertyTypeId,
            },
            [systemPropertyTypes.cie1931YChromaticityCoordinate
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1931YChromaticityCoordinate
                .propertyTypeId,
            },
            [systemPropertyTypes.cie1931ZChromaticityCoordinate
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1931ZChromaticityCoordinate
                .propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.cie1931XChromaticityCoordinate
              .propertyTypeBaseUrl,
            systemPropertyTypes.cie1931YChromaticityCoordinate
              .propertyTypeBaseUrl,
            systemPropertyTypes.cie1931ZChromaticityCoordinate
              .propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["7-28.1"],
  },
  {
    definition: {
      title: "Chromaticity Coordinates in the CIE 1964 Standard System",
      description:
        "The chromaticity coordinates in the CIE 1964 standard system of the specified system or process in light and radiation.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.cie1964XChromaticityCoordinate
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1964XChromaticityCoordinate
                .propertyTypeId,
            },
            [systemPropertyTypes.cie1964YChromaticityCoordinate
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1964YChromaticityCoordinate
                .propertyTypeId,
            },
            [systemPropertyTypes.cie1964ZChromaticityCoordinate
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cie1964ZChromaticityCoordinate
                .propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.cie1964XChromaticityCoordinate
              .propertyTypeBaseUrl,
            systemPropertyTypes.cie1964YChromaticityCoordinate
              .propertyTypeBaseUrl,
            systemPropertyTypes.cie1964ZChromaticityCoordinate
              .propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["7-28.2"],
  },
  {
    definition: {
      title: "Colour Temperature",
      description:
        "The colour temperature of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.temperature.dataTypeId,
        },
      ],
    },
    isoItems: ["7-29.1"],
  },
  {
    definition: {
      title: "Correlated Colour Temperature",
      description:
        "The correlated colour temperature of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.temperature.dataTypeId,
        },
      ],
    },
    isoItems: ["7-29.2"],
  },
  {
    definition: {
      title: "Emissivity",
      description:
        "The emissivity of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["7-30.1"],
  },
  {
    definition: {
      title: "Emissivity at a Specified Wavelength",
      description:
        "The emissivity at a specified wavelength of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["7-30.2"],
  },
  {
    definition: {
      title: "Absorptance",
      description:
        "The absorptance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["7-31.1"],
  },
  {
    definition: {
      title: "Luminous Absorptance",
      description:
        "The luminous absorptance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["7-31.2"],
  },
  {
    definition: {
      title: "Reflectance",
      description:
        "The reflectance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["7-31.3"],
  },
  {
    definition: {
      title: "Luminous Reflectance",
      description:
        "The luminous reflectance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["7-31.4"],
  },
  {
    definition: {
      title: "Transmittance",
      description:
        "The transmittance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["7-31.5"],
  },
  {
    definition: {
      title: "Luminous Transmittance",
      description:
        "The luminous transmittance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["7-31.6"],
  },
  {
    definition: {
      title: "Transmittance Optical Density",
      description:
        "The transmittance optical density of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["7-32.1"],
  },
  {
    definition: {
      title: "Napierian Absorbance",
      description:
        "The Napierian absorbance of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["7-32.2"],
  },
  {
    definition: {
      title: "Radiance Factor",
      description:
        "The radiance factor of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["7-33.1"],
  },
  {
    definition: {
      title: "Luminance Factor",
      description:
        "The luminance factor of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["7-33.2"],
  },
  {
    definition: {
      title: "Reflectance Factor",
      description:
        "The reflectance factor of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["7-34"],
  },
  {
    definition: {
      title: "Linear Attenuation Coefficient",
      description:
        "The linear attenuation coefficient of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["7-35.1", "10-49"],
  },
  {
    definition: {
      title: "Linear Absorption Coefficient",
      description:
        "The linear absorption coefficient of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["7-35.2"],
  },
  {
    definition: {
      title: "Mass Attenuation Coefficient",
      description:
        "The mass attenuation coefficient of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.areaPerMass.dataTypeId,
        },
      ],
    },
    isoItems: ["7-36.1", "10-50"],
  },
  {
    definition: {
      title: "Mass Absorption Coefficient",
      description:
        "The mass absorption coefficient of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.areaPerMass.dataTypeId,
        },
      ],
    },
    isoItems: ["7-36.2"],
  },
  {
    definition: {
      title: "Molar Absorption Coefficient",
      description:
        "The molar absorption coefficient of the specified system or process in light and radiation.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.areaPerAmount.dataTypeId,
        },
      ],
    },
    isoItems: ["7-37"],
  },
];
