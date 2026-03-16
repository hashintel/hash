use alloc::alloc::Global;

use hashql_compiletest::pipeline::Pipeline;
use hashql_core::{
    heap::Heap, module::std_lib::graph::types::knowledge::entity, symbol::sym, r#type::TypeBuilder,
};
use hashql_eval::orchestrator::codec::{Decoder, JsonValueRef};
use hashql_mir::{
    intern::Interner,
    interpret::{
        Inputs,
        value::{self, Value},
    },
};
use type_system::knowledge::entity::id::EntityUuid;

use crate::{
    directives::{AxisBound, AxisDirectives, AxisInterval},
    seed::SeededEntities,
};

/// Constructs `Opaque(Timestamp, Integer(ms))`.
fn timestamp_value(ms: i128) -> Value<'static, Global> {
    Value::Opaque(value::Opaque::new(
        sym::path::Timestamp,
        Value::Integer(value::Int::from(ms)),
    ))
}

/// Constructs `Opaque(UnboundedTemporalBound, Unit)`.
fn unbounded_bound() -> Value<'static, Global> {
    Value::Opaque(value::Opaque::new(
        sym::path::UnboundedTemporalBound,
        Value::Unit,
    ))
}

/// Constructs `Opaque(ExclusiveTemporalBound, Timestamp(ms))`.
fn exclusive_bound(ms: i128) -> Value<'static, Global> {
    Value::Opaque(value::Opaque::new(
        sym::path::ExclusiveTemporalBound,
        timestamp_value(ms),
    ))
}

/// Constructs `Opaque(Interval, {end: .., start: ..})`.
///
/// Fields are sorted lexicographically (`end` before `start`).
fn interval_value<'heap>(
    interner: &Interner<'heap>,
    start: Value<'heap, Global>,
    end: Value<'heap, Global>,
) -> Value<'heap, Global> {
    // Fields sorted: "end" < "start"
    let fields = interner.symbols.intern_slice(&[sym::end, sym::start]);
    let values = vec![end, start];

    Value::Opaque(value::Opaque::new(
        sym::path::Interval,
        Value::Struct(value::Struct::new(fields, values).expect("interval struct is valid")),
    ))
}

/// Converts an [`AxisInterval`] to a `Value` representing a temporal
/// interval: `Opaque(Interval, {start: <bound>, end: <bound>})`.
fn axis_interval_to_value<'heap>(
    interner: &Interner<'heap>,
    interval: &AxisInterval,
) -> Value<'heap, Global> {
    let start = match interval.start {
        AxisBound::Unbounded => unbounded_bound(),
        AxisBound::Included(ms) => Value::Opaque(value::Opaque::new(
            sym::path::InclusiveTemporalBound,
            timestamp_value(ms),
        )),
        AxisBound::Excluded(ms) => exclusive_bound(ms),
    };
    let end = match interval.end {
        AxisBound::Unbounded => unbounded_bound(),
        AxisBound::Included(ms) => Value::Opaque(value::Opaque::new(
            sym::path::InclusiveTemporalBound,
            timestamp_value(ms),
        )),
        AxisBound::Excluded(ms) => exclusive_bound(ms),
    };
    interval_value(interner, start, end)
}

/// Returns `true` if the interval is a point (both bounds are Included with
/// the same value).
fn is_point(interval: &AxisInterval) -> Option<i128> {
    match (&interval.start, &interval.end) {
        (AxisBound::Included(start), AxisBound::Included(end)) if start == end => Some(*start),
        _ => None,
    }
}

