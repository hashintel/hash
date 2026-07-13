use alloc::rc::Rc;

use hashql_core::{
    heap::{FromIn as _, Heap},
    intern::InternSet,
    symbol::{Symbol, sym},
};
use hashql_mir::interpret::{
    Inputs,
    value::{self, StructBuilder, Value},
};
use type_system::{
    knowledge::entity::id::EntityUuid,
    principal::actor_group::{ActorGroupEntityUuid, WebId},
};
use uuid::Uuid;

use crate::{
    directives::{AxisBound, AxisDirectives, AxisInterval},
    seed::SeededEntities,
};

/// Constructs `Opaque(Timestamp, Integer(ms))`.
fn timestamp_value(heap: &Heap, ms: i128) -> Value<'_, &Heap> {
    Value::Opaque(value::Opaque::new(
        sym::path::Timestamp,
        Rc::new_in(Value::Integer(value::Int::from(ms)), heap),
    ))
}

/// Constructs `Opaque(UnboundedTemporalBound, Unit)`.
fn unbounded_bound(heap: &Heap) -> Value<'_, &Heap> {
    Value::Opaque(value::Opaque::new(
        sym::path::UnboundedTemporalBound,
        Rc::new_in(Value::Unit, heap),
    ))
}

/// Constructs `Opaque(ExclusiveTemporalBound, Timestamp(ms))`.
fn exclusive_bound(heap: &Heap, ms: i128) -> Value<'_, &Heap> {
    Value::Opaque(value::Opaque::new(
        sym::path::ExclusiveTemporalBound,
        Rc::new_in(timestamp_value(heap, ms), heap),
    ))
}

/// Constructs `Opaque(Interval, {end: .., start: ..})`.
///
/// Field order in `push` calls does not matter; [`StructBuilder::finish`]
/// sorts fields lexicographically.
fn interval_value<'heap>(
    heap: &'heap Heap,
    symbols: &InternSet<'heap, [Symbol<'heap>]>,
    start: Value<'heap, &'heap Heap>,
    end: Value<'heap, &'heap Heap>,
) -> Value<'heap, &'heap Heap> {
    let mut builder = StructBuilder::<_, 2>::new();
    builder.push(sym::end, end);
    builder.push(sym::start, start);

    let inner = builder.finish(symbols, heap);

    Value::Opaque(value::Opaque::new(
        sym::path::Interval,
        Rc::new_in(Value::Struct(inner), heap),
    ))
}

/// Converts an [`AxisInterval`] to a `Value` representing a temporal
/// interval: `Opaque(Interval, {start: <bound>, end: <bound>})`.
fn axis_interval_to_value<'heap>(
    heap: &'heap Heap,
    symbols: &InternSet<'heap, [Symbol<'heap>]>,
    interval: &AxisInterval,
) -> Value<'heap, &'heap Heap> {
    let start = match interval.start {
        AxisBound::Unbounded => unbounded_bound(heap),
        AxisBound::Included(ms) => Value::Opaque(value::Opaque::new(
            sym::path::InclusiveTemporalBound,
            Rc::new_in(timestamp_value(heap, ms), heap),
        )),
        AxisBound::Excluded(ms) => exclusive_bound(heap, ms),
    };
    let end = match interval.end {
        AxisBound::Unbounded => unbounded_bound(heap),
        AxisBound::Included(ms) => Value::Opaque(value::Opaque::new(
            sym::path::InclusiveTemporalBound,
            Rc::new_in(timestamp_value(heap, ms), heap),
        )),
        AxisBound::Excluded(ms) => exclusive_bound(heap, ms),
    };
    interval_value(heap, symbols, start, end)
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
    heap: &'heap Heap,
    symbols: &InternSet<'heap, [Symbol<'heap>]>,
    directives: &AxisDirectives,
) -> Value<'heap, &'heap Heap> {
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

    let pinned = Value::Opaque(value::Opaque::new(
        pinned_axis,
        Rc::new_in(timestamp_value(heap, pinned_ms), heap),
    ));
    let variable = Value::Opaque(value::Opaque::new(
        variable_axis_name,
        Rc::new_in(
            axis_interval_to_value(heap, symbols, &variable_interval),
            heap,
        ),
    ));

    let mut builder = value::StructBuilder::<_, 2>::new();
    builder.push(sym::pinned, pinned);
    builder.push(sym::variable, variable);

    let inner = builder.finish(symbols, heap);

    let wrapper_name = if pinned_axis == sym::path::TransactionTime {
        sym::path::PinnedTransactionTimeTemporalAxes
    } else {
        sym::path::PinnedDecisionTimeTemporalAxes
    };

    Value::Opaque(value::Opaque::new(
        wrapper_name,
        Rc::new_in(Value::Struct(inner), heap),
    ))
}

fn option<'heap, T>(
    heap: &'heap Heap,
    value: Option<T>,
    on_value: impl FnOnce(&'heap Heap, T) -> value::Value<'heap, &'heap Heap>,
) -> value::Value<'heap, &'heap Heap> {
    value.map_or_else(
        || {
            value::Value::Opaque(value::Opaque::new(
                sym::path::None,
                Rc::new_in(value::Value::Unit, heap),
            ))
        },
        |value| {
            value::Value::Opaque(value::Opaque::new(
                sym::path::Some,
                Rc::new_in(on_value(heap, value), heap),
            ))
        },
    )
}

