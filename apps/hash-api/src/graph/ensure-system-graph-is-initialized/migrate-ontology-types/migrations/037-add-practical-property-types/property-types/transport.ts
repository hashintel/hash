import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MeasurementPropertyType } from "../property-types";

export const transportPropertyTypes: MeasurementPropertyType[] = [
  {
    title: "Travel Distance",
    description:
      "The length of the path traveled over the stated journey or observation interval.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Travel Duration",
    description:
      "The elapsed time between the stated start and end of a journey.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.duration.dataTypeId,
      },
    ],
  },
  {
    title: "Vehicle Ground Speed",
    description:
      "The speed of a vehicle relative to the ground at the observation time.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.speed.dataTypeId,
      },
    ],
  },
  {
    title: "Indicated Airspeed",
    description:
      "The airspeed shown by the aircraft airspeed instrument, before corrections for instrument and position error.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.speed.dataTypeId,
      },
    ],
  },
  {
    title: "True Airspeed",
    description:
      "The speed of an aircraft relative to the surrounding air mass.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.speed.dataTypeId,
      },
    ],
  },
  {
    title: "Fuel Volume Consumed",
    description:
      "The volume of fuel consumed over the stated journey or observation interval, with its volume reference conditions stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.volume.dataTypeId,
      },
    ],
  },
  {
    title: "Fuel Consumption",
    description:
      "The volume of fuel consumed divided by the distance traveled over the same stated journey or test cycle.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.fuelConsumption.dataTypeId,
      },
    ],
  },
  {
    title: "Fuel Economy",
    description:
      "The distance traveled divided by the volume of fuel consumed over the same stated journey or test cycle.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.fuelEconomy.dataTypeId,
      },
    ],
  },
  {
    title: "Vehicle Range",
    description:
      "The distance a vehicle can travel with its stated usable fuel or stored energy under the stated operating conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Cold Tyre Gauge Pressure",
    description:
      "The pressure inside a tyre relative to ambient pressure, measured under the stated cold-tyre conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.pressure.dataTypeId,
      },
    ],
  },
];
