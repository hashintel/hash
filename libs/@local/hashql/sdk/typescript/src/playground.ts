// sketch 1) proxy based interpolation, Elysia.JS style

const program = ($) => {
  // $ is just used for fluid syntax, and built-in utilities, it's the general entrypoint
  const { EntityUuid, Uuid } = $.prelude();
  const { temporal } = $.modules();

  const comparison = EntityUuid(Uuid("e2851dbb-7376-4959-9bca-f72cafc4448f")); // would be converted into a let binding

  // if else would just "work", but would need to have the form of:
  let out;
  if ([expr]) {
    [expr]; // cannot mention or set `out`
    out = [result];
  } else {
    // else **must** be set
    out = [expr];
  }

  // else if chains are possible, but need to obey the same rules as if/else

  $.query
    .entities($.input("axis", $.input("axis", temporal.QueryTemporalAxes)))
    .filter(
      (vertex) =>
        vertex.metadata.record_id.entity_id.entity_uuid === comparison,
    )
    .collect();
};

// sketch 2) mutable execution
const program = ($) => {
  const { temporal } = $.modules();
  const { EntityUuid, Uuid, eq } = $.prelude();

  const foo = $.let("foo", [expr]); // oxlint rule for the name to be the same
  const Foo = $.newtype("Foo", {
    foo: BigInt, // constructor is just turned into a `Integer` type
  }); // fluid constructor that just takes records, and arrays for tuples, dict is just created using the `Dict` and `List` built-in.

  const bar = Foo({ foo: 2n }); // this just works

  // ifElse needs to be explicit
  const baz = $.ifElse([expr], { then: [expr], else: [expr] });

  // this would NOT be converted
  // const comparison = EntityUuid(Uuid("e2851dbb-7376-4959-9bca-f72cafc4448f"));
  // this would:
  const comparison = $.let(
    "comparison",
    EntityUuid(Uuid("e2851dbb-7376-4959-9bca-f72cafc4448f")),
  );

  $.query
    .entities($.input("axis", $.input("axis", temporal.QueryTemporalAxes)))
    .filter((vertex) =>
      eq(vertex.metadata.record_id.entity_id.entity_uuid, comparison),
    )
    .collect();
};
