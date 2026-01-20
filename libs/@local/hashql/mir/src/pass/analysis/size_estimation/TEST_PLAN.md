# Size Estimation Test Plan

## Testing Strategy

- **Unit tests**: Verify correctness of operations against specification
- **Law tests**: Algebraic properties that must hold
- **Snapshot tests**: End-to-end behavior via MIR bodies

---

## Unit Tests

### `unit.rs` - Atomic measurement types

| Test | Correctness Property |
|------|---------------------|
| `saturating_arithmetic_never_panics` | Overflow → MAX, underflow → 0 (no panic) |
| `laws` | `assert_is_bottom_consistent`, `assert_is_top_consistent` |

### `range.rs` - Min/max bounds

| Test | Correctness Property |
|------|---------------------|
| `empty_range_semantics` | `Excluded(0)` is empty; `min > max` is empty; empty has no elements |
| `cover_is_smallest_containing_range` | Result contains both inputs; no smaller range does |
| `intersect_is_largest_contained_range` | Result contained in both inputs; no larger range is |
| `intersect_disjoint_is_empty` | No overlap → empty result |
| `add_sums_bounds_correctly` | `[a,b] + [c,d] = [a+c, b+d]` with proper bound handling |
| `unbounded_propagates_through_add` | `Unbounded + x = Unbounded` |
| `saturating_mul_prevents_overflow` | Large values saturate at MAX |
| `laws` | `assert_additive_monoid`, `assert_bounded_join_semilattice` (covers empty identity) |

### `affine.rs` - Coefficient tracking

| Test | Correctness Property |
|------|---------------------|
| `coefficient_constructor_correctness` | `coefficient(i,n)` represents `y = 1*param[i] + 0` |
| `plus_handles_mismatched_lengths` | Shorter vector extended with zeros before addition |
| `plus_computes_pointwise_sum` | `(a + b).coefficients[i] = a.coefficients[i] + b.coefficients[i]` |
| `join_computes_pointwise_max` | `(a ⊔ b).coefficients[i] = max(a.coefficients[i], b.coefficients[i])` |
| `laws` | `assert_additive_monoid`, `assert_join_semilattice` |

### `estimate.rs` - Constant vs Affine

| Test | Correctness Property |
|------|---------------------|
| `plus_upgrades_constant_to_affine` | Constant + Affine → Affine; Affine + Constant → Affine (both preserve coefficients) |
| `join_upgrades_constant_to_affine` | Constant ⊔ Affine → Affine; Affine ⊔ Constant → Affine (both preserve coefficients) |
| `saturating_mul_add_formula` | `self += other * c` correctly computes `coeff[i] += other.coeff[i] * c` and `const += other.const * c` |
| `is_bottom_correctness` | Affine with all-zero coefficients AND empty constant is bottom |
| `laws` | `assert_additive_monoid`, `assert_bounded_join_semilattice` |

### `footprint.rs` - Combined measures

| Test | Correctness Property |
|------|---------------------|
| `scalar_footprint_values` | `scalar()` → units=1, cardinality=1 (atomic value) |
| `unknown_footprint_values` | `unknown()` → units=unbounded, cardinality=1 |
| `coefficient_footprint_structure` | `coefficient(i,n)` creates proper affine dependency on param i |
| `saturating_mul_add_applies_coefficients_independently` | Units scaled by units_coeff, cardinality by cardinality_coeff |
| `laws` | `assert_additive_monoid`, `assert_bounded_join_semilattice` |

### `static.rs` - Type-based sizing

Uses `TypeBuilder::synthetic(&env)` to construct test types.

| Test | Correctness Property |
|------|---------------------|
| `primitives_are_atomic` | Int, Bool, Num, Closure → size 1 (single unit of information) |
| `struct_size_is_sum_of_fields` | `{a: T1, b: T2}` → size(T1) + size(T2) |
| `tuple_size_is_sum_of_elements` | `(T1, T2)` → size(T1) + size(T2) |
| `empty_tuple_is_zero` | `()` → empty range (no information) |
| `union_uses_cover` | `T1 \| T2` → cover(size(T1), size(T2)) - could be either variant |
| `intersection_uses_intersect` | `T1 & T2` → intersect(size(T1), size(T2)) - must satisfy both |
| `intrinsic_signals_dynamic` | `list(T)`, `dict(K,V)` → None (size depends on runtime) |
| `unknown_signals_dynamic` | Unknown → None (no type info available) |
| `param_infer_never_are_empty` | These shouldn't exist at MIR level; empty is safe default |
| `cache_prevents_redundant_computation` | Same type queried twice → second uses cache |
| `recursive_type_detected` | Sentinel value detects cycle, returns None |

---

## Snapshot Tests (MIR builder)

Location: `tests/ui/pass/size-estimation/`

### Dynamic dataflow (`dynamic.rs`)

| Test | Correctness Property |
|------|---------------------|
| `constants_are_scalar` | Loading constant produces scalar (1 unit, 1 element) |
| `binary_ops_produce_scalar` | Arithmetic/comparison results are single values |
| `unary_ops_produce_scalar` | Negation/not results are single values |
| `tuple_aggregate_sums_operands` | Tuple footprint = sum of element footprints |
| `struct_aggregate_sums_operands` | Struct footprint = sum of field footprints |
| `input_load_is_unbounded` | External input has unknown size |
| `input_exists_is_scalar` | Existence check returns boolean (scalar) |
| `parameter_creates_affine_dependency` | Reading param[i] → coefficient 1 at position i |
| `index_projection_extracts_one_element` | Units from collection, but cardinality=1 |
| `apply_substitutes_callee_coefficients` | `f(x)` where `f` returns `2*param[0]` and `x` has footprint `F` → `2*F` |
| `diamond_cfg_joins_branches` | Both paths contribute to result via join |

### Integration (`mod.rs`)

| Test | Correctness Property |
|------|---------------------|
| `callee_analyzed_before_caller` | Topological order ensures callee footprint available |
| `mutual_recursion_converges` | SCC fixpoint iteration terminates with stable result |

---

## Summary

| Category | Count |
|----------|-------|
| Unit tests | 38 |
| Snapshot tests | 13 |
| **Total** | **51** |
