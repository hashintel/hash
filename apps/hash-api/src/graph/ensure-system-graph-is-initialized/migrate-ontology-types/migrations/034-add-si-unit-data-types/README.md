# Default SI units

Migration 034 adds the missing SI units to the default ontology. Together with
migrations 000, 023, and 026, it covers all seven SI base units, all 22 derived
units with special names, and every compound-unit example in tables 5 and 6 of
the [BIPM SI Brochure, ninth edition](https://www.bipm.org/en/publications/si-brochure).
The catalogue also includes selected decimal multiples and non-SI units with
fixed conversions.

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
products, quotients, or every combination of SI prefixes.

Conversions operate on one numeric value. Calculating energy from force and
distance, for example, requires multiple measurements and is outside this
conversion model. Quantities with matching dimensions retain separate parents
and conversion groups: hertz and becquerels, joules and newton metres of torque,
grays and sieverts, and radians and steradians.

The unit names and symbols follow the SI brochure. Existing HASH identifiers
retain their original spelling and singular or plural form. The added catalogue
uses the existing `Meters` spelling for new compound units and `Litres` for
concentration per litre.

The tests check catalogue coverage, parent and conversion dependencies, registry
identifiers, temperature boundaries, and numerical results in both directions
using the application's conversion evaluator. The migration delegates creation
and restart safety to `createSystemDataTypeIfNotExists`.
