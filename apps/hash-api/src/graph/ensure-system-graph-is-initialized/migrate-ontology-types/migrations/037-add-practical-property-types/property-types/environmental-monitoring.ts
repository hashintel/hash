import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MeasurementPropertyType } from "../property-types";

export const environmentalMonitoringPropertyTypes: MeasurementPropertyType[] = [
  {
    title: "Methane Volume Fraction",
    description:
      "The volume of methane divided by the sum of constituent gas volumes at the same temperature and pressure. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Methane Mole Fraction",
    description:
      "The amount of methane divided by the total amount of gas in the sample. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Oxygen Volume Fraction",
    description:
      "The volume of oxygen divided by the sum of constituent gas volumes at the same temperature and pressure. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Oxygen Mole Fraction",
    description:
      "The amount of oxygen divided by the total amount of gas in the sample. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Carbon Monoxide Volume Fraction",
    description:
      "The volume of carbon monoxide divided by the sum of constituent gas volumes at the same temperature and pressure. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Carbon Monoxide Mole Fraction",
    description:
      "The amount of carbon monoxide divided by the total amount of gas in the sample. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Hydrogen Sulphide Volume Fraction",
    description:
      "The volume of hydrogen sulphide divided by the sum of constituent gas volumes at the same temperature and pressure. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Hydrogen Sulphide Mole Fraction",
    description:
      "The amount of hydrogen sulphide divided by the total amount of gas in the sample. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Sulphur Dioxide Volume Fraction",
    description:
      "The volume of sulphur dioxide divided by the sum of constituent gas volumes at the same temperature and pressure. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Sulphur Dioxide Mole Fraction",
    description:
      "The amount of sulphur dioxide divided by the total amount of gas in the sample. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Hydrogen Volume Fraction",
    description:
      "The volume of hydrogen divided by the sum of constituent gas volumes at the same temperature and pressure. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Hydrogen Mole Fraction",
    description:
      "The amount of hydrogen divided by the total amount of gas in the sample. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "Carbon Dioxide Volume Fraction",
    description:
      "The volume of carbon dioxide divided by the sum of constituent gas volumes at the same temperature and pressure. The observation states the wet or dry gas basis.",
    possibleValues: [
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ],
  },
  {
    title: "PM1 Mass Concentration",
    description:
      "The mass of airborne particles selected by the stated PM1 sampling convention per volume of sampled air. The observation records the sampling method and averaging interval.",
    possibleValues: [{ dataTypeId: systemDataTypes.massDensity.dataTypeId }],
  },
  {
    title: "PM2.5 Mass Concentration",
    description:
      "The mass of airborne particles selected by the stated PM2.5 sampling convention per volume of sampled air. The observation records the sampling method and averaging interval.",
    possibleValues: [{ dataTypeId: systemDataTypes.massDensity.dataTypeId }],
  },
  {
    title: "PM10 Mass Concentration",
    description:
      "The mass of airborne particles selected by the stated PM10 sampling convention per volume of sampled air. The observation records the sampling method and averaging interval.",
    possibleValues: [{ dataTypeId: systemDataTypes.massDensity.dataTypeId }],
  },
  {
    title: "Total Suspended Particulate Mass Concentration",
    description:
      "The mass of total suspended particles collected by the stated sampling method per volume of sampled air. The observation records the collection method and averaging interval.",
    possibleValues: [{ dataTypeId: systemDataTypes.massDensity.dataTypeId }],
  },
  {
    title: "Aerosol Particle Number Concentration",
    description:
      "The number of airborne particles per volume of sampled air. The observation states the particle size range and counting method.",
    possibleValues: [
      { dataTypeId: systemDataTypes.numberPerVolume.dataTypeId },
    ],
  },
  {
    title: "Radon Activity Concentration",
    description:
      "The radioactive activity of radon gas per volume of air. The observation identifies the radon isotope, measurement conditions and averaging interval.",
    possibleValues: [
      { dataTypeId: systemDataTypes.activityPerVolume.dataTypeId },
    ],
  },
  {
    title: "Borehole Absolute Pressure",
    description:
      "The absolute pressure of gas in a borehole, measured relative to vacuum at the stated sampling location and time.",
    possibleValues: [{ dataTypeId: systemDataTypes.pressure.dataTypeId }],
  },
  {
    title: "Borehole Gauge Pressure",
    description:
      "The gas pressure in a borehole minus the ambient atmospheric pressure. Positive values indicate pressure above the atmosphere; the observation identifies both measurement locations and times.",
    possibleValues: [{ dataTypeId: systemDataTypes.pressure.dataTypeId }],
  },
  {
    title: "Differential Pressure",
    description:
      "The pressure at the first identified measurement point minus the pressure at the second. The observation states both points and their ordering.",
    possibleValues: [{ dataTypeId: systemDataTypes.pressure.dataTypeId }],
  },
  {
    title: "Wind Direction",
    description:
      "The horizontal direction from which the wind blows, measured clockwise from true north. North is represented by zero degrees or one complete turn; the observation states the measurement height and averaging interval.",
    possibleValues: [{ dataTypeId: systemDataTypes.angle.dataTypeId }],
  },
  {
    title: "Depth to Groundwater",
    description:
      "The vertical distance from the local ground surface down to the groundwater surface. Positive values are below ground and negative values are above ground; the observation identifies the ground reference and monitoring location.",
    possibleValues: [{ dataTypeId: systemDataTypes.length.dataTypeId }],
  },
  {
    title: "Battery Terminal Voltage",
    description:
      "The measured electric potential difference between a battery's positive and negative terminals. The observation states the measurement time and charging or load conditions.",
    possibleValues: [
      { dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId },
    ],
  },
  {
    title: "Measured Supply Voltage",
    description:
      "The measured electric potential difference across the identified power supply terminals. The observation states the load and whether an AC value is instantaneous, RMS or peak.",
    possibleValues: [
      { dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId },
    ],
  },
  {
    title: "Instrument Internal Temperature",
    description:
      "The temperature measured inside an instrument at the stated sensor position and observation time.",
    possibleValues: [{ dataTypeId: systemDataTypes.temperature.dataTypeId }],
  },
  {
    title: "Pump Current",
    description:
      "The measured electric current supplied to a pump. The observation states the operating condition, reference direction and whether an AC value is instantaneous, RMS or peak.",
    possibleValues: [
      { dataTypeId: systemDataTypes.electricCurrent.dataTypeId },
    ],
  },
  {
    title: "Combustible Gas Level Relative to LEL",
    description:
      "The measured combustible gas level expressed as a percentage of the specified lower explosive limit. The observation identifies the target gas or mixture, calibration gas and LEL reference convention.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.percentageOfLowerExplosiveLimit.dataTypeId,
      },
    ],
  },
  {
    title: "Methane Surface Mass Flux Density",
    description:
      "The mass of methane crossing a unit area of the identified surface per unit time. Positive values indicate outward emission; the observation states the surface, averaging interval and measurement method.",
    possibleValues: [
      { dataTypeId: systemDataTypes.massFluxDensity.dataTypeId },
    ],
  },
  {
    title: "Methane Emission Mass Flow Rate",
    description:
      "The mass of methane emitted from the identified source per unit time. The observation states the source boundary, averaging interval and estimation or measurement method.",
    possibleValues: [{ dataTypeId: systemDataTypes.massFlowRate.dataTypeId }],
  },
  {
    title: "Methane Gas Screening Value",
    description:
      "The methane volume fraction multiplied by the borehole gas volume flow rate selected for a ground-gas assessment. The observation records the source measurements, flow reference conditions and assessment method used to select them.",
    possibleValues: [{ dataTypeId: systemDataTypes.volumeFlowRate.dataTypeId }],
  },
  {
    title: "Carbon Dioxide Gas Screening Value",
    description:
      "The carbon dioxide volume fraction multiplied by the borehole gas volume flow rate selected for a ground-gas assessment. The observation records the source measurements, flow reference conditions and assessment method used to select them.",
    possibleValues: [{ dataTypeId: systemDataTypes.volumeFlowRate.dataTypeId }],
  },
  {
    title: "Dissolved Methane Mass Concentration",
    description:
      "The mass of dissolved methane per volume of the solution at the stated measurement conditions.",
    possibleValues: [{ dataTypeId: systemDataTypes.massDensity.dataTypeId }],
  },
  {
    title: "Atmospheric Pressure Change Rate",
    description:
      "The change in atmospheric pressure divided by elapsed time over the stated observation interval. Positive values indicate rising pressure and negative values indicate falling pressure; both pressure readings use the same altitude reference.",
    possibleValues: [
      { dataTypeId: systemDataTypes.pressureChangeRate.dataTypeId },
    ],
  },
];
