# Common measurement units

Migration 035 adds common units to the catalogue from migration 034, reusing
existing units and their conversion references. It uses the same native SemType
conversion expressions and the same version-aware migration helper.

## Coverage

| Area                      | Added units                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Radiation                 | Curie, rad, rem                                                                                                                       |
| Length, area, mass, speed | Nautical mile, hectare, metric carat, knot                                                                                            |
| Pressure                  | Millibar, torr, conventional millimeter of mercury and inch of water                                                                  |
| Energy and power          | Electronvolt, thermochemical and International Table calories and kilocalories, US and EC therms, metric horsepower                   |
| Angle and rotation        | Arcminute, arcsecond, revolution, revolutions per second and per minute                                                               |
| Acceleration and force    | Standard gravity, kilogram-force                                                                                                      |
| Viscosity                 | Poise, centipoise, square meter and square millimeter per second, stokes, centistokes                                                 |
| Ratios and concentration  | One, parts per million, parts per billion, milligrams per decilitre and litre, grams per litre; existing Percentage gains conversions |
| Volume flow               | Cubic meters per second and hour, litres per second and minute, US and imperial gallons per minute, cubic feet per minute             |
| Fuel economy              | Litres per 100 kilometers, kilometers per litre, miles per US and imperial gallon                                                     |
| Light                     | Foot-lambert                                                                                                                          |
| Sound and signal          | Bel, decibel, dBW, dBm, unweighted dB SPL, A-weighted and C-weighted sound pressure levels                                            |
| Temperature differences   | Kelvin Difference, Celsius Difference, Fahrenheit Difference, Rankine Difference                                                      |

Migration 034 already includes inches, feet, yards, miles, acres, square feet,
litres, regional gallons and fluid ounces, petroleum barrels, pounds, ounces,
stones, tonnes, short and long tons, mph, feet per second, bars, psi, standard
atmospheres, watt-hours, kilowatt-hours, British thermal unit variants,
mechanical horsepower, BTU/hour, Fahrenheit, Rankine, degrees, pound-force,
and foot-candles. Those definitions are retained.

The combined catalogue has 1,057 concrete units, 73 quantity parents, and 123
system subgroups. This migration adds 61 units to the production ontology,
9 quantity parents, and 15 system subgroups. It also versions the existing
Percentage type. Development instances reuse their existing Knots base URL.
Units with distinct regional definitions retain separate Imperial and US
Customary groups beneath a common quantity parent.

## Conversion boundaries

- Activity, absorbed dose, and dose equivalent remain separate. Curie converts
  to becquerel, rad to gray, and rem to sievert. No dose or biological weighting
  factor is inferred.
- Revolutions per minute convert to radians per second within Angular Velocity.
  They do not convert to Hertz: counting events and measuring rotation are
  separate quantities.
- Dynamic and kinematic viscosity remain separate. Converting between them
  requires the material's density.
- Percentage, ppm, and ppb are reusable dimensionless units. A property specifies
  whether a ratio compares mass, volume, amount of substance, or another basis.
  The ppb definition explicitly means one part in 10⁹. There is no conversion
  from these ratios to mass concentration, or from mass concentration to molar
  concentration without the substance's molar mass.
- Volume flows describe actual measurement conditions. Converting gas volumes
  between different temperatures and pressures needs additional measurements;
  this migration does not add ambiguous "standard" flow units.
- Fuel Economy contains distance-per-volume units, with scale conversions between
  km/L and US or imperial mpg. Fuel Consumption contains L/100 km separately.
  The graph evaluates canonical conversions before value constraints, so a
  reciprocal expression can divide by zero even with a positive-value bound.
  Reciprocal conversions are deferred until the evaluator can report domain
  errors safely. Both quantities allow zero and reject negative values.
- dBm and dBW convert with a 30 dB offset. Bel and decibel convert by a factor of
  ten within Logarithmic Ratio. These groups have no conversion to watts or a
  linear ratio because the current expression language has no logarithm or
  exponentiation operator. A property's meaning determines the power or field
  convention for a generic logarithmic ratio.
- Sound pressure levels explicitly use the 20 micropascal reference. A-weighted,
  C-weighted, and unweighted levels have no conversion paths between them:
  converting a measured level requires its frequency spectrum.
- Temperature Difference is a separate abstract group with Metric and Imperial
  subgroups. Kelvin Difference and Celsius Difference convert one-to-one;
  Fahrenheit Difference and Rankine Difference convert to Kelvin Difference by
  multiplying by 5/9, and back by 9/5. These conversions have no offsets. For
  example, a rise of 10 °C is a rise of 18 °F, and zero difference stays zero.
  Differences accept signed fractional values without absolute-zero bounds.
  They have no conversion paths to the temperature readings in migration 034,
  whose affine conversions and absolute-zero bounds are retained. Properties
  describe what changed and can restrict the permitted difference types.

Reusable linear units accept signed fractional numbers; properties can select
constrained descendants when a measurement needs a narrower domain. Logarithmic
levels also accept negative values. Abstract groups cannot type values directly.
The existing 20-decimal-place division behavior is unchanged.

## Definitions and sources

Most factors follow [NIST SP 811 Appendix B.9](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9)
and its [definition footnotes](https://www.nist.gov/pml/special-publication-811/nist-guide-si-footnotes).

- Calorie types distinguish thermochemical (4.184 J) and International Table
  (4.1868 J) definitions. Nutritional Calories are kilocalories; their underlying
  calorie convention must still be chosen explicitly.
- US and EC therms are separately named: 105,480,400 J and 105,506,000 J.
- Conventional manometer units use fixed reference definitions: mercury density
  13,595.1 kg/m³ or water density 1,000 kg/m³, each under standard gravity.
  They do not model an actual fluid column at arbitrary conditions.
- The electronvolt uses the exact post-2019 value of
  [1.602176634 × 10⁻¹⁹ J](https://physics.nist.gov/cgi-bin/cuu/Value?Revj).
- A foot-lambert is 1/π cd/ft², as defined in
  [NIST SP 250-95](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.250-95.pdf).
  Angle and luminance formulas store a floating-point approximation of π.
- Ratio units follow the quantity/unit distinction in section 5.3.7 of the
  [BIPM SI Brochure](https://www.bipm.org/en/publications/si-brochure).
- Temperature intervals follow [NIST SP 330 section 2](https://www.nist.gov/pml/special-publication-330/sp-330-section-2)
  and the Fahrenheit/Rankine interval factors in [NIST SP 811 Appendix B.8](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8).
- Logarithmic levels follow [NIST SP 811 chapter 8](https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-8)
  and the dBm/dBW definitions in [NTIA TN 89-2](https://its.ntia.gov/publications/download/tn_89-2.pdf).
  Sound pressure uses the [NPL reference definition](https://resource.npl.co.uk/acoustics/techguides/concepts/spl.html).

The catalogue tests check registry coverage, preservation of earlier definitions,
conversion target ordering, both conversion directions, shared-reference paths,
and the absence of conversions between different quantity kinds.
