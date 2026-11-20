import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MeasurementPropertyType } from "../property-types";

export const dimensionsAndCapacityPropertyTypes: MeasurementPropertyType[] = [
  {
    title: "Product Depth",
    description:
      "The front-to-back extent of a product in its stated orientation.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Inner Diameter",
    description:
      "The diameter of the inside boundary of a circular opening, tube, or hollow component.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Outer Diameter",
    description:
      "The diameter of the outside boundary of a circular component.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Wall Thickness",
    description:
      "The distance between the inner and outer surfaces of a wall at the stated measurement location.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Cable Length",
    description: "The length of a cable measured along its path.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Wheelbase",
    description:
      "The longitudinal distance between the front and rear axle reference lines of a vehicle; the axle pair is identified for vehicles with more than two axles.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Ground Clearance",
    description:
      "The vertical distance from the ground to the lowest specified part of a vehicle under the stated loading conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Site Elevation",
    description:
      "The vertical position of a site relative to a stated vertical datum; positive values are above the datum.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.length.dataTypeId,
      },
    ],
  },
  {
    title: "Floor Area",
    description:
      "The horizontal area of floors included by the stated building measurement method.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.area.dataTypeId,
      },
    ],
  },
  {
    title: "Land Area",
    description:
      "The horizontal area enclosed by the boundary of a parcel of land.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.area.dataTypeId,
      },
    ],
  },
  {
    title: "Tank Capacity",
    description:
      "The maximum liquid volume a tank is designed to contain under its stated filling conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.volume.dataTypeId,
      },
    ],
  },
  {
    title: "Usable Tank Capacity",
    description:
      "The liquid volume available for use between the stated upper and lower operating limits of a tank.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.volume.dataTypeId,
      },
    ],
  },
  {
    title: "Remaining Liquid Volume",
    description:
      "The volume of liquid currently contained in a vessel at the measurement conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.volume.dataTypeId,
      },
    ],
  },
  {
    title: "Tare Mass",
    description:
      "The mass of an empty container or vehicle, including the equipment and packaging specified by the weighing convention.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.mass.dataTypeId,
      },
    ],
  },
  {
    title: "Payload Mass",
    description:
      "The mass of the load carried by a vehicle or container, excluding its tare mass.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.mass.dataTypeId,
      },
    ],
  },
  {
    title: "Maximum Payload Mass",
    description:
      "The greatest payload mass permitted for a vehicle or container under the stated operating conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.mass.dataTypeId,
      },
    ],
  },
];