/// Builds the shared input set from seeded entity data and axis directives.
///
/// Constructs interpreter [`Value`]s directly from the Rust-typed seed data,
/// mirroring the opaque wrapping structure of the HashQL type system
/// (e.g. `EntityId(Struct { web_id: WebId(ActorGroupEntityUuid(Uuid(String))), ... })`).
///
/// The input names match what J-Expr test files reference via
/// `["input", "<name>", "<type>"]`.
pub(crate) fn build_inputs<'heap>(
    heap: &'heap Heap,
    symbols: &InternSet<'heap, [Symbol<'heap>]>,
    entities: &SeededEntities,
    directives: &AxisDirectives,
) -> Inputs<'heap, &'heap Heap> {
    let mut inputs = Inputs::new_in(heap);

    let string = |value: &str| value::Value::String(value::Str::from(Rc::from_in(value, heap)));

    let uuid = |value: Uuid| {
        value::Value::Opaque(value::Opaque::new(
            sym::path::Uuid,
            Rc::new_in(string(value.to_string().as_str()), heap),
        ))
    };

    let entity_uuid = |value: EntityUuid| {
        value::Value::Opaque(value::Opaque::new(
            sym::path::EntityUuid,
            Rc::new_in(uuid(value.into()), heap),
        ))
    };

    let actor_group_entity_uuid = |value: ActorGroupEntityUuid| {
        value::Value::Opaque(value::Opaque::new(
            sym::path::ActorGroupEntityUuid,
            Rc::new_in(uuid(value.into()), heap),
        ))
    };

    let web_id = |value: WebId| {
        value::Value::Opaque(value::Opaque::new(
            sym::path::WebId,
            Rc::new_in(actor_group_entity_uuid(value.into()), heap),
        ))
    };

    let draft_id = |value: Option<type_system::knowledge::entity::id::DraftId>| {
        option(heap, value, |heap, value| {
            value::Value::Opaque(value::Opaque::new(
                sym::path::DraftId,
                Rc::new_in(uuid(value.into()), heap),
            ))
        })
    };

    let entity_id = |value: type_system::knowledge::entity::id::EntityId| {
        let mut builder = StructBuilder::<_, 3>::new();
        builder.push(sym::web_id, web_id(value.web_id));
        builder.push(sym::entity_uuid, entity_uuid(value.entity_uuid));
        builder.push(sym::draft_id, draft_id(value.draft_id));

        let r#struct = builder.finish(symbols, heap);
        let inner = value::Value::Struct(r#struct);
        value::Value::Opaque(value::Opaque::new(
            sym::path::EntityId,
            Rc::new_in(inner, heap),
        ))
    };

    // Insert an EntityUuid-typed input.
    let insert_entity_uuid =
        |inputs: &mut Inputs<'heap, &'heap Heap>, name: &str, uuid: EntityUuid| {
            inputs.insert(heap.intern_symbol(name), entity_uuid(uuid));
        };

    // Insert a full EntityId-typed input.
    let insert_entity_id =
        |inputs: &mut Inputs<'heap, &'heap Heap>,
         name: &str,
         id: type_system::knowledge::entity::EntityId| {
            inputs.insert(heap.intern_symbol(name), entity_id(id));
        };

    insert_entity_uuid(&mut inputs, "alice_uuid", entities.alice.entity_uuid);
    insert_entity_uuid(&mut inputs, "bob_uuid", entities.bob.entity_uuid);
    insert_entity_uuid(&mut inputs, "org_uuid", entities.organization.entity_uuid);
    insert_entity_uuid(
        &mut inputs,
        "friend_link_uuid",
        entities.friend_link.entity_uuid,
    );
    insert_entity_uuid(
        &mut inputs,
        "draft_alice_uuid",
        entities.draft_alice.entity_uuid,
    );

    insert_entity_id(&mut inputs, "alice_id", entities.alice);
    insert_entity_id(&mut inputs, "bob_id", entities.bob);
    insert_entity_id(&mut inputs, "org_id", entities.organization);
    insert_entity_id(&mut inputs, "friend_link_id", entities.friend_link);
    insert_entity_id(&mut inputs, "draft_alice_id", entities.draft_alice);

    // WebId input (all seeded entities share the same web).
    inputs.insert(heap.intern_symbol("web_id"), web_id(entities.alice.web_id));

    // Creator input: all seeded entities are created by the test user, whose
    // actor UUID doubles as the UUID of the shared user web.
    inputs.insert(
        heap.intern_symbol("creator_uuid"),
        value::Value::Opaque(value::Opaque::new(
            sym::path::CreatedById,
            Rc::new_in(uuid(entities.alice.web_id.into()), heap),
        )),
    );

    // String inputs for property-based filtering.
    inputs.insert(heap.intern_symbol("alice_name"), string("Alice"));

    // Temporal axes from directives (or default: unbounded decision time,
    // far-future transaction pin).
    inputs.insert(
        heap.intern_symbol("temporal_axes"),
        temporal_axes_from_directives(heap, symbols, directives),
    );

    inputs
}
