use alloc::alloc::Global;
use core::{alloc::Allocator, fmt};

use hashql_core::{
    graph::{LinkedGraph, NodeId, linked::IncidentEdges},
    id::Id as _,
    intern::Interned,
    symbol::Symbol,
};

use super::resolve::{ResolutionResult, ResolutionState};
use crate::{
    body::{
        constant::Constant,
        local::{Local, LocalSlice, LocalVec},
        operand::Operand,
        place::{FieldIndex, Place, PlaceMut, Projection, ProjectionKind},
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

impl<'heap> EdgeKind<'heap> {
    fn matches_projection_field_index(&self, index: FieldIndex) -> bool {
        let expected = match self {
            &EdgeKind::Field(field_index, _) | &EdgeKind::Index(field_index) => field_index,
            EdgeKind::ClosurePtr => FieldIndex::new(0),
            EdgeKind::ClosureEnv => FieldIndex::new(1),
            EdgeKind::Load | EdgeKind::Param => return false,
        };

        index == expected
    }

    fn matches_projection_field_name(&self, name: Symbol<'heap>) -> bool {
        match self {
            &EdgeKind::Field(_, field_name) => field_name == name,
            EdgeKind::Load
            | EdgeKind::Param
            | EdgeKind::Index(_)
            | EdgeKind::ClosurePtr
            | EdgeKind::ClosureEnv => false,
        }
    }

    pub(crate) fn matches_projection(&self, projection: ProjectionKind<'heap>) -> bool {
        match projection {
            ProjectionKind::Field(index) => self.matches_projection_field_index(index),
            ProjectionKind::FieldByName(name) => self.matches_projection_field_name(name),
            ProjectionKind::Index(_) => false,
        }
    }
}

/// An edge in the data dependency graph.
///
/// Each edge connects a local (the dependent) to another local (the dependency) and carries
/// metadata about which component is being accessed and any remaining projections.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct EdgeData<'heap> {
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
    graph: &LinkedGraph<Local, EdgeData<'_>, A>,
    mut writer: impl fmt::Write,
) -> fmt::Result {
    for edge in graph.edges() {
        let source = edge.source();
        let target = edge.target();
        let EdgeData { kind, projections } = &edge.data;

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

#[derive(Debug, Clone)]
struct ConstantBinding<'heap> {
    kind: EdgeKind<'heap>,
    constant: Constant<'heap>,
}

#[derive(Debug)]
pub(crate) struct ConstantBindings<'heap, A: Allocator = Global> {
    inner: LocalVec<Vec<ConstantBinding<'heap>, A>, A>,
}

impl<'heap, A: Allocator> ConstantBindings<'heap, A> {
    pub(crate) fn insert(
        &mut self,
        local: Local,
        edge: EdgeKind<'heap>,
        constant: Constant<'heap>,
    ) {
        self.inner[local].push(ConstantBinding {
            kind: edge,
            constant,
        });
    }

    pub(crate) const fn empty_in(alloc: A) -> Self {
        Self {
            inner: LocalVec::new_in(alloc),
        }
    }

    pub(crate) fn from_domain_in(local_decls: &LocalSlice<impl Sized>, alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            inner: LocalVec::from_domain_in(Vec::new_in(alloc.clone()), local_decls, alloc),
        }
    }

    pub(crate) fn find(
        &self,
        local: Local,
        projection: ProjectionKind<'heap>,
    ) -> Option<Constant<'heap>> {
        self.inner[local]
            .iter()
            .find(|binding| binding.kind.matches_projection(projection))
            .map(|binding| binding.constant)
    }

    pub(crate) fn find_by_kind(
        &self,
        local: Local,
        kind: EdgeKind<'heap>,
    ) -> Option<Constant<'heap>> {
        self.inner[local]
            .iter()
            .find(|binding| binding.kind == kind)
            .map(|binding| binding.constant)
    }
}

#[expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "required in resolve"
)]
#[derive(Debug)]
pub struct DataDependencyGraph<'heap, A: Allocator = Global> {
    alloc: A,
    pub(super) graph: LinkedGraph<Local, EdgeData<'heap>, A>,
    pub(super) constant_bindings: ConstantBindings<'heap, A>,
}

impl<'heap, A: Allocator> DataDependencyGraph<'heap, A> {
    pub fn replace(&self, interner: &Interner<'heap>, place: Place<'heap>) -> Operand<'heap>
    where
        A: Clone,
    {
        let result = super::resolve::resolve(
            ResolutionState {
                graph: self,
                interner,
                alloc: self.alloc.clone(),
                visited: None,
            },
            place.as_ref(),
        );

        match result {
            ResolutionResult::Backtrack => {
                unreachable!("we didn't start it, therefore not reachable")
            }
            ResolutionResult::Resolved(operand) => operand,
            ResolutionResult::Incomplete(PlaceMut {
                local,
                mut projections,
            }) => {
                // We weren't able to fully resolve the place, so need to materialize a new one
                Operand::Place(Place {
                    local,
                    projections: interner
                        .projections
                        .intern_slice(projections.make_contiguous()),
                })
            }
        }
    }

    pub(crate) const fn new(
        alloc: A,
        graph: LinkedGraph<Local, EdgeData<'heap>, A>,
        constant_bindings: ConstantBindings<'heap, A>,
    ) -> Self {
        Self {
            alloc,
            graph,
            constant_bindings,
        }
    }

    pub(crate) fn outgoing_edges<'this>(
        &'this self,
        local: Local,
    ) -> IncidentEdges<'this, Local, EdgeData<'heap>, A> {
        let node_id = NodeId::new(local.as_usize());

        self.graph.outgoing_edges(node_id)
    }
}
