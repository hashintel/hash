import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MeasurementPropertyType } from "../property-types";

export const equipmentAndFluidsPropertyTypes: MeasurementPropertyType[] = [
  {
    title: "Inlet Gauge Pressure",
    description:
      "The fluid pressure at an equipment inlet relative to the stated ambient pressure.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.pressure.dataTypeId,
      },
    ],
  },
  {
    title: "Outlet Gauge Pressure",
    description:
      "The fluid pressure at an equipment outlet relative to the stated ambient pressure.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.pressure.dataTypeId,
      },
    ],
  },
  {
    title: "Pressure Drop",
    description:
      "The upstream pressure minus the downstream pressure between two stated locations, using the same pressure reference.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.pressure.dataTypeId,
      },
    ],
  },
  {
    title: "Liquid Volume Flow Rate",
    description:
      "The volume of liquid passing a cross-section per unit time at the actual measurement conditions, with the positive flow direction stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.volumeFlowRate.dataTypeId,
      },
    ],
  },
  {
    title: "Gas Volume Flow Rate",
    description:
      "The volume of gas passing a cross-section per unit time at the actual measurement temperature and pressure, with the positive flow direction stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.volumeFlowRate.dataTypeId,
      },
    ],
  },
  {
    title: "Fuel Mass Flow Rate",
    description:
      "The mass of fuel passing a cross-section per unit time, with the positive flow direction stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.massFlowRate.dataTypeId,
      },
    ],
  },
  {
    title: "Fluid Dynamic Viscosity",
    description:
      "The dynamic viscosity of a fluid at the stated temperature, pressure, and applicable shear conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.dynamicViscosity.dataTypeId,
      },
    ],
  },
  {
    title: "Fluid Kinematic Viscosity",
    description:
      "The kinematic viscosity of a fluid at the stated temperature and pressure.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
      },
    ],
  },
  {
    title: "Fluid Density",
    description:
      "The mass per volume of a fluid at the stated temperature and pressure.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.massDensity.dataTypeId,
      },
    ],
  },
  {
    title: "Shaft Angular Velocity",
    description:
      "The signed rate of rotation of a shaft about its stated axis, with the positive rotational direction stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.angularVelocity.dataTypeId,
      },
    ],
  },
  {
    title: "Shaft Torque",
    description:
      "The signed moment transmitted by a shaft about its stated axis, with the positive rotational direction stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.torque.dataTypeId,
      },
    ],
  },
  {
    title: "Tensile Strength",
    description:
      "The greatest engineering tensile stress sustained by a material specimen in the stated test.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.pressure.dataTypeId,
      },
    ],
  },
  {
    title: "Yield Strength",
    description:
      "The engineering stress at which a material meets the stated yield or proof-strain criterion in the stated test.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.pressure.dataTypeId,
      },
    ],
  },
  {
    title: "Thermal Transmittance",
    description:
      "The heat flow rate through an assembly per unit area and per unit temperature difference under the stated steady-state boundary conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.heatTransferCoefficient.dataTypeId,
      },
    ],
  },
  {
    title: "Pump Hydraulic Power",
    description:
      "The rate at which a pump transfers mechanical energy to a fluid under the stated operating conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.power.dataTypeId,
      },
    ],
  },
  {
    title: "Motor Efficiency",
    description:
      "The useful mechanical output energy divided by the electrical input energy of a motor over the same interval in motoring operation.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
      },
    ],
  },
  {
    title: "Equipment Operating Time",
    description:
      "The accumulated time an item of equipment has spent operating under the stated counting convention.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.duration.dataTypeId,
      },
    ],
  },
  {
    title: "Machine Cycle Duration",
    description:
      "The elapsed time required to complete one stated machine operating cycle.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.duration.dataTypeId,
      },
    ],
  },
];
