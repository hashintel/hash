use core::{fmt, ops::ControlFlow};
use std::alloc::Allocator;

use hashql_core::{
    graph::{LinkedGraph, NodeId, linked::Node},
    id::{HasId as _, Id as _},
    intern::Interned,
    symbol::Symbol,
};

use crate::{
    body::{
        local::Local,
        place::{FieldIndex, Place, PlaceRef, Projection, ProjectionKind},
    },
    intern::Interner,
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

/// Attempts to resolve through Param edges when all predecessors agree on the same source.
///
/// If a node's outgoing edges are all `Param` edges and they all resolve to the same local,
/// returns that local. Otherwise returns the input local unchanged.
///
/// Uses a visited set to detect cycles through Param edges.
fn resolve_through_params<'heap, A: Allocator>(
    graph: &LinkedGraph<Local, Edge<'heap>, A>,
    local: Local,
    visited: &mut HashSet<Local>,
) -> Local {
    if !visited.insert(local) {
        return local;
    }

    let node = &graph[NodeId::from_usize(local.as_usize())];
    let outgoing: Vec<_> = graph.outgoing_edges(node.id()).collect();

    if outgoing.is_empty() {
        return local;
    }

    if !outgoing
        .iter()
        .all(|edge| matches!(edge.data.kind, EdgeKind::Param))
    {
        return local;
    }

    let first_edge = &outgoing[0];
    if !first_edge.data.projections.is_empty() {
        return local;
    }

    let first_target = graph[first_edge.target()].data;
    let resolved_first = resolve_through_params(graph, first_target, visited);

    for edge in &outgoing[1..] {
        if !edge.data.projections.is_empty() {
            return local;
        }

        let target = graph[edge.target()].data;
        let resolved = resolve_through_params(graph, target, visited);

        if resolved != resolved_first {
            return local;
        }
    }

    resolved_first
}

/// Checks if an edge kind matches a field projection by index.
fn matches_field_index(kind: EdgeKind<'_>, field_index: FieldIndex) -> bool {
    match kind {
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
    }
}

fn resolve_should_continue<'heap>(
    interner: &Interner<'heap>,
    current: PlaceRef<'heap, 'heap>,
    next: ControlFlow<Place<'heap>, PlaceRef<'heap, 'heap>>,
) -> ControlFlow<Place<'heap>, PlaceRef<'heap, 'heap>> {
    let next = match next {
        ControlFlow::Break(next) => {
            // We're currently in the process of "breaking" out, meaning we need to add our own
            // projection, before continuing
            let mut vec = Vec::with_capacity(next.projections.len() + current.projections.len());

            vec.extend_from_slice(next.projections.0);
            vec.extend_from_slice(current.projections);
            let place = Place {
                local: next.local,
                projections: interner.projections.intern_slice(&vec),
            };

            return ControlFlow::Break(place);
        }
        ControlFlow::Continue(next) => next,
    };

    // Check if the next place has any field projections, if yes, then it is opaque and
    // loading cannot continue.
    if next.projections.is_empty() {
        return ControlFlow::Continue(PlaceRef {
            local: next.local,
            projections: current.projections,
        });
    }

    let mut vec = Vec::with_capacity(next.projections.len() + current.projections.len());

    vec.extend_from_slice(next.projections);
    vec.extend_from_slice(current.projections);
    let place = Place {
        local: next.local,
        projections: interner.projections.intern_slice(&vec),
    };

    return ControlFlow::Break(place);
}

fn follow<'heap, A: Allocator>(
    graph: &LinkedGraph<Local, Edge<'heap>, A>,
    interner: &Interner<'heap>,
    place: PlaceRef<'heap, 'heap>,
) -> ControlFlow<Place<'heap>, PlaceRef<'heap, 'heap>> {
    let mut edges = 0_usize;
    let mut params = 0;
    let node_id = NodeId::new(place.local.as_usize());

    for edge in graph.outgoing_edges(node_id) {
        edges += 1;

        match edge.data.kind {
            EdgeKind::Load => {
                let next_place = resolve_place(
                    graph,
                    interner,
                    PlaceRef {
                        local: Local::new(edge.target().as_usize()),
                        projections: edge.data.projections.0,
                    },
                );

                return resolve_should_continue(interner, place, next_place);
            }
            EdgeKind::Param => params += 1,
            _ => {}
        }
    }

    if edges == params && params > 0 {
        // We can try to follow params, this means that each arm *must* have consensus.
        let mut outgoing = graph.outgoing_edges(node_id);
        let Some(first) = outgoing.next() else {
            unreachable!()
        };

        let candidate = resolve_place(
            graph,
            interner,
            PlaceRef {
                local: Local::new(first.target().as_usize()),
                projections: first.data.projections.0,
            },
        );

        if outgoing.all(|edge| {
            resolve_place(
                graph,
                interner,
                PlaceRef {
                    local: Local::new(edge.target().as_usize()),
                    projections: edge.data.projections.0,
                },
            ) == candidate
        }) {
            // We verified the output, we must now decide *what* to do with the output
            return resolve_should_continue(interner, place, candidate);
        }
    }

    // We weren't able to advance, so just continue with the current place
    ControlFlow::Continue(place)
}

