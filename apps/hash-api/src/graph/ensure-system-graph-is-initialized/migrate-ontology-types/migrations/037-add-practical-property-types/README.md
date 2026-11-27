# Practical measurement properties

Migration 037 adds 137 property types and 10 supporting data types. It covers product specifications, environmental monitoring, equipment operation, transport, computing, lighting, sound, and radiation measurements. The [catalogue](catalogue.md) lists every property, its accepted data type, and the added units.

Generic quantities such as Length, Mass, Voltage, Relative Humidity, and Storage Capacity already exist in migration 036. This migration adds application-specific meanings, such as Cable Length, Payload Mass, Nominal Supply Voltage, and Available Storage Capacity. Existing properties, including Gross Weight, Net Weight, and File Size, retain their definitions.

## Representation and conversion choices

Properties normally reference a common quantity parent so that all compatible metric, imperial, and US customary descendants are available. The selected concrete data type records the unit. For example, Tank Capacity accepts litres and either regional gallon, while Battery Charge Capacity accepts coulombs and ampere hours. Existing unit definitions and conversions are reused unchanged.

- Battery Charge Capacity and Battery Energy Capacity use different families. Relating them needs a discharge-voltage profile and conditions; a unit conversion cannot supply those.
- State of charge, soil water volume fraction, carbon dioxide mole fraction, efficiencies, availability, and error/loss fractions use Bounded Fraction. Unit Interval, Fractional Percentage, and fractional ppm/ppb apply the appropriate bounds on their own scales.
- Battery Cycle Count, Request Count, and Packet Count use Non-negative Integer. ADC Resolution uses Positive Integer. Battery Cycle Count counts completed whole cycles; fractional equivalent-full-cycle measures need their own property.
- Dissolved oxygen mass and amount concentrations remain separate. No substance-dependent mass-to-amount conversion is inferred. Gas composition identifies its mole or volume basis; soil water content specifies a volume basis.
- Gas Volume Flow Rate refers to actual measurement conditions. Standardized gas volumes need a specified reference temperature and pressure. Viscosity properties identify dynamic and kinematic quantities separately.
- Rated active, apparent, and reactive power use different families. Signal power levels accept logarithmic power references such as dBm and dBW; no logarithmic-to-linear calculation is introduced.
- A-weighted equivalent continuous and C-weighted peak sound levels reference their specific weighted data types. They do not accept each other's representation or an unweighted level.
- Indicated Airspeed, True Airspeed, and Vehicle Ground Speed share speed units but keep their different meanings. Converting knots to meters per second does not transform one property into another.
- Temperature properties are readings. Pressure Drop is a signed pressure difference; all existing pressure-unit scales have the same zero. No temperature-difference property or point-versus-difference conversion contract is added.

Descriptions identify the reference conditions, measurement intervals, directions, and methods needed to interpret each value. The surrounding entity or observation model must store that context. These scalar properties do not enforce the presence of context fields, relationships such as available capacity being at most total capacity, or every physical admissibility bound. Validation enforces the referenced data type's existing constraints; unit data types retain their signed domains where applicable.

## Environmental monitoring

Gas properties distinguish mole fraction from volume fraction for methane, carbon dioxide, oxygen, carbon monoxide, hydrogen sulphide, sulphur dioxide and hydrogen. These use Bounded Fraction with unit-specific bounds for percentages, ppm and ppb. Each observation records the gas basis and reference conditions. Selecting a different fraction unit preserves the property's mole or volume basis.

PM1, PM2.5, PM10 and total suspended particulate properties represent mass concentration. Aerosol Particle Number Concentration represents number per volume and records the counted size range. Radon Activity Concentration identifies the isotope and measurement interval. The new mass-concentration units are μg/m³ and mg/m³; number concentration adds cm⁻³.

Borehole Absolute Pressure uses vacuum as its reference. Borehole Gauge Pressure subtracts ambient atmospheric pressure. Differential Pressure subtracts the second identified pressure from the first. Atmospheric Pressure Change Rate is a signed rate with its own Pa/s and hPa/h conversion family. Negative rates represent falling pressure.

Wind Direction specifies the direction from which wind blows, clockwise from true north. Direction statistics require circular arithmetic. Depth to Groundwater is positive below the local ground surface; Water Level is positive above its stated datum. Battery Terminal Voltage and Measured Supply Voltage describe observed values, with load and AC measurement conventions recorded alongside them. Instrument Internal Temperature and Pump Current identify device measurements separately from environmental observations and equipment ratings.

Percentage of Lower Explosive Limit uses a separate numeric data type labelled `% LEL`. It accepts non-negative fractional values, including values above 100. The observation identifies the target gas or mixture, calibration gas and LEL reference convention. It has no conversion to gas fractions or generic percentages because those references determine the relationship.

Methane Surface Mass Flux Density is the signed outward component of methane mass flux across the stated surface. It uses the existing scalar Mass Flux Density data-type family, with mg/(m²·s) added alongside kg/(m²·s). Methane Emission Mass Flow Rate describes emissions from an identified source. Gas Screening Value properties distinguish methane and carbon dioxide assessment results from the total gas flow used in the calculation. They record the selected source measurements and assessment method. L/h converts within Volume Flow Rate. Dissolved Methane Mass Concentration uses mass per volume of solution.

TVOC, wetness and legacy `ppt`/`pptv` formats are outside this catalogue because their reporting conventions require confirmation. Measurement methods, calibration records, sampling intervals and reference conditions belong in the observation model. This migration defines values and unit conversions; it does not calculate gas screening values, emission estimates or safety classifications.

## Deferred reciprocal conversions

- [ ] [BE-1156](https://linear.app/hash/issue/BE-1156/enable-reciprocal-unit-conversions-after-fallible-conversion-support): enable `constant / self` conversions only after the team's fallible-conversion support is available, with zero-input and nested-denominator regression coverage.

Fuel Consumption and Fuel Economy deliberately remain separate. Each accepts the existing conversions within its family, including US-to-imperial mpg, but there is no L/100 km-to-mpg conversion. The graph currently evaluates canonical conversions before validating source constraints, so a positive-value bound does not protect a reciprocal expression from zero. PR #10480 is closed and is not the planned implementation. Division precision is unchanged.

## Migration behavior

The migration seeds the supporting data types before the properties, using the existing idempotent unit seeder. It resolves parent references using the versions recorded in the installation's migration state and checks that conversion targets exist. Properties then reference the installed data-type versions through the existing idempotent property seeder. Existing type definitions, conversion expressions and observations remain unchanged.

## References for distinctions

- [NIST conversion tables](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9) distinguish ampere hours as charge from watt-hours as energy.
- [FAA flight instruments guidance](https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/glider_handbook/gfh_chapter_4.pdf) distinguishes indicated, calibrated, and true airspeed.
- [HSE noise terminology](https://www.hse.gov.uk/event-safety/noise.htm) uses A-weighted equivalent continuous and C-weighted peak sound pressure levels as separate measures. No exposure limits or safety decisions are encoded here.

- [MSA combustible gas guidance](https://docs.msasafety.com/altair5xPID/Content/ALTAIR%205X%20PID%20OPM%2010165710/Combustible_Gas_Cross_Re.htm) distinguishes gas-specific LEL readings from volume percentages and identifies the calibration dependence.
- [Environment Agency surface-emissions guidance](https://assets.publishing.service.gov.uk/media/5a74f8bded915d502d6cc7ad/LFTGN07.pdf) expresses methane surface mass flux density in mg/(m²·s).
