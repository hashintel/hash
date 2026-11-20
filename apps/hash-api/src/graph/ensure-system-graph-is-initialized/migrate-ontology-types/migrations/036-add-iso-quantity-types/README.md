# ISO/IEC 80000 quantities and representations

Migration 036 adds quantity meanings as property types and numeric representations as data types. It builds on migrations 034 and 035 without replacing their unit definitions.

- **364 data types:** 204 concrete representations and 160 abstract conversion groups. These include reusable bounded fractions and integer domains, missing compound units, decimal and binary storage/rate units, information units, and acoustic references.
- **909 property types:** 708 quantity meanings and 201 reusable components, coordinates, and context fields.
- **115 bidirectional conversion pairs**, using the graph's existing expression schema.
- **721 of 723 catalogue item locators represented.** Two reaction-dependent equilibrium constants are deferred. Multiple ISO items can share a property when they denote the same quantity.

The [coverage table](coverage-map.md) records each item, its property type, and its representation. It is a mapping of the public catalogue, **not a claim of complete ISO conformance**. The full normative standards and all 2025 ISO amendments have not been audited.

## Quantities and units are separate

A unit data type constrains a value and defines its conversions. A property type identifies what the value means. For example:

- Thermodynamic Entropy and Heat Capacity reuse joules per kelvin.
- Information Entropy uses shannons, hartleys, or nats, separately from thermodynamic entropy and binary storage.
- Mass Fraction, Mole Fraction, and Volume Fraction share bounded fraction representations while retaining their different bases.
- Characteristic numbers are properties using the existing dimensionless ratio units. They do not each introduce a new data type.
- Current-area and flux-length conventions for magnetic dipole moment have separate properties and unit families.

Existing general-purpose property types, such as File Size, describe a different context from Storage Capacity and are retained. Existing unit types are reused through the actual versions recorded in migration state. The migration creates new types idempotently; it does not rewrite old entity values.

## Constraints and conversions

Bounded Fraction has unit-specific concrete descendants: Unit Interval (0–1), Fractional Percentage (0–100), and fractional ppm/ppb. Bounds are applied in each representation's own scale. The abstract parent does not impose a raw 0–1 bound on percentages.

Negative Number accepts real values strictly below zero, while Non-negative Number accepts zero and positive real values. Both inherit from Number, with no unit conversion between these disjoint domains.

Count properties reference non-negative integers or positive integers. Half-integer quantum numbers have a reusable step of 0.5. Mean Queue Length accepts fractional non-negative values. Relative Humidity remains an unbounded ratio because supersaturation can exceed one.

Generic unit types accept signed real values unless their existing definition or a reusable numeric domain imposes a bound. A quantity's physical admissibility can depend on the surrounding entity, reference conditions, or relationships between properties; this migration does not claim to validate all such conditions.

Conversions include:

- Angstroms, astronomical units, barns, and daltons. The dalton-to-kilogram factor is the approximate 2022 CODATA value, not a defining exact constant.
- Decimal storage and transfer prefixes through quetta, and binary prefixes through **quebi (2^100)**, including robi (2^90). Existing Bits, Bytes, and decimal byte types retain their definitions. Every byte/octet means eight bits.
- Bit/byte transfer rates within their own family. Baud is a separate symbol rate; converting it to bit rate requires the coding scheme.
- Shannon, hartley, and nat scale changes, and corresponding information rates. Changing the logarithm base is a constant scale change; calculating entropy from probabilities is not a unit conversion.
- Spectral densities per wavelength expressed per meter and per nanometer. Multiplying a value expressed per nanometer by 10^9 gives the equivalent value expressed per meter. Per-frequency densities require an independent variable and Jacobian, so no wavelength-to-frequency density conversion is added.
- Octaves, equal-tempered semitones/cents, and frequency decades. Converting a logarithmic interval to a frequency ratio requires exponentiation and is not supported by the current conversion expressions.
- Sound power levels referenced to 1 pW convert to dBW by subtracting 120. Sound pressure and sound exposure levels retain distinct references and do not convert to each other.