pub(super) fn resolve_place<'heap, A: Allocator>(
    graph: &LinkedGraph<Local, Edge<'heap>, A>,
    interner: &Interner<'heap>,
    place: PlaceRef<'heap, 'heap>,
) -> ControlFlow<Place<'heap>, PlaceRef<'heap, 'heap>> {
    let place = follow(graph, interner, place)?;
    let node_id = NodeId::new(place.local.as_usize());

    let edge = match place.projections {
        [] => {
            // Nothing anymore to do, so we can just return as is, we can safely continue any chain
            return ControlFlow::Continue(place);
        }
        [current, rest @ ..] => match current.kind {
            ProjectionKind::Field(field_index) => {
                let Some(edge) = graph
                    .outgoing_edges(node_id)
                    .find(|edge| matches_field_index(edge.data.kind, field_index))
                else {
                    return ControlFlow::Continue(place);
                };

                edge
            }
            ProjectionKind::FieldByName(symbol) => {
                let Some(edge) = graph.outgoing_edges(node_id).find(
                    |edge| matches!(edge.data.kind, EdgeKind::Field(_, field) if field == symbol),
                ) else {
                    return ControlFlow::Continue(place);
                };

                edge
            }
            ProjectionKind::Index(_) => {
                // there's nothing we can do here
                return ControlFlow::Continue(place);
            }
        },
    };

    let target = Local::new(edge.target().as_usize());

    let next = resolve_place(
        graph,
        interner,
        PlaceRef {
            local: target,
            projections: edge.data.projections.0,
        },
    );
    let mut next = resolve_should_continue(interner, place, next)?;
    next.projections = &next.projections[1..]; // remove the first, as we've just processed it
    resolve_place(graph, interner, next)
}

// /// Resolves a place to its source by following dependencies through the graph.
// ///
// /// Starting from the place's local, this method traces each projection through the dependency
// /// graph. When following an edge, the edge's own projections are prepended to the remaining
// /// projections, ensuring correct resolution through nested aggregates.
// ///
// /// Returns the resolved [`Place`] with any unresolved projections remaining.
// ///
// /// Resolution stops when:
// /// - A dynamic [`Index`](ProjectionKind::Index) projection is encountered
// /// - No matching edge is found (opaque value, e.g., function return)
// /// - All projections are resolved
// ///
// /// # Examples
// ///
// /// Given MIR:
// /// ```text
// /// _1 = input.field
// /// _2 = (_1, other)  // Edge: _2 --[Index(0), projections: [.field]]--> input
// /// _3 = _2.0.bar     // Should resolve through to input.field.bar
// /// ```
// ///
// /// Resolving `_3` traces: `_3` → load to `_2.0.bar` → `Index(0)` edge prepends `.field`
// /// → resolving `input.field.bar`.
// pub(crate) fn resolve_place<'heap, A: Allocator>(
//     graph: &LinkedGraph<Local, Edge<'heap>, A>,
//     interner: &Interner<'heap>,
//     place: Place<'heap>,
// ) -> Place<'heap> {
//     let mut local = place.local;
//     let mut projections: Vec<Projection<'heap>> = place.projections.to_vec();
//     let mut index = 0;

//     let max_iterations = graph.nodes().len() * (projections.len() + 1).max(16);
//     let mut iterations = 0;

//     loop {
//         iterations += 1;
//         debug_assert!(
//             iterations <= max_iterations,
//             "infinite loop in resolve_place"
//         );

//         let mut node = &graph[NodeId::from_usize(local.as_usize())];
//         follow_load(graph, &mut node);
//         local = node.data;

//         let Some(projection) = projections.get(index) else {
//             break;
//         };

//         match projection.kind {
//             ProjectionKind::Field(field_index) => {
//                 let Some(edge) = graph
//                     .outgoing_edges(node.id())
//                     .find(|edge| matches_field_index(edge.data.kind, field_index))
//                 else {
//                     break;
//                 };

//                 local = graph[edge.target()].data;

//                 if edge.data.projections.is_empty() {
//                     index += 1;
//                 } else {
//                     let remaining = &projections[index + 1..];
//                     projections = edge
//                         .data
//                         .projections
//                         .iter()
//                         .copied()
//                         .chain(remaining.iter().copied())
//                         .collect();
//                     index = 0;
//                 }
//             }
//             ProjectionKind::FieldByName(symbol) => {
// let Some(edge) = graph.outgoing_edges(node.id()).find(
//     |edge| matches!(edge.data.kind, EdgeKind::Field(_, field) if field == symbol),
// ) else {
//     break;
// };

//                 local = graph[edge.target()].data;

//                 if edge.data.projections.is_empty() {
//                     index += 1;
//                 } else {
//                     let remaining = &projections[index + 1..];
//                     projections = edge
//                         .data
//                         .projections
//                         .iter()
//                         .copied()
//                         .chain(remaining.iter().copied())
//                         .collect();
//                     index = 0;
//                 }
//             }
//             ProjectionKind::Index(_) => break,
//         }
//     }

//     let remaining_projections = &projections[index..];

//     if remaining_projections.is_empty() {
//         let mut visited = HashSet::new();
//         local = resolve_through_params(graph, local, &mut visited);
//     }

//     Place {
//         local,
//         projections: interner.projections.intern_slice(remaining_projections),
//     }
// }
