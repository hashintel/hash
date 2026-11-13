# Practical measurement properties

Migration 037 adds 102 property types that use 45 existing data types or conversion groups. It adds meanings for product specifications, environmental observations, equipment operation, transport, computing, lighting, sound, and radiation measurements. The [catalogue](catalogue.md) lists every property and its accepted data type.

Generic quantities such as Length, Mass, Voltage, Relative Humidity, and Storage Capacity already exist in migration 036. This migration adds application-specific meanings, such as Cable Length, Payload Mass, Nominal Supply Voltage, and Available Storage Capacity. Existing properties, including Gross Weight, Net Weight, and File Size, retain their definitions.

## Representation and conversion choices

Properties normally reference a common quantity parent so that all compatible metric, imperial, and US customary descendants are available. The selected concrete data type records the unit. For example, Tank Capacity accepts litres and either regional gallon, while Battery Charge Capacity accepts coulombs and ampere hours. Existing unit definitions and conversions are reused unchanged.

- Battery Charge Capacity and Battery Energy Capacity use different families. Relating them needs a discharge-voltage profile and conditions; a unit conversion cannot supply those.
- State of charge, soil water volume fraction, carbon dioxide mole fraction, efficiencies, availability, and error/loss fractions use Bounded Fraction. Unit Interval, Fractional Percentage, and fractional ppm/ppb apply the appropriate bounds on their own scales.
- Battery Cycle Count, Request Count, and Packet Count use Non-negative Integer. ADC Resolution uses Positive Integer. Battery Cycle Count counts completed whole cycles; fractional equivalent-full-cycle measures need their own property.
- Dissolved oxygen mass and amount concentrations remain separate. No substance-dependent mass-to-amount conversion is inferred. Gas composition specifies a mole basis; soil water content specifies a volume basis.
- Gas Volume Flow Rate refers to actual measurement conditions. Standardized gas volumes need a specified reference temperature and pressure. Viscosity properties identify dynamic and kinematic quantities separately.
- Rated active, apparent, and reactive power use different families. Signal power levels accept logarithmic power references such as dBm and dBW; no logarithmic-to-linear calculation is introduced.
- A-weighted equivalent continuous and C-weighted peak sound levels reference their specific weighted data types. They do not accept each other's representation or an unweighted level.
- Indicated Airspeed, True Airspeed, and Vehicle Ground Speed share speed units but keep their different meanings. Converting knots to metres per second does not transform one property into another.
- Temperature properties are readings. Pressure Drop is a signed pressure difference; all existing pressure-unit scales have the same zero. No temperature-difference property or point-versus-difference conversion contract is added.

Descriptions identify the reference conditions, measurement intervals, directions, and methods needed to interpret each value. The surrounding entity or observation model must store that context. These scalar properties do not enforce the presence of context fields, relationships such as available capacity being at most total capacity, or every physical admissibility bound. Validation enforces the referenced data type's existing constraints; unit data types retain their signed domains where applicable.

## Deferred reciprocal conversions

- [ ] [BE-1156](https://linear.app/hash/issue/BE-1156/enable-reciprocal-unit-conversions-after-fallible-conversion-support): enable `constant / self` conversions only after the team's fallible-conversion support is available, with zero-input and nested-denominator regression coverage.

Fuel Consumption and Fuel Economy deliberately remain separate. Each accepts the existing conversions within its family, including US-to-imperial mpg, but there is no L/100 km-to-mpg conversion. The graph currently evaluates canonical conversions before validating source constraints, so a positive-value bound does not protect a reciprocal expression from zero. PR #10480 is closed and is not the planned implementation. Division precision is unchanged.

## Migration behavior

The migration resolves each reference using the data-type version recorded in the installation's migration state, then uses the existing idempotent property seeder. It fails when a required data type has not been seeded. It creates no entity types or observations and rewrites no existing property definitions or values.

## References for distinctions

- [NIST conversion tables](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9) distinguish ampere hours as charge from watt-hours as energy.
- [FAA flight instruments guidance](https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/glider_handbook/gfh_chapter_4.pdf) distinguishes indicated, calibrated, and true airspeed.
- [HSE noise terminology](https://www.hse.gov.uk/event-safety/noise.htm) uses A-weighted equivalent continuous and C-weighted peak sound pressure levels as separate measures. No exposure limits or safety decisions are encoded here.
