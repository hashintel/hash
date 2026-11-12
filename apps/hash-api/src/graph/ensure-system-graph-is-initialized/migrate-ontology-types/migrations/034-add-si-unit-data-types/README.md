# Default SI units

Migration 034 adds the missing SI units to the default ontology. Together with
migrations 000, 023, and 026, it covers all seven SI base units, all 22 derived
units with special names, and every compound-unit example in tables 5 and 6 of
the [BIPM SI Brochure, ninth edition](https://www.bipm.org/en/publications/si-brochure).
The catalogue includes all 24 SI prefixes for 33 unit families: the seven base
units (with mass prefixes applied to grams), the 21 multiplicative named derived
units, ampere-hours, watt-hours, litres, square metres, and cubic metres. It also
includes selected non-SI units with fixed conversions. The prefix table follows
the [BIPM definitions](https://www.bipm.org/en/measurement-units/si-prefixes),
including quetta, ronna, ronto, and quecto.

The existing `Meters`, `Kilograms`, `Second`, `Hertz`, `Watts`, `Square Metres`,
and `Cubic Metres` types keep their identifiers and conversions. `Angle`,
`Degree`, `Speed`, `Meters per Second`, and `Kilometers per Hour` use the same
definitions and identifiers as the aviation development migration, so existing
development instances reuse those types.

## Conversions

Each quantity has an abstract numeric parent. Concrete units have a symbol and,
where another unit of the same quantity is available, a bidirectional conversion
to a shared reference unit. The graph can compose conversions between units that
share that reference.

The catalogue specifies conversions as:

```text
target = (source + inputOffset) × factor / divisor + offset
source = (target − offset) × divisor / factor − inputOffset
```

The migration expresses these formulas with the existing conversion operators.
Integer ratios preserve conversions such as kilometres per hour to metres per
second without rounding their factors to decimal constants. Radians use a
floating-point approximation of π to convert to the existing `Degree` type.

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

The unit names and symbols follow the SI brochure. Prefixed families retain
their existing spelling and singular or plural form. Other new compound units
use `Meters` and `Litres` for concentration per litre.

The tests check catalogue coverage, parent and conversion dependencies, registry
identifiers, temperature boundaries, and numerical results in both directions
at magnitudes supported by the application's conversion evaluator. The
migration delegates creation and restart safety to
`createSystemDataTypeIfNotExists`.
