use core::fmt;
use std::alloc::Allocator;

use hashql_core::{
    graph::{LinkedGraph, NodeId, linked::Node},
    id::{HasId as _, Id as _},
    intern::Interned,
    symbol::Symbol,
};

use crate::body::{
    local::Local,
    place::{FieldIndex, Projection, ProjectionKind},
};

/// Describes which component of a structured value an edge represents.
///
/// Every dependency edge has an [`EdgeKind`] identifying its structural role. This enables
/// [`DataDependencyGraph::resolve`] to trace projections through aggregate constructions
/// and find the original source of a field access.
///
/// Only *structural* edges are tracked — those that can be resolved through via projections.
/// Non-structural dependencies (binary operands, function arguments, etc.) are not tracked
/// in the graph since they cannot be projected into and are better handled by inspecting
/// the [`RValue`] directly or using dataflow analysis.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum EdgeKind<'heap> {
    /// A load operation that copies the entire value.
    ///
    /// Used for [`RValue::Load`], where the complete value flows from source to destination.
    /// This is the only edge kind that [`DataDependencyGraph::resolve`] follows transitively,
    /// because a load always has exactly one source.
    Load,

    /// A block parameter receiving a value from a predecessor.
    ///
    /// Unlike other edge kinds, a block parameter may have multiple incoming edges (one per
    /// predecessor). Resolution through `Param` edges requires all predecessors to agree
    /// on the same source value.
    Param,

    /// A positional component in a tuple aggregate.
    ///
    /// The [`FieldIndex`] corresponds to the tuple position (0, 1, 2, ...).
    Index(FieldIndex),

    /// A named field in a struct aggregate.
    ///
    /// Stores both the positional index and the field name for matching against both
    /// [`ProjectionKind::Field`] and [`ProjectionKind::FieldByName`].
    Field(FieldIndex, Symbol<'heap>),

    /// The function pointer component of a closure (index 0).
    ClosurePtr,

    /// The captured environment component of a closure (index 1).
    ClosureEnv,
}

/// An edge in the data dependency graph.
///
/// Each edge connects a local (the dependent) to another local (the dependency) and carries
/// metadata about which component is being accessed and any remaining projections.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Edge<'heap> {
    /// Which structural component this edge represents.
    ///
    /// Identifies the edge's role in aggregate construction, enabling resolution
    /// to trace projections back to their source.
    pub kind: EdgeKind<'heap>,

    /// The projection path from the dependency local to the actual accessed value.
    ///
    /// For a place like `_1.field.0`, the edge target is `_1` and projections contains
    /// `[.field, .0]`.
    pub projections: Interned<'heap, [Projection<'heap>]>,
}

#[expect(clippy::use_debug)]
pub(crate) fn write_graph<A: Allocator>(
    graph: &LinkedGraph<Local, Edge<'_>, A>,
    mut writer: impl fmt::Write,
) -> fmt::Result {
    for edge in graph.edges() {
        let source = edge.source();
        let target = edge.target();
        let Edge { kind, projections } = &edge.data;

        write!(writer, "%{source} -> %{target} [{kind:?}")?;
        if !projections.is_empty() {
            write!(writer, ", projections: ")?;
        }
        for projection in projections {
            write!(writer, "{}", projection.kind)?;
        }
        writeln!(writer, "]")?;
    }

    Ok(())
}

/// Follows [`EdgeKind::Load`] edges from a node until reaching a non-load definition.
///
/// Load edges represent pure value copies, so following them transitively finds the
/// original definition site of a value.
fn follow_load<'this, 'heap, A: Allocator>(
    graph: &'this LinkedGraph<Local, Edge<'heap>, A>,
    node: &mut &'this Node<Local>,
) {
    let mut visited = 0;
    let max_depth = graph.nodes().len();

    while let Some(edge) = graph
        .outgoing_edges(node.id())
        .find(|edge| matches!(edge.data.kind, EdgeKind::Load))
    {
        visited += 1;
        debug_assert!(visited <= max_depth, "cycle detected in load chain");

        *node = &graph[edge.target()];
    }
}

/// Resolves a place to its source local by following dependencies through the graph.
///
/// Starting from the place's local, this method attempts to trace each projection in the
/// place through the dependency graph. For each field projection, it looks for an outgoing
/// edge with a matching [`EdgeKind`] and follows it to find where that field's value originated.
///
/// Returns a tuple of:
/// - The number of projections that were successfully resolved
/// - The [`Local`] that provides the value at that resolution depth
///
/// Resolution stops early when:
/// - An [`Index`](ProjectionKind::Index) projection is encountered (dynamic indexing)
/// - No matching edge is found (opaque value, e.g., function return)
///
/// # Examples
///
/// Given MIR:
/// ```text
/// _2 = input()
/// _3 = (_1, _2)  // tuple construction
/// _4 = _3.1      // projection
/// ```
///
/// Resolving `_4` (with no projections) returns `(0, _2)` because:
/// 1. `_4` has a `Load` edge to `_3`
/// 2. Following through `_3`, the `.1` projection matches `Index(1)` → `_2`
///
/// Resolving `_3.1` returns `(1, _2)` because the `.1` projection resolves through the
/// tuple construction.
pub(crate) fn resolve<'heap, A: Allocator>(
    graph: &LinkedGraph<Local, Edge<'heap>, A>,
    local: Local,
    projections: &[Projection<'heap>],
) -> (usize, Local) {
    let mut node = &graph[NodeId::from_usize(local.as_usize())];

    for (index, projection) in projections.iter().enumerate() {
        follow_load(graph, &mut node);

        match projection.kind {
            ProjectionKind::Field(field_index) => {
                let Some(edge) =
                    graph
                        .outgoing_edges(node.id())
                        .find(|edge| match edge.data.kind {
                            EdgeKind::Index(idx) if idx == field_index => true,
                            EdgeKind::Field(idx, _) if idx == field_index => true,
                            EdgeKind::ClosurePtr if field_index.as_usize() == 0 => true,
                            EdgeKind::ClosureEnv if field_index.as_usize() == 1 => true,
                            EdgeKind::Load
                            | EdgeKind::Param
                            | EdgeKind::Index(_)
                            | EdgeKind::Field(..)
                            | EdgeKind::ClosurePtr
                            | EdgeKind::ClosureEnv => false,
                        })
                else {
                    // This is not an error, it simply means that we weren't able to determine
                    // the projection, this may be the case due to an opaque field, such as a
                    // result from a function call.
                    return (index, node.data);
                };

                node = &graph[edge.target()];
            }
            ProjectionKind::FieldByName(symbol) => {
                let Some(edge) = graph.outgoing_edges(node.id()).find(
                    |edge| matches!(edge.data.kind, EdgeKind::Field(_, field) if field == symbol),
                ) else {
                    // This is not an error, it simply means that we weren't able to determine
                    // the projection, this may be the case due to an opaque field, such as a
                    // result from a function call.
                    return (index, node.data);
                };

                node = &graph[edge.target()];
            }
            // We cannot advance, therefore terminate the resolution
            ProjectionKind::Index(_) => return (index, node.data),
        }
    }

    follow_load(graph, &mut node);
    (projections.len(), node.data)
}
