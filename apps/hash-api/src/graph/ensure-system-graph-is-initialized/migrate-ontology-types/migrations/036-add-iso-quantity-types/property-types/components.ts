import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoPropertyType } from "../property-types";

export const componentPropertyTypes: IsoPropertyType[] = [
  {
    definition: {
      title: "Cartesian Reference Frame",
      description:
        "The named right-handed orthonormal Cartesian frame, including its origin and axis directions. Components are interpreted in this frame.",
      possibleValues: [
        {
          primitiveDataType: "text",
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Length)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Length)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Length)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Wavenumber)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Wavenumber)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Wavenumber)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Real Part (Wavenumber)",
      description: "The real component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Imaginary Part (Wavenumber)",
      description: "The imaginary component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Angle)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angle.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Angle)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angle.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Angle)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angle.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Angular Velocity)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularVelocity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Angular Velocity)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularVelocity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Angular Velocity)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularVelocity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Speed)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.speed.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Speed)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.speed.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Speed)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.speed.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Acceleration)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.acceleration.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Acceleration)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.acceleration.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Acceleration)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.acceleration.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Angular Acceleration)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularAcceleration.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Angular Acceleration)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularAcceleration.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Angular Acceleration)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularAcceleration.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XX Component (Moment of Inertia)",
      description:
        "The xx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentOfInertia.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XY Component (Moment of Inertia)",
      description:
        "The xy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentOfInertia.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XZ Component (Moment of Inertia)",
      description:
        "The xz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentOfInertia.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YX Component (Moment of Inertia)",
      description:
        "The yx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentOfInertia.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YY Component (Moment of Inertia)",
      description:
        "The yy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentOfInertia.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YZ Component (Moment of Inertia)",
      description:
        "The yz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentOfInertia.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZX Component (Moment of Inertia)",
      description:
        "The zx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentOfInertia.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZY Component (Moment of Inertia)",
      description:
        "The zy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentOfInertia.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZZ Component (Moment of Inertia)",
      description:
        "The zz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentOfInertia.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Momentum)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentum.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Momentum)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentum.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Momentum)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentum.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Force)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.force.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Force)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.force.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Force)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.force.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Impulse)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.impulse.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Impulse)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.impulse.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Impulse)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.impulse.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Angular Momentum)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularMomentum.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Angular Momentum)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularMomentum.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Angular Momentum)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularMomentum.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Torque)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.torque.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Torque)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.torque.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Torque)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.torque.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Angular Impulse)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularImpulse.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Angular Impulse)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularImpulse.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Angular Impulse)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularImpulse.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XX Component (Pressure)",
      description:
        "The xx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XY Component (Pressure)",
      description:
        "The xy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XZ Component (Pressure)",
      description:
        "The xz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YX Component (Pressure)",
      description:
        "The yx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YY Component (Pressure)",
      description:
        "The yy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YZ Component (Pressure)",
      description:
        "The yz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZX Component (Pressure)",
      description:
        "The zx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZY Component (Pressure)",
      description:
        "The zy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZZ Component (Pressure)",
      description:
        "The zz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XX Component (Dimensionless Ratio)",
      description:
        "The xx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XY Component (Dimensionless Ratio)",
      description:
        "The xy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XZ Component (Dimensionless Ratio)",
      description:
        "The xz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YX Component (Dimensionless Ratio)",
      description:
        "The yx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YY Component (Dimensionless Ratio)",
      description:
        "The yy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YZ Component (Dimensionless Ratio)",
      description:
        "The yz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZX Component (Dimensionless Ratio)",
      description:
        "The zx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZY Component (Dimensionless Ratio)",
      description:
        "The zy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZZ Component (Dimensionless Ratio)",
      description:
        "The zz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Mass Flux Density)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.massFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Mass Flux Density)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.massFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Mass Flux Density)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.massFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Electric Dipole Moment)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricDipoleMoment.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Electric Dipole Moment)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricDipoleMoment.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Electric Dipole Moment)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricDipoleMoment.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Surface Charge Density)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.surfaceChargeDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Surface Charge Density)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.surfaceChargeDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Surface Charge Density)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.surfaceChargeDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Electric Current Density)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCurrentDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Electric Current Density)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCurrentDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Electric Current Density)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCurrentDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Magnetic Field Strength)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFieldStrength.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Magnetic Field Strength)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFieldStrength.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Magnetic Field Strength)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFieldStrength.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Electric Field Strength)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricFieldStrength.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Electric Field Strength)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricFieldStrength.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Electric Field Strength)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricFieldStrength.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XX Component (Permittivity)",
      description:
        "The xx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.permittivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XY Component (Permittivity)",
      description:
        "The xy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.permittivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XZ Component (Permittivity)",
      description:
        "The xz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.permittivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YX Component (Permittivity)",
      description:
        "The yx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.permittivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YY Component (Permittivity)",
      description:
        "The yy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.permittivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YZ Component (Permittivity)",
      description:
        "The yz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.permittivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZX Component (Permittivity)",
      description:
        "The zx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.permittivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZY Component (Permittivity)",
      description:
        "The zy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.permittivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZZ Component (Permittivity)",
      description:
        "The zz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.permittivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Magnetic Flux Density)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Magnetic Flux Density)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Magnetic Flux Density)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Magnetic Moment)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticMoment.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Magnetic Moment)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticMoment.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Magnetic Moment)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticMoment.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XX Component (Magnetic Permeability)",
      description:
        "The xx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticPermeability.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XY Component (Magnetic Permeability)",
      description:
        "The xy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticPermeability.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XZ Component (Magnetic Permeability)",
      description:
        "The xz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticPermeability.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YX Component (Magnetic Permeability)",
      description:
        "The yx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticPermeability.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YY Component (Magnetic Permeability)",
      description:
        "The yy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticPermeability.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YZ Component (Magnetic Permeability)",
      description:
        "The yz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticPermeability.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZX Component (Magnetic Permeability)",
      description:
        "The zx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticPermeability.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZY Component (Magnetic Permeability)",
      description:
        "The zy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticPermeability.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZZ Component (Magnetic Permeability)",
      description:
        "The zz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticPermeability.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Magnetic Dipole Moment)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticDipoleMoment.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Magnetic Dipole Moment)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticDipoleMoment.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Magnetic Dipole Moment)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticDipoleMoment.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Magnetic Vector Potential)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticVectorPotential.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Magnetic Vector Potential)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticVectorPotential.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Magnetic Vector Potential)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticVectorPotential.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Heat Flux Density)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Heat Flux Density)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Heat Flux Density)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XX Component (Electric Conductivity)",
      description:
        "The xx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XY Component (Electric Conductivity)",
      description:
        "The xy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XZ Component (Electric Conductivity)",
      description:
        "The xz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YX Component (Electric Conductivity)",
      description:
        "The yx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YY Component (Electric Conductivity)",
      description:
        "The yy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YZ Component (Electric Conductivity)",
      description:
        "The yz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZX Component (Electric Conductivity)",
      description:
        "The zx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZY Component (Electric Conductivity)",
      description:
        "The zy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZZ Component (Electric Conductivity)",
      description:
        "The zz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XX Component (Electric Resistivity)",
      description:
        "The xx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XY Component (Electric Resistivity)",
      description:
        "The xy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XZ Component (Electric Resistivity)",
      description:
        "The xz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YX Component (Electric Resistivity)",
      description:
        "The yx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YY Component (Electric Resistivity)",
      description:
        "The yy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YZ Component (Electric Resistivity)",
      description:
        "The yz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZX Component (Electric Resistivity)",
      description:
        "The zx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZY Component (Electric Resistivity)",
      description:
        "The zy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZZ Component (Electric Resistivity)",
      description:
        "The zz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistivity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Real Part (Electric Current)",
      description: "The real component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCurrent.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Imaginary Part (Electric Current)",
      description: "The imaginary component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCurrent.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Phasor Convention",
      description:
        "The time-dependence convention for this phasor; state the exponential sign and whether the amplitude is peak or RMS.",
      possibleValues: [
        {
          primitiveDataType: "text",
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Real Part (Electric Potential Difference)",
      description: "The real component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Imaginary Part (Electric Potential Difference)",
      description: "The imaginary component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Real Part (Electric Resistance)",
      description: "The real component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistance.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Imaginary Part (Electric Resistance)",
      description: "The imaginary component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistance.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Real Part (Electric Conductance)",
      description: "The real component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductance.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Imaginary Part (Electric Conductance)",
      description: "The imaginary component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductance.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Real Part (Apparent Power)",
      description: "The real component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.apparentPower.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Imaginary Part (Apparent Power)",
      description: "The imaginary component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.apparentPower.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1931 X Tristimulus Value",
      description: "The x component for the CIE 1931 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1931 Y Tristimulus Value",
      description: "The y component for the CIE 1931 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1931 Z Tristimulus Value",
      description: "The z component for the CIE 1931 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1964 X Tristimulus Value",
      description: "The x component for the CIE 1964 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1964 Y Tristimulus Value",
      description: "The y component for the CIE 1964 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1964 Z Tristimulus Value",
      description: "The z component for the CIE 1964 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1931 X Color-matching Value",
      description: "The x component for the CIE 1931 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1931 Y Color-matching Value",
      description: "The y component for the CIE 1931 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1931 Z Color-matching Value",
      description: "The z component for the CIE 1931 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1964 X Color-matching Value",
      description: "The x component for the CIE 1964 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1964 Y Color-matching Value",
      description: "The y component for the CIE 1964 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1964 Z Color-matching Value",
      description: "The z component for the CIE 1964 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1931 X Chromaticity Coordinate",
      description: "The x component for the CIE 1931 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.unitInterval.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1931 Y Chromaticity Coordinate",
      description: "The y component for the CIE 1931 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.unitInterval.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1931 Z Chromaticity Coordinate",
      description: "The z component for the CIE 1931 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.unitInterval.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1964 X Chromaticity Coordinate",
      description: "The x component for the CIE 1964 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.unitInterval.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1964 Y Chromaticity Coordinate",
      description: "The y component for the CIE 1964 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.unitInterval.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "CIE 1964 Z Chromaticity Coordinate",
      description: "The z component for the CIE 1964 standard observer.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.unitInterval.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Real Part (Acoustic Impedance)",
      description: "The real component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.acousticImpedance.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Imaginary Part (Acoustic Impedance)",
      description: "The imaginary component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.acousticImpedance.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XX Component (Kinematic Viscosity)",
      description:
        "The xx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XY Component (Kinematic Viscosity)",
      description:
        "The xy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XZ Component (Kinematic Viscosity)",
      description:
        "The xz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YX Component (Kinematic Viscosity)",
      description:
        "The yx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YY Component (Kinematic Viscosity)",
      description:
        "The yy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YZ Component (Kinematic Viscosity)",
      description:
        "The yz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZX Component (Kinematic Viscosity)",
      description:
        "The zx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZY Component (Kinematic Viscosity)",
      description:
        "The zy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZZ Component (Kinematic Viscosity)",
      description:
        "The zz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Action)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.action.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Action)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.action.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Action)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.action.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "X Component (Particle Flux Density)",
      description:
        "The signed x component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.particleFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Y Component (Particle Flux Density)",
      description:
        "The signed y component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.particleFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Z Component (Particle Flux Density)",
      description:
        "The signed z component in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.particleFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "First Lattice Basis Vector",
      description:
        "One of the three basis vectors defining the stated lattice.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.yComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.zComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Second Lattice Basis Vector",
      description:
        "One of the three basis vectors defining the stated lattice.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.yComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.zComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Third Lattice Basis Vector",
      description:
        "One of the three basis vectors defining the stated lattice.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.yComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.zComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "First Reciprocal Lattice Basis Vector",
      description:
        "One of the three basis vectors defining the stated lattice.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.yComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.zComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Second Reciprocal Lattice Basis Vector",
      description:
        "One of the three basis vectors defining the stated lattice.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.yComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.zComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Third Reciprocal Lattice Basis Vector",
      description:
        "One of the three basis vectors defining the stated lattice.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.yComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.zComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Real Part (Dimensionless Ratio)",
      description: "The real component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "Imaginary Part (Dimensionless Ratio)",
      description: "The imaginary component of a complex value.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XX Component (Mass)",
      description:
        "The xx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XY Component (Mass)",
      description:
        "The xy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "XZ Component (Mass)",
      description:
        "The xz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YX Component (Mass)",
      description:
        "The yx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YY Component (Mass)",
      description:
        "The yy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "YZ Component (Mass)",
      description:
        "The yz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZX Component (Mass)",
      description:
        "The zx component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZY Component (Mass)",
      description:
        "The zy component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
  {
    definition: {
      title: "ZZ Component (Mass)",
      description:
        "The zz component of a second-order tensor in the stated Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: [],
  },
];
