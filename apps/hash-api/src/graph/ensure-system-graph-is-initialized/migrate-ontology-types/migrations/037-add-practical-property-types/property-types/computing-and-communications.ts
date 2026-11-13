import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MeasurementPropertyType } from "../property-types";

export const computingAndCommunicationsPropertyTypes: MeasurementPropertyType[] =
  [
    {
      title: "Installed Memory Capacity",
      description:
        "The digital storage capacity of the memory installed in a device.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.information.dataTypeId,
        },
      ],
    },
    {
      title: "Available Memory Capacity",
      description:
        "The digital memory capacity available for allocation at the observation time under the stated accounting method.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.information.dataTypeId,
        },
      ],
    },
    {
      title: "Available Storage Capacity",
      description:
        "The digital storage capacity available for additional data at the observation time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.information.dataTypeId,
        },
      ],
    },
    {
      title: "Network Upload Rate",
      description:
        "The rate of digital data sent from the observed endpoint, with the measurement layer and averaging interval stated.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
    },
    {
      title: "Network Download Rate",
      description:
        "The rate of digital data received by the observed endpoint, with the measurement layer and averaging interval stated.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
    },
    {
      title: "Network Round Trip Time",
      description:
        "The elapsed time for a request to travel from the observed endpoint to its destination and for the corresponding response to return.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    {
      title: "Packet Loss Fraction",
      description:
        "The number of packets classified as lost divided by the number of packets sent within the stated observation window and timeout convention.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    {
      title: "Bit Error Fraction",
      description:
        "The number of incorrectly received binary digits divided by the number of binary digits checked over the same observation interval.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    {
      title: "Sampling Frequency",
      description:
        "The number of regularly spaced samples taken per unit time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.frequency.dataTypeId,
        },
      ],
    },
    {
      title: "ADC Resolution",
      description:
        "The number of binary digits in the nominal output code of an analogue-to-digital converter; this is a whole-number code width.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.positiveInteger.dataTypeId,
        },
      ],
    },
    {
      title: "Service Availability",
      description:
        "The time a service met its stated availability criterion divided by the total time included in the reporting interval.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    {
      title: "Request Count",
      description:
        "The number of requests recorded under the stated counting rules during the observation interval.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
        },
      ],
    },
    {
      title: "Packet Count",
      description:
        "The number of network packets recorded at the stated observation point during the observation interval.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
        },
      ],
    },
  ];
