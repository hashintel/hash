import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoPropertyType } from "../property-types";

export const part13PropertyTypes: IsoPropertyType[] = [
  {
    definition: {
      title: "Traffic Intensity",
      description:
        "The average number of simultaneously occupied resources during an observation interval.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.trafficIntensity.dataTypeId,
        },
      ],
    },
    isoItems: ["13-1"],
  },
  {
    definition: {
      title: "Traffic Offered Intensity",
      description:
        "The traffic offered intensity of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.trafficIntensity.dataTypeId,
        },
      ],
    },
    isoItems: ["13-2"],
  },
  {
    definition: {
      title: "Traffic Carried Intensity",
      description:
        "The traffic carried intensity of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.trafficIntensity.dataTypeId,
        },
      ],
    },
    isoItems: ["13-3"],
  },
  {
    definition: {
      title: "Mean Queue Length",
      description:
        "The time-averaged number of customers or requests waiting; fractional values are valid.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeNumber.dataTypeId,
        },
      ],
    },
    isoItems: ["13-4"],
  },
  {
    definition: {
      title: "Loss Probability",
      description: "The probability that an offered request is lost.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["13-5"],
  },
  {
    definition: {
      title: "Waiting Probability",
      description: "The probability that an offered request must wait.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["13-6"],
  },
  {
    definition: {
      title: "Call Intensity",
      description:
        "The call intensity of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalDuration.dataTypeId,
        },
      ],
    },
    isoItems: ["13-7"],
  },
  {
    definition: {
      title: "Completed Call Intensity",
      description:
        "The completed call intensity of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalDuration.dataTypeId,
        },
      ],
    },
    isoItems: ["13-8"],
  },
  {
    definition: {
      title: "Storage Capacity",
      description:
        "The quantity of binary storage available; bytes here contain exactly eight bits.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.information.dataTypeId,
        },
      ],
    },
    isoItems: ["13-9"],
  },
  {
    definition: {
      title: "Equivalent Binary Storage Capacity",
      description:
        "The binary storage quantity equivalent to the available distinguishable storage states.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.information.dataTypeId,
        },
      ],
    },
    isoItems: ["13-10"],
  },
  {
    definition: {
      title: "Transfer Rate",
      description:
        "The transfer rate of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalDuration.dataTypeId,
        },
      ],
    },
    isoItems: ["13-11"],
  },
  {
    definition: {
      title: "Period of Data Elements",
      description:
        "The period of data elements of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    isoItems: ["13-12"],
  },
  {
    definition: {
      title: "Binary Digit Rate",
      description: "The number of binary digits transmitted per unit time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
    },
    isoItems: ["13-13"],
  },
  {
    definition: {
      title: "Period of Binary Digits",
      description:
        "The period of binary digits of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    isoItems: ["13-14"],
  },
  {
    definition: {
      title: "Equivalent Binary Digit Rate",
      description:
        "The equivalent binary digit rate of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
    },
    isoItems: ["13-15"],
  },
  {
    definition: {
      title: "Modulation Rate",
      description:
        "The reciprocal of the shortest symbol interval; bits per symbol depend on the coding scheme.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.modulationRate.dataTypeId,
        },
      ],
    },
    isoItems: ["13-16"],
  },
  {
    definition: {
      title: "Quantizing Distortion Power",
      description:
        "The quantizing distortion of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.power.dataTypeId,
        },
      ],
    },
    isoItems: ["13-17"],
  },
  {
    definition: {
      title: "Carrier Power",
      description:
        "The carrier power of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.power.dataTypeId,
        },
      ],
    },
    isoItems: ["13-18"],
  },
  {
    definition: {
      title: "Signal Energy per Binary Digit",
      description:
        "The signal energy per binary digit of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["13-19"],
  },
  {
    definition: {
      title: "Error Probability",
      description:
        "The probability that the specified decision or symbol is incorrect.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["13-20"],
  },
  {
    definition: {
      title: "Hamming Distance",
      description:
        "The number of symbol positions in which two equal-length strings differ.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["13-21"],
  },
  {
    definition: {
      title: "Clock Frequency",
      description:
        "The clock frequency of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.frequency.dataTypeId,
        },
      ],
    },
    isoItems: ["13-22"],
  },
  {
    definition: {
      title: "Decision Content",
      description:
        "The logarithm of the number of available messages, with its logarithmic information unit stated.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-23"],
  },
  {
    definition: {
      title: "Information Content",
      description:
        "The self-information of an event, obtained from the negative logarithm of its probability.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-24"],
  },
  {
    definition: {
      title: "Information Entropy",
      description:
        "The expected self-information of a discrete random variable.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-25"],
  },
  {
    definition: {
      title: "Maximum Information Entropy",
      description:
        "The maximum entropy for the specified set of possible outcomes.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-26"],
  },
  {
    definition: {
      title: "Relative Information Entropy",
      description:
        "Information entropy divided by its maximum for the specified alphabet; this is not Kullback-Leibler divergence.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["13-27"],
  },
  {
    definition: {
      title: "Information Redundancy",
      description:
        "Maximum information entropy minus the actual information entropy.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-28"],
  },
  {
    definition: {
      title: "Relative Information Redundancy",
      description:
        "Information redundancy divided by the maximum information entropy.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["13-29"],
  },
  {
    definition: {
      title: "Joint Information Content",
      description:
        "The joint information content of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-30"],
  },
  {
    definition: {
      title: "Conditional Information Content",
      description:
        "The conditional information content of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-31"],
  },
  {
    definition: {
      title: "Conditional Information Entropy",
      description:
        "The conditional entropy of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-32"],
  },
  {
    definition: {
      title: "Equivocation",
      description:
        "The equivocation of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-33"],
  },
  {
    definition: {
      title: "Irrelevance",
      description:
        "The irrelevance of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-34"],
  },
  {
    definition: {
      title: "Transinformation Content",
      description:
        "The pointwise mutual information between specified events; it may be negative.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-35"],
  },
  {
    definition: {
      title: "Mean Transinformation Content",
      description:
        "The expected mutual information between discrete random variables.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-36"],
  },
  {
    definition: {
      title: "Character Mean Entropy",
      description:
        "The character mean entropy of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-37"],
  },
  {
    definition: {
      title: "Average Information Rate",
      description:
        "The average information rate of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationRate.dataTypeId,
        },
      ],
    },
    isoItems: ["13-38"],
  },
  {
    definition: {
      title: "Character Mean Transinformation Content",
      description:
        "The character mean transinformation content of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-39"],
  },
  {
    definition: {
      title: "Average Transinformation Rate",
      description:
        "The average transinformation rate of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationRate.dataTypeId,
        },
      ],
    },
    isoItems: ["13-40"],
  },
  {
    definition: {
      title: "Channel Capacity per Character",
      description:
        "The channel capacity per character of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationContent.dataTypeId,
        },
      ],
    },
    isoItems: ["13-41"],
  },
  {
    definition: {
      title: "Channel Time Capacity",
      description:
        "The channel time capacity of the specified system or process in information science and technology.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.informationRate.dataTypeId,
        },
      ],
    },
    isoItems: ["13-42"],
  },
];
