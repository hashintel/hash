# Authorization test plan

Remaining work identified by oracle review. Items are grouped by priority.

## Done (this session)

- [x] Rename `lower_filter_nested_all_any` to `lower_filter_nested_all`
- [x] Fix `algebra_blank_forbid_resets_projections` (was tautological; now pre-registers
      projections via a first transpile, then verifies blank forbid preserves them)
- [x] Deterministic PolicyIds in `permit`/`forbid` helpers (was `Uuid::new_v4()`)
- [x] MockStore asserts expected actor UUID in `determine_actor`
- [x] MockStore asserts expected actor in `build_principal_context`
- [x] MockStore asserts ViewEntity action in `resolve_policies_for_actor`
- [x] Direct `is_instance_admin()` positive/negative assertions in protection test

## Next: parameter value assertions

The snapshot tests verify SQL shape but not parameter values. A test passes even
if the wrong UUID is pushed. Add assertions on `AuxiliaryParameters` contents for:

- `created_by_principal_with_actor` vs `created_by_principal_anonymous` (actor UUID vs public)
- `constraint_exact_entity` (entity UUID value)
- `constraint_web` (web UUID value)
- `optimize_single_entity_uuid` / `optimize_multiple_entity_uuids` (entity UUIDs)
- `resolve_expression_text_parameter` (text value)
- `resolve_expression_actor_id` (actor UUID value)

This requires exposing parameter values from `AuxiliaryParameters` for test inspection
(currently opaque `Vec<Box<dyn ToSql + Sync>>`).

## Next: E2E integration test (`AuthorizationPatch::patch_query`)

Build a minimal compiled query (via `PostgresCompiler` or hand-built `PreparedQuery`),
apply `AuthorizationPatch` through the HList pipeline, and verify:

1. Policy condition added to WHERE clause
2. Auxiliary joins materialized in FROM (entity_ids, entity_is_of_type_ids)
3. Protection mask grafted into entity_editions LATERAL (properties and property_metadata)
4. Auxiliary parameters populated with correct values
5. Join ordering: auth joins before entity_editions LATERAL before continuations

This is the test that verifies the full onion works end-to-end.

## Additional coverage (lower priority)

### Missing filter combinations

- `EntityResourceFilter::All { filters: vec![] }` (empty conjunction)
- `EntityResourceFilter::Any { filters: vec![] }` (empty disjunction)
- `PropertyFilter::Any` (currently only `All` is tested in nested form)
- Nested `Any` inside `All`
- `EntityResourceFilter::Not` around a compound filter

### Missing parameter variants in protection

- `Parameter::Boolean`
- `Parameter::Decimal`
- `Parameter::Uuid`
- `Parameter::OntologyTypeVersion`
- `Parameter::Timestamp`

### Missing projection configurations

- `entity_type_ids` (computed LEFT JOIN LATERAL aggregate with parameters)
- `left_entity` / `right_entity` (LEFT OUTER joins)
- Alias reuse: base already has `entity_ids`, auxiliary should reuse alias
- Alias collision: base with many projections, auxiliary aliases must not collide
- Integration: `build_from` with entity_editions, then `build_joins` with auth joins,
  verify auth joins appear before entity_editions LATERAL

### Multiple protected properties

- Config with two or more protected properties
- Verify `array_cat` combines all CASE WHEN expressions

### Fixture improvements

- Actor divergence: `Fixture.policy()` always uses `ACTOR_UUID` regardless of
  `PolicyComponents` actor. Consider tying these together or adding
  `policy_unit_for(&PolicyComponents)`.
- Non-empty base projections: test that auxiliary projections work correctly
  when the base query already requested some tables.
