import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MeasurementPropertyType } from "../property-types";

export const electricityAndEnergyPropertyTypes: MeasurementPropertyType[] = [
  {
    title: "Battery Charge Capacity",
    description:
      "The electric charge a battery can deliver under the stated discharge rate, temperature, and cutoff conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.electricCharge.dataTypeId,
      },
    ],
  },
  {
    title: "Battery Energy Capacity",
    description:
      "The electrical energy a battery can deliver under the stated discharge and cutoff conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.energy.dataTypeId,
      },
    ],
  },
  {
    title: "Battery State of Charge",
    description:
      "The remaining usable charge divided by the usable charge at the stated fully charged reference condition.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
      },
    ],
  },
  {
    title: "Battery Cycle Count",
    description:
      "The number of completed charge-discharge cycles under the stated cycle-counting convention; each counted cycle is a whole event.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
      },
    ],
  },
  {
    title: "Nominal Supply Voltage",
    description:
      "The designated voltage between the specified supply terminals, with the polarity or AC RMS convention stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId,
      },
    ],
  },
  {
    title: "Supply Frequency",
    description: "The frequency of the alternating electrical supply.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.frequency.dataTypeId,
      },
    ],
  },
  {
    title: "Rated Input Power",
    description:
      "The active power an item of equipment is rated to draw under its stated operating conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.power.dataTypeId,
      },
    ],
  },
  {
    title: "Electrical Energy Consumed",
    description:
      "The active electrical energy imported and consumed over the stated metering interval.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.energy.dataTypeId,
      },
    ],
  },
  {
    title: "Electrical Energy Exported",
    description:
      "The active electrical energy delivered to an external circuit or grid over the stated metering interval.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.energy.dataTypeId,
      },
    ],
  },
  {
    title: "Instantaneous Electrical Power",
    description:
      "The signed electrical power at the observation time, with the positive direction of energy transfer stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.power.dataTypeId,
      },
    ],
  },
  {
    title: "Solar Irradiance",
    description:
      "The solar radiant power incident per unit area of a surface, with the surface orientation and spectral range stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.heatFluxDensity.dataTypeId,
      },
    ],
  },
  {
    title: "Peak Solar Power",
    description:
      "The maximum electrical output power of a photovoltaic device under the stated test conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.power.dataTypeId,
      },
    ],
  },
  {
    title: "Charging Current",
    description:
      "The current flowing into a battery or other charge-storage device, with the positive charging direction stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.electricCurrent.dataTypeId,
      },
    ],
  },
  {
    title: "Leakage Current",
    description:
      "The current flowing through an unintended or insulating path under the stated test conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.electricCurrent.dataTypeId,
      },
    ],
  },
  {
    title: "Insulation Resistance",
    description:
      "The resistance measured through insulation between the stated conductors or between a conductor and earth under the stated test conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.electricResistance.dataTypeId,
      },
    ],
  },
  {
    title: "Cable Resistance",
    description:
      "The electrical resistance between the specified ends of a cable conductor at the stated temperature.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.electricResistance.dataTypeId,
      },
    ],
  },
  {
    title: "Winding Inductance",
    description:
      "The inductance of the specified winding under the stated frequency, current, and magnetic conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.inductance.dataTypeId,
      },
    ],
  },
  {
    title: "Rated Apparent Power",
    description:
      "The apparent power an AC device is rated to handle under its stated operating conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.apparentPower.dataTypeId,
      },
    ],
  },
  {
    title: "Rated Reactive Power",
    description:
      "The reactive power an AC device is rated to supply or absorb, with the sign convention stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.reactivePower.dataTypeId,
      },
    ],
  },
  {
    title: "Photovoltaic Conversion Efficiency",
    description:
      "The electrical output energy divided by the solar radiant energy incident on the stated collecting area over the same interval.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
      },
    ],
  },
];