/// Builds temporal axes from parsed directives.
///
/// `QueryTemporalAxes` is a union of `PinnedTransactionTimeTemporalAxes` and
/// `PinnedDecisionTimeTemporalAxes`. Each has a `pinned` field (single
/// timestamp) and a `variable` field (range interval). The directive system
/// determines which axis is pinned (a point `(T)`) and which is variable
/// (a range `[a, b)` or defaulting to unbounded).
fn temporal_axes_from_directives<'heap>(
    interner: &Interner<'heap>,
    directives: &AxisDirectives,
) -> Value<'heap, Global> {
    let far_future_ms: i128 = 4_102_444_800_000; // 2100-01-01T00:00:00Z
    let default_variable = || AxisInterval {
        start: AxisBound::Unbounded,
        end: AxisBound::Excluded(far_future_ms),
    };

    // Determine which axis is pinned and which is variable.
    // Default: pin transaction time, variable decision time.
    let (pinned_axis, pinned_ms, variable_axis_name, variable_interval) =
        match (&directives.decision, &directives.transaction) {
            (None, None) => (
                sym::path::TransactionTime,
                far_future_ms,
                sym::path::DecisionTime,
                default_variable(),
            ),
            (Some(decision), None) => {
                let ms =
                    is_point(decision).expect("pinned decision axis must be a point interval (T)");
                (
                    sym::path::DecisionTime,
                    ms,
                    sym::path::TransactionTime,
                    default_variable(),
                )
            }
            (None, Some(transaction)) => {
                let ms = is_point(transaction)
                    .expect("pinned transaction axis must be a point interval (T)");
                (
                    sym::path::TransactionTime,
                    ms,
                    sym::path::DecisionTime,
                    default_variable(),
                )
            }
            (Some(decision), Some(transaction)) => {
                // One must be a point (pinned), the other a range (variable).
                match (is_point(transaction), is_point(decision)) {
                    (Some(ms), _) => (
                        sym::path::TransactionTime,
                        ms,
                        sym::path::DecisionTime,
                        decision.clone(),
                    ),
                    (_, Some(ms)) => (
                        sym::path::DecisionTime,
                        ms,
                        sym::path::TransactionTime,
                        transaction.clone(),
                    ),
                    _ => panic!("when both axes are specified, one must be a point interval"),
                }
            }
        };

    let pinned = Value::Opaque(value::Opaque::new(pinned_axis, timestamp_value(pinned_ms)));
    let variable = Value::Opaque(value::Opaque::new(
        variable_axis_name,
        axis_interval_to_value(interner, &variable_interval),
    ));

    // "pinned" < "variable" lexicographically.
    let fields = interner.symbols.intern_slice(&[sym::pinned, sym::variable]);
    let values = vec![pinned, variable];

    let wrapper_name = if pinned_axis == sym::path::TransactionTime {
        sym::path::PinnedTransactionTimeTemporalAxes
    } else {
        sym::path::PinnedDecisionTimeTemporalAxes
    };

    Value::Opaque(value::Opaque::new(
        wrapper_name,
        Value::Struct(value::Struct::new(fields, values).expect("axes struct is valid")),
    ))
}

/// Builds the shared input set from seeded entity data and axis directives.
///
/// Uses the decoder and the post-lowering type environment to construct
/// properly typed `Value`s for entity UUIDs and entity IDs. The input names
/// match what J-Expr test files reference via `["input", "<name>", "<type>"]`.
pub(crate) fn build_inputs<'heap>(
    heap: &'heap Heap,
    pipeline: &Pipeline<'heap>,
    interner: &Interner<'heap>,
    entities: &SeededEntities,
    directives: &AxisDirectives,
) -> Inputs<'heap, Global> {
    let mut inputs = Inputs::new();
    let decoder = Decoder::new(&pipeline.env, interner, Global);
    let ty = TypeBuilder::synthetic(&pipeline.env);
    let entity_uuid_type = entity::types::entity_uuid(&ty, None);
    let entity_id_type = entity::types::entity_id(&ty, None);

    // Insert an EntityUuid-typed input.
    let insert_uuid = |inputs: &mut Inputs<'heap, Global>, name: &str, uuid: &EntityUuid| {
        let uuid_str = uuid.to_string();
        let value = decoder
            .decode(entity_uuid_type, JsonValueRef::String(&uuid_str))
            .expect("could not decode EntityUuid input");

        inputs.insert(heap.intern_symbol(name), value);
    };

    // Insert a full EntityId-typed input.
    let insert_entity_id =
        |inputs: &mut Inputs<'heap, Global>,
         name: &str,
         id: &type_system::knowledge::entity::EntityId| {
            let json = serde_json::json!({
                "web_id": id.web_id.to_string(),
                "entity_uuid": id.entity_uuid.to_string(),
                "draft_id": id.draft_id.map(|draft| draft.to_string()),
            });
            let value = decoder
                .decode(entity_id_type, JsonValueRef::from(&json))
                .expect("could not decode EntityId input");

            inputs.insert(heap.intern_symbol(name), value);
        };

    insert_uuid(&mut inputs, "alice_uuid", &entities.alice.entity_uuid);
    insert_uuid(&mut inputs, "bob_uuid", &entities.bob.entity_uuid);
    insert_uuid(&mut inputs, "org_uuid", &entities.organization.entity_uuid);
    insert_uuid(
        &mut inputs,
        "friend_link_uuid",
        &entities.friend_link.entity_uuid,
    );
    insert_uuid(
        &mut inputs,
        "draft_alice_uuid",
        &entities.draft_alice.entity_uuid,
    );

    insert_entity_id(&mut inputs, "alice_id", &entities.alice);
    insert_entity_id(&mut inputs, "bob_id", &entities.bob);
    insert_entity_id(&mut inputs, "org_id", &entities.organization);
    insert_entity_id(&mut inputs, "friend_link_id", &entities.friend_link);
    insert_entity_id(&mut inputs, "draft_alice_id", &entities.draft_alice);

    // String inputs for property-based filtering.
    let string_type = ty.string();
    let alice_name = decoder
        .decode(string_type, JsonValueRef::String("Alice"))
        .expect("could not decode string input");
    inputs.insert(heap.intern_symbol("alice_name"), alice_name);

    // Temporal axes from directives (or default: unbounded decision time,
    // far-future transaction pin).
    inputs.insert(
        heap.intern_symbol("temporal_axes"),
        temporal_axes_from_directives(interner, directives),
    );

    inputs
}
