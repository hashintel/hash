# Default measurement units

Migration 034 expands the default ontology with SI, imperial, and US customary units. Together with
migrations 000, 023, and 026, it covers all seven SI base units, all 22 derived
units with special names, and every compound-unit example in tables 5 and 6 of
the [BIPM SI Brochure, ninth edition](https://www.bipm.org/en/publications/si-brochure).
The catalogue includes all 24 SI prefixes for 33 unit families: the seven base
units (with mass prefixes applied to grams), the 21 multiplicative named derived
units, ampere-hours, watt-hours, litres, square metres, and cubic metres. It also
includes selected non-SI units with fixed conversions. The prefix table follows
the [BIPM definitions](https://www.bipm.org/en/measurement-units/si-prefixes),
including quetta, ronna, ronto, and quecto.

## Quantity and system groups

The catalogue has 64 quantity parents and 108 system subgroups. For example:

```text
Length
  Length (Metric) → Meters, Centimeters, …
  Length (Imperial) → Inches, Feet, Yards, Miles, …
Volume
  Volume (Metric) → Litres, Cubic Metres, …
  Volume (Imperial) → Imperial Gallons, Imperial Pints, …
  Volume (US Customary) → US Liquid Gallons, US Liquid Pints, …
```

All quantities have a metric group. Forty-one also have imperial units. US customary
subgroups distinguish mass, volume, and density definitions that differ from
imperial ones. Shared units such as pounds and cubic feet belong to both system
subgroups where both exist. Quantities without distinct imperial units, such as
electric current and capacitance, have no imperial subgroup.

The catalogue includes 995 concrete units. Imperial coverage spans length, mass,
area, volume, temperature, force, pressure, energy, power, speed, acceleration,
density, viscosity, torque, heat, light, and compound units that use imperial
length or mass alongside shared electrical or chemical units.

Existing unit base URLs remain stable. The 38 units already seeded by production
migrations receive version 2 with their new system parents. Old versions and the
old length groups remain available to existing property and value references.
New units start at version 1. Development instances that already have aviation
units receive updated versions of those too. The migration can resume after a
partial run without creating further versions. It compares the complete schema
and conversion definitions, so matching parents alone do not hide stale bounds
or conversion factors. Floating conversion constants are compared at the graph's
decimal precision to avoid creating versions for serialization rounding alone.
Existing properties pinned to old units are not rewritten to accept every unit
in the new quantity groups.

## Permeability

`Magnetic Permeability` groups henries per metre and per foot. `Fluid Permeability`
is a separate quantity for intrinsic permeability: the ability of a porous
material to transmit fluids independently of the fluid's properties. The
[USGS definition](https://pubs.usgs.gov/pp/0708/report.pdf) distinguishes it from
hydraulic conductivity, which also depends on fluid density and viscosity.

Fluid permeability reuses square metres, square centimetres, square millimetres,
square micrometres, square feet, and square inches. Each shared unit has both
its area and fluid-permeability system parents and is seeded once. Darcies,
millidarcies, microdarcies, and nanodarcies belong only to fluid permeability:
[NIST explicitly distinguishes darcies from area units](https://www.nist.gov/pml/special-publication-811/nist-guide-si-footnotes).

Darcy conversions use 1 d = 10⁻¹² / 1.01325 m², consistent with the
[NIST conversion table](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8).
The expressions divide before applying the small scale factor. The shared
square-length units retain their existing formulas and evaluator precision.
There is no conversion to magnetic permeability or hydraulic conductivity.

## Conversions

Each system subgroup inherits from its abstract quantity parent. Concrete units have a symbol and,
where another unit of the same quantity is available, a bidirectional conversion
to a shared reference unit. The graph can compose conversions between units that
share that reference, including across metric, imperial, and US customary subgroups. There are 932 bidirectional conversion definitions.

The catalogue stores the existing `Record<BaseUrl, Conversions>` schema directly,
with `to` and `from` expressions. Targets use the existing system data type base
URLs. Small typed helpers return that schema for scaling and affine conversions;
the migration passes it through without translating a separate formula format.

Integer ratios preserve conversions such as kilometres per hour to metres per
second without rounding their factors to decimal constants. Radians use a
floating-point approximation of π to convert to the existing `Degree` type.
Prefix expansion scales the coefficient in multiplicative conversions while
retaining the shared target, ratio denominator, and evaluator operation order.

Prefixes on square and cubic metres scale the whole prefixed length: 1 cm² is
10⁻⁴ m², and 1 cm³ is 10⁻⁶ m³. Ampere-hours and watt-hours convert through
coulombs and joules respectively. Existing names and identifiers such as
`Microsecond`, `Kilohms`, and `Square Centimetres` are reused.

The JavaScript conversion evaluator rounds division results to 20 decimal
places. Very small intermediate values can lose precision or become zero,
including some conversions involving the extreme prefixes. This catalogue
defines their scale factors; changing evaluator precision is outside its scope.

Temperature readings use `Temperature` and convert through `Kelvins`. For example,
0 °C and 32 °F both convert to 273.15 K. Their schemas bound readings at absolute
zero. These types represent temperature readings, not temperature differences.
A property such as `Temperature Difference` describes the meaning of a value,
but the current conversion expressions have no property context. Reusing the
reading types would apply offsets to differences and reject negative kelvin
differences. Supporting intervals with shared unit types is outside this change.

## Value constraints

Concrete units accept numbers, including fractions. Reusable units generally
have no lower or upper bound: metres can express signed positions, seconds
signed offsets, and pascals gauge pressure. Angles are not limited to one turn.
More restrictive domains can use constrained data type descendants referenced
by the relevant property type.

The temperature reading types have unit-specific absolute-zero bounds: 0 K,
−273.15 °C, −459.67 °F, and 0 °R. Every prefixed kelvin type has a minimum of zero.
Temperature's abstract parents remain unbounded because inherited constraints
intersect without converting their numbers between units. A minimum of zero on
the common parent would incorrectly reject valid negative Celsius and
Fahrenheit readings. Abstract quantity and system groups cannot type values
directly; values use their concrete descendants.

## Scope

The SI permits unlimited derived combinations. This catalogue covers the named
units and the brochure's compound-unit examples; it does not generate arbitrary
products, quotients, or every combination of prefixes within compound units.
Temperature prefixes apply to kelvins. Celsius and Fahrenheit retain their
existing reading conversions.

Conversions operate on one numeric value. Calculating energy from force and
distance, for example, requires multiple measurements and is outside this
conversion model. Quantities with matching dimensions retain separate parents
and conversion groups: hertz and becquerels, joules and newton metres of torque,
grays and sieverts, and radians and steradians.

SI unit names and symbols follow the SI brochure. Prefixed families retain
their existing spelling and singular or plural form. Other new compound units
use `Meters` and `Litres` for concentration per litre.

The tests check catalogue coverage, parent and conversion dependencies, registry
identifiers, temperature boundaries, and numerical results in both directions
at magnitudes supported by the application's conversion evaluator. The
migration creates missing types and versions existing types whose schemas or
conversions change. Upgrade tests cover hosted and self-hosted instances,
constraint and conversion changes, serialization rounding, restart safety,
stale intermediate versions, and read errors.

## Imperial definitions

Conversions use the international yard (0.9144 m), avoirdupois pound
(0.45359237 kg), and standard gravity (9.80665 m/s²). Derived factors follow
[NIST SP 811, Appendix B.9](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9).
Lengths and areas use the international foot, not the retired US survey foot.
An imperial gallon is 4.54609 L; a US liquid gallon is 3.785411784 L. US dry
measures have separate types. Cups and spoons use US customary definitions.
Mass ounces and fluid ounces are distinct, as are avoirdupois and troy mass,
long and short tons, and International Table and thermochemical British thermal
units. Unqualified horsepower is avoided: the catalogue names mechanical
horsepower explicitly.

Rankine denominators in heat-capacity and conductivity units express intervals
of 5/9 kelvin. These multiplicative compound conversions need no temperature
offset. Standalone Rankine and Fahrenheit still represent temperature readings.

Existing fixed month and year conversions are retained and described as mean
or fixed durations. They do not perform calendar arithmetic. The older `Hours`
and `Days` types now share the second reference used by `Hour` and `Day`, so
conversions can compose across the duration catalogue.

## Catalogue display

The frontend follows pagination when loading data types, so quantities and
conversion references remain available after the catalogue exceeds one page.
Conversion lists show the latest version of each target and omit other versions
of the source unit. Old type versions remain addressable directly.
