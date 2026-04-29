use hashql_compiletest::pipeline::Pipeline;
use hashql_core::{
    heap,
    module::std_lib::graph::types::knowledge::entity,
    r#type::{TypeBuilder, TypeId},
};
use hashql_hir::node::{HirId, operation::InputOp};
use hashql_mir::{
    body::{
        Body, Source,
        operand::Operand,
        terminator::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail, TerminatorKind},
    },
    builder::BodyBuilder,
    def::{DefId, DefIdVec},
    intern::Interner,
    op,
};

/// 1.2: Filter entities where the "name" property equals the `alice_name` input.
///
/// Constructs a graph read with a filter body that projects
/// `vertex.properties.<name_url>` and compares against a string input.
/// This exercises the property hydration path, which requires the MIR builder
/// because property field names are URLs that the HIR cannot resolve.
pub(crate) fn property_access<'heap>(
    pipeline: &Pipeline<'heap>,
) -> (Interner<'heap>, DefId, DefIdVec<Body<'heap>>) {
    let heap = pipeline.heap;
    let interner = Interner::new(heap);
    let ty = TypeBuilder::synthetic(&pipeline.env);

    let unknown_ty = ty.unknown();
    let bool_ty = ty.boolean();
    let unit_ty = ty.tuple([] as [TypeId; 0]);

    // Entity<?>: properties are un-narrowed.
    let entity_ty = entity::types::entity(&ty, unknown_ty, None);

    let entry_id = DefId::new(0);
    let filter_id = DefId::new(1);

    // Entry body: load temporal_axes, graph read with filter, return result.
    let entry_body = {
        let mut builder = BodyBuilder::new(&interner);

        let axis = builder.local("axis", unknown_ty);
        let env_local = builder.local("env", unit_ty);
        let graph_result = builder.local("graph_result", unknown_ty);

        let bb0 = builder.reserve_block([]);
        let bb1 = builder.reserve_block([graph_result.local]);

        builder
            .build_block(bb0)
            .assign_place(axis, |rv| {
                rv.input(InputOp::Load { required: true }, "temporal_axes")
            })
            .assign_place(env_local, |rv| rv.tuple([] as [Operand<'_>; 0]))
            .finish_with_terminator(TerminatorKind::GraphRead(GraphRead {
                head: GraphReadHead::Entity {
                    axis: Operand::Place(axis),
                },
                body: {
                    let mut body = heap::Vec::new_in(heap);
                    body.push(GraphReadBody::Filter(filter_id, env_local.local));
                    body
                },
                tail: GraphReadTail::Collect,
                target: bb1,
            }));

        builder.build_block(bb1).ret(graph_result);

        let mut body = builder.finish(0, unknown_ty);
        body.id = entry_id;
        body.source = Source::Closure(HirId::PLACEHOLDER, None);
        body
    };

    // Filter body: fn(env: (), vertex: Entity<?>) -> Bool
    let filter_body = {
        let mut builder = BodyBuilder::new(&interner);

        let _env = builder.local("env", unit_ty);
        let vertex = builder.local("vertex", entity_ty);
        let props =
            builder.place(|place| place.from(vertex).field_by_name("properties", unknown_ty));
        let name_value = builder.place(|place| {
            place.from(props).field_by_name(
                "https://blockprotocol.org/@alice/types/property-type/name/",
                unknown_ty,
            )
        });
        let alice_name = builder.local("alice_name", unknown_ty);
        let result = builder.local("result", bool_ty);

        let bb0 = builder.reserve_block([]);

        builder
            .build_block(bb0)
            .assign_place(alice_name, |rv| {
                rv.input(InputOp::Load { required: true }, "alice_name")
            })
            .assign_place(result, |rv| rv.binary(name_value, op![==], alice_name))
            .ret(result);

        let mut body = builder.finish(2, bool_ty);
        body.id = filter_id;
        body.source = Source::GraphReadFilter(HirId::PLACEHOLDER);
        body
    };

    // Entry must be pushed first (DefId 0), filter second (DefId 1).
    let mut bodies = DefIdVec::new();
    let id0 = bodies.push(entry_body);
    let id1 = bodies.push(filter_body);
    debug_assert_eq!(id0, entry_id);
    debug_assert_eq!(id1, filter_id);

    (interner, entry_id, bodies)
}

/// Filter entities where `age + 5 > 30`.
///
/// Exercises NULL propagation through arithmetic on a missing JSONB key:
/// only Bob has an `age` property (42), so `42 + 5 = 47 > 30` passes.
/// All other entities lack the key, producing NULL that propagates through
/// the addition and comparison, then gets rejected by the COALESCE at the
/// continuation return point.
pub(crate) fn property_arithmetic<'heap>(
    pipeline: &Pipeline<'heap>,
) -> (Interner<'heap>, DefId, DefIdVec<Body<'heap>>) {
    let heap = pipeline.heap;
    let interner = Interner::new(heap);
    let ty = TypeBuilder::synthetic(&pipeline.env);

    let unknown_ty = ty.unknown();
    let bool_ty = ty.boolean();
    let int_ty = ty.integer();
    let unit_ty = ty.tuple([] as [TypeId; 0]);

    let entity_ty = entity::types::entity(&ty, unknown_ty, None);

    let entry_id = DefId::new(0);
    let filter_id = DefId::new(1);

    let entry_body = {
        let mut builder = BodyBuilder::new(&interner);

        let axis = builder.local("axis", unknown_ty);
        let env_local = builder.local("env", unit_ty);
        let graph_result = builder.local("graph_result", unknown_ty);

        let bb0 = builder.reserve_block([]);
        let bb1 = builder.reserve_block([graph_result.local]);

        builder
            .build_block(bb0)
            .assign_place(axis, |rv| {
                rv.input(InputOp::Load { required: true }, "temporal_axes")
            })
            .assign_place(env_local, |rv| rv.tuple([] as [Operand<'_>; 0]))
            .finish_with_terminator(TerminatorKind::GraphRead(GraphRead {
                head: GraphReadHead::Entity {
                    axis: Operand::Place(axis),
                },
                body: {
                    let mut body = heap::Vec::new_in(heap);
                    body.push(GraphReadBody::Filter(filter_id, env_local.local));
                    body
                },
                tail: GraphReadTail::Collect,
                target: bb1,
            }));

        builder.build_block(bb1).ret(graph_result);

        let mut body = builder.finish(0, unknown_ty);
        body.id = entry_id;
        body.source = Source::Closure(HirId::PLACEHOLDER, None);
        body
    };

    // Filter body: (vertex.properties.<age_url> + 5) > 30
    let filter_body = {
        let mut builder = BodyBuilder::new(&interner);

        let _env = builder.local("env", unit_ty);
        let vertex = builder.local("vertex", entity_ty);
        let props =
            builder.place(|place| place.from(vertex).field_by_name("properties", unknown_ty));
        let age_value = builder.place(|place| {
            place.from(props).field_by_name(
                "https://blockprotocol.org/@alice/types/property-type/age/",
                unknown_ty,
            )
        });
        let sum = builder.local("sum", int_ty);
        let result = builder.local("result", bool_ty);
        let five = builder.const_int(5);
        let thirty = builder.const_int(30);

        let bb0 = builder.reserve_block([]);

        builder
            .build_block(bb0)
            .assign_place(sum, |rv| rv.binary(age_value, op![+], five))
            .assign_place(result, |rv| rv.binary(sum, op![>], thirty))
            .ret(result);

        let mut body = builder.finish(2, bool_ty);
        body.id = filter_id;
        body.source = Source::GraphReadFilter(HirId::PLACEHOLDER);
        body
    };

    let mut bodies = DefIdVec::new();
    let id0 = bodies.push(entry_body);
    let id1 = bodies.push(filter_body);
    debug_assert_eq!(id0, entry_id);
    debug_assert_eq!(id1, filter_id);

    (interner, entry_id, bodies)
}