Apparent power, reactive power, and active power remain separate. Their dimensional equivalence does not supply the phase or power-factor information required to relate them. The migration similarly does not connect erlangs, storage bits, and shannons merely because their dimensions are one.

Large binary factors are products of safe integer constants. This avoids rounding a single large binary factor when the graph imports floating-point constants. Transcendental scale factors, including log2(10), are approximations. The existing division precision is unchanged.

## Structured quantities already included

The following definitions were implemented while preparing this catalogue:

- Real Cartesian vectors have three required signed components and a required reference-frame description.
- Real second-order Cartesian tensors have nine required components and the same frame description. Quantities that also have an isotropic scalar form allow that form.
- Complex scalars have required real and imaginary components. Electrical current and voltage phasors also require the time-sign and amplitude convention to be stated.
- Lattice bases contain three vectors. CIE coordinate sets use explicitly named components. Color-matching values describe a sample at a stated wavelength, not an executable function.

Each numeric component carries its own data-type metadata, so compatible metric and imperial units can be used within an object. Values must be converted to consistent units before applying vector or tensor algebra.

Further structural work is **documented, not implemented** here:

- Coordinate-frame transformations, validation of a frame's orthonormality, and consistent frame identity across nested vectors.
- Tensor symmetry, positive definiteness, transformation laws, and complex-valued tensors.
- Function-valued quantities, interpolation of spectral curves, and relationships between samples.
- Cross-component constraints such as chromaticity coordinates summing to one, or constraints that relate multiple quantum numbers.
- Parsing and enforcing phasor conventions, including peak/RMS and exponential-sign transformations.

These need explicit models or validation support. A structured property is a stored representation, not an implementation of the associated physical operations.

## Deferred items and spec boundaries

- **9-33 and 9-34:** pressure-based and concentration-based equilibrium constants have units whose exponents depend on reaction stoichiometry. A fixed unit data type would be misleading. Standard Equilibrium Constant is available as a dimensionless property; the reaction and standard states belong in the surrounding model.
- Parts **1 and 2** specify general conventions and mathematical notation. This migration does not turn operators, notation rules, or physical laws into property types.
- Withdrawn part 14 and unpublished work on further parts are not added as if they were published quantity catalogues.
- Temperature-difference semantics still need a point-versus-difference conversion contract. Existing temperature reading types are reused; no duplicate “Kelvin Temperature Difference” data type is introduced.

## Sources and editions

The starting inventory is the [public JPL catalogue](https://github.com/nasa-jpl/PropertyKindCalculus/tree/71cf44842371a3025b0e1e02d86fb07e1d22b5b0/iso80000/PropertyKindCalculus/Iso80000), pinned to commit `71cf44842371a3025b0e1e02d86fb07e1d22b5b0`. It records citation locators, quantity names, symbols, and units. See [NOTICE.md](NOTICE.md).

Its editions are ISO 80000 parts 3–5, 7, and 9–12 (2019), part 8 (2020), IEC 80000-6 (2022), and IEC 80000-13 (2025). Those locators are cross-references for review, not substitutes for the normative publications.

Supporting primary references:

- [IEC 80000-13:2025](https://webstore.iec.ch/en/publication/87379), including the new binary prefixes.
- [BIPM SI Brochure](https://www.bipm.org/en/publications/si-brochure), unit conventions and prefixes.
- [NIST binary prefix definitions](https://physics.nist.gov/cuu/Units/binary.html), including the distinction between binary and decimal multiples.
- [IUPAC Green Book, fourth edition abridged](https://doi.org/10.1039/9781839163180), quantities, units, and physical-chemistry terminology.
- [ITU-T E.600](https://www.itu.int/rec/T-REC-E.600-199303-I/en), traffic terminology.

Descriptions are concise HASH descriptions. The seeding code uses native SemType constraints, property compositions, and conversion expressions; it does not introduce a new conversion language.
