import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MeasurementPropertyType } from "../property-types";

export const environmentPropertyTypes: MeasurementPropertyType[] = [
  {
    title: "Ambient Air Temperature",
    description:
      "The temperature of the surrounding air at the observation location and time.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.temperature.dataTypeId,
      },
    ],
  },
  {
    title: "Soil Temperature",
    description:
      "The temperature of soil at the stated sampling location and depth.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.temperature.dataTypeId,
      },
    ],
  },
  {
    title: "Water Temperature",
    description:
      "The temperature of water at the stated sampling location and time.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.temperature.dataTypeId,
      },
    ],
  },
  {
    title: "Surface Temperature",
    description:
      "The temperature of a specified surface at the observation location and time.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.temperature.dataTypeId,
      },
    ],
  },
  {
    title: "Atmospheric Pressure",
    description:
      "The absolute pressure exerted by the atmosphere at the observation location; any reduction to a reference altitude is stated with the observation.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.pressure.dataTypeId,
      },
    ],
  },
  {
    title: "Wind Speed",
    description:
      "The speed of air relative to the observation location, measured at a stated height and over a stated averaging interval.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.speed.dataTypeId,
      },
    ],
  },
  {
    title: "Wind Gust Speed",
    description:
      "The maximum wind speed measured using the stated gust averaging duration within an observation interval.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.speed.dataTypeId,
      },
    ],
  },
  {
    title: "Rainfall Depth",
    description:
      "The liquid-equivalent depth of precipitation accumulated on a horizontal surface over the stated observation interval.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Snow Depth",
    description:
      "The vertical depth of the snow layer above the underlying surface at the observation location.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Water Level",
    description:
      "The vertical position of a water surface relative to a stated datum; positive values are above the datum.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Soil Water Volume Fraction",
    description:
      "The volume of liquid water divided by the total bulk volume of the sampled soil, including its pores.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
      },
    ],
  },
  {
    title: "Carbon Dioxide Mole Fraction",
    description:
      "The amount of carbon dioxide divided by the total amount of gas in the sample; the wet or dry gas basis is stated with the measurement.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
      },
    ],
  },
  {
    title: "Dissolved Oxygen Mass Concentration",
    description:
      "The mass of dissolved molecular oxygen per volume of the solution at the measurement conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.massDensity.dataTypeId,
      },
    ],
  },
  {
    title: "Dissolved Oxygen Amount Concentration",
    description:
      "The amount of dissolved molecular oxygen per volume of the solution at the measurement conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.amountConcentration.dataTypeId,
      },
    ],
  },
  {
    title: "Water Electrical Conductivity",
    description:
      "The electrical conductivity of a water sample, with the measurement temperature and any temperature compensation stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
      },
    ],
  },
];
