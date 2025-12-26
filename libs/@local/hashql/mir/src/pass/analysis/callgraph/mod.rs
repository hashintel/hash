//! Call graph analysis for MIR.
//!
//! This module provides [`CallGraphAnalysis`], a pass that constructs a [`CallGraph`] representing
//! function call relationships between [`DefId`]s in the MIR. The resulting graph can be used for
//! call site enumeration, reachability analysis, and optimization decisions.
//!
//! # Graph Structure
//!
//! The call graph uses [`DefId`]s as nodes and tracks references between them as directed edges.
//! An edge from `A` to `B` means "the MIR body of A references B", annotated with a [`CallKind`]
//! describing how the reference occurs:
//!
//! - [`CallKind::Apply`]: Direct function application via an [`Apply`] rvalue
//! - [`CallKind::Filter`]: Graph-read filter function in a [`GraphReadBody::Filter`] terminator
//! - [`CallKind::Opaque`]: Any other reference (types, constants, function pointers)
//!
//! For example, given a body `@0` containing `_1 = @1(_2)`:
//! - An edge `@0 → @1` is created with kind [`CallKind::Apply`]
//!
//! # Usage Pattern
//!
//! Unlike [`DataDependencyAnalysis`] which is per-body, [`CallGraphAnalysis`] operates on a shared
//! [`CallGraph`] across multiple bodies:
//!
//! 1. Create a [`CallGraph`] with a domain containing all [`DefId`]s that may appear
//! 2. Run [`CallGraphAnalysis`] on each body to populate edges
//! 3. Query the resulting graph
//!
//! # Direct vs Indirect Calls
//!
//! Only *direct* calls are tracked as [`CallKind::Apply`] — those where the callee [`DefId`]
//! appears syntactically as the function operand. Indirect calls through locals (e.g.,
//! `_1 = @fn; _2 = _1(...)`) produce an [`Opaque`] edge at the assignment site, not an
//! [`Apply`] edge at the call site.
//!
//! This is intentional: the analysis is designed to run after forward substitution, which
//! propagates function references through locals, eliminating most indirect call patterns.
//!
//! [`Opaque`]: CallKind::Opaque
//! [`DataDependencyAnalysis`]: super::DataDependencyAnalysis
//! [`Apply`]: crate::body::rvalue::Apply
//! [`GraphReadBody::Filter`]: crate::body::terminator::GraphReadBody::Filter

#[cfg(test)]
mod tests;

use alloc::alloc::Global;
use core::{alloc::Allocator, fmt};

use hashql_core::{
    graph::{DirectedGraph, EdgeId, LinkedGraph, NodeId, Successors, Traverse},
    id::Id as _,
};

use crate::{
    body::{
        Body, Source,
        location::Location,
        place::{PlaceContext, PlaceReadContext},
        rvalue::Apply,
        terminator::{GraphReadBody, GraphReadLocation},
    },
    context::MirContext,
    def::{DefId, DefIdSlice},
    pass::AnalysisPass,
    visit::Visitor,
};

/// Classification of [`DefId`] references in the call graph.
///
/// Each edge in the [`CallGraph`] is annotated with a `CallKind` to distinguish direct call sites
/// from other kinds of references. This enables consumers to differentiate between actual function
/// invocations and incidental references.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum CallKind {
    /// Direct function application at the given MIR [`Location`].
    ///
    /// Created when a [`DefId`] appears syntactically as the function operand in an [`Apply`]
    /// rvalue. The location identifies the exact statement where the call occurs.
    ///
    /// [`Apply`]: crate::body::rvalue::Apply
    Apply(Location),

    /// Graph-read filter function call at the given [`GraphReadLocation`].
    ///
    /// Created when a [`DefId`] is the filter function in a [`GraphReadBody::Filter`] terminator.
    ///
    /// [`GraphReadBody::Filter`]: crate::body::terminator::GraphReadBody::Filter
    Filter(GraphReadLocation),

    /// Any other reference to a [`DefId`].
    ///
    /// Includes type references, constant uses, function pointer assignments, and indirect call
    /// targets. For indirect calls, this edge appears at the assignment site, not the call site.
    Opaque,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct CallSite<C = CallKind> {
    pub caller: DefId,
    pub kind: C,

    pub target: DefId,
}

/// A directed graph of [`DefId`] references across MIR bodies.
///
/// Nodes correspond to [`DefId`]s and edges represent references from one definition to another,
/// annotated with [`CallKind`] to distinguish call sites from other reference types.
///
/// The graph is populated by running [`CallGraphAnalysis`] on each MIR body. Multiple bodies
/// can contribute edges to the same graph, building up a complete picture of inter-procedural
/// references.
pub struct CallGraph<'heap, A: Allocator = Global> {
    inner: LinkedGraph<Source<'heap>, CallKind, A>,
}

impl<'heap> CallGraph<'heap> {
    /// Creates a new call graph with the given `domain` of [`DefId`]s.
    ///
    /// All [`DefId`]s that may appear as edge endpoints must be present in the domain.
    #[inline]
    #[must_use]
    pub fn new(domain: &DefIdSlice<Body<'heap>>) -> Self {
        Self::new_in(domain, Global)
    }

    #[inline]
    #[must_use]
    pub fn analyze(domain: &DefIdSlice<Body<'heap>>) -> Self {
        Self::analyze_in(domain, Global)
    }
}

impl<'heap, A: Allocator + Clone> CallGraph<'heap, A> {
    /// Creates a new call graph with the given `domain` using the specified `alloc`ator.
    ///
    /// All [`DefId`]s that may appear as edge endpoints must be present in the domain.
    pub fn new_in(domain: &DefIdSlice<Body<'heap>>, alloc: A) -> Self {
        let mut graph = LinkedGraph::new_in(alloc);
        graph.derive(domain, |_, body| body.source);

        Self { inner: graph }
    }

    pub fn analyze_in(domain: &DefIdSlice<Body<'heap>>, alloc: A) -> Self {
        let mut graph = Self::new_in(domain, alloc);
        let mut visitor = CallGraphAnalysis::new(&mut graph);
        for body in domain {
            visitor.analyze(body);
        }

        graph
    }
}

impl<A: Allocator> CallGraph<'_, A> {
    #[inline]
    pub fn callsites(&self, def: DefId) -> impl Iterator<Item = CallSite> {
        let node = NodeId::new(def.as_usize());

        self.inner.outgoing_edges(node).map(move |edge| CallSite {
            caller: def,
            kind: edge.data,
            target: DefId::new(edge.target().as_u32()),
        })
    }

    #[inline]
    pub fn apply_callsites(&self, def: DefId) -> impl Iterator<Item = CallSite<Location>> {
        let node = NodeId::new(def.as_usize());

        self.inner
            .outgoing_edges(node)
            .filter_map(move |edge| match edge.data {
                CallKind::Apply(location) => Some(CallSite {
                    caller: def,
                    kind: location,
                    target: DefId::new(edge.target().as_u32()),
                }),
                CallKind::Filter(_) | CallKind::Opaque => None,
            })
    }

    #[inline]
    pub fn is_leaf(&self, def: DefId) -> bool {
        let def = NodeId::new(def.as_usize());

        self.inner.outgoing_edges(def).all(|edge| {
            let target = self
                .inner
                .node(edge.target())
                .unwrap_or_else(|| unreachable!("target must exist"));

            // Leafs are functions, which can only have intrinsic edges
            matches!(target.data, Source::Intrinsic(_))
        })
    }

    #[inline]
    pub fn is_single_caller(&self, caller: DefId, target: DefId) -> bool {
        let caller = NodeId::new(caller.as_usize());
        let target = NodeId::new(target.as_usize());

        self.inner
            .incoming_edges(target)
            .all(|edge| matches!(edge.data, CallKind::Apply(_)) && edge.source() == caller)
    }

    #[inline]
    pub fn unique_caller(&self, callee: DefId) -> Option<DefId> {
        // Same as is_single_caller, but makes sure that there is exactly one edge
        let callee = NodeId::new(callee.as_usize());

        let mut incoming = self.inner.incoming_edges(callee);
        let edge = incoming.next()?;

        if incoming.next().is_some() {
            return None;
        }

        match edge.data {
            CallKind::Apply(_) => Some(DefId::new(edge.source().as_u32())),
            CallKind::Filter(_) | CallKind::Opaque => None,
        }
    }
}

impl<A: Allocator> DirectedGraph for CallGraph<'_, A> {
    type Edge<'this>
        = ()
    where
        Self: 'this;
    type EdgeId = EdgeId;
    type Node<'this>
        = DefId
    where
        Self: 'this;
    type NodeId = DefId;

    fn node_count(&self) -> usize {
        self.inner.node_count()
    }

    fn edge_count(&self) -> usize {
        self.inner.edge_count()
    }

    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator {
        self.inner
            .iter_nodes()
            .map(|node| DefId::new(node.id().as_u32()))
    }

    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator {
        self.inner.iter_edges().map(|_| ())
    }
}

impl<A: Allocator> Successors for CallGraph<'_, A> {
    type SuccIter<'this>
        = impl Iterator<Item = Self::NodeId>
    where
        Self: 'this;

    fn successors(&self, node: Self::NodeId) -> Self::SuccIter<'_> {
        self.inner
            .successors(NodeId::new(node.as_usize()))
            .map(|node| DefId::new(node.as_u32()))
    }
}

impl<A: Allocator> fmt::Display for CallGraph<'_, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for edge in self.inner.edges() {
            let source = DefId::from_usize(edge.source().as_usize());
            let target = DefId::from_usize(edge.target().as_usize());

            match edge.data {
                CallKind::Apply(location) => {
                    writeln!(fmt, "@{source} -> @{target} [Apply @ {location}]")?;
                }
                CallKind::Filter(location) => {
                    writeln!(fmt, "@{source} -> @{target} [Filter @ {location}]")?;
                }
                CallKind::Opaque => {
                    writeln!(fmt, "@{source} -> @{target} [Opaque]")?;
                }
            }
        }

        Ok(())
    }
}

impl<A: Allocator> DirectedGraph for CallGraph<'_, A> {
    type Edge<'this>
        = EdgeId
    where
        Self: 'this;
    type EdgeId = EdgeId;
    type Node<'this>
        = DefId
    where
        Self: 'this;
    type NodeId = DefId;

    fn node_count(&self) -> usize {
        self.inner.node_count()
    }

    fn edge_count(&self) -> usize {
        self.inner.edge_count()
    }

    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator {
        self.inner.nodes().ids().map(|id| DefId::new(id.as_u32()))
    }

    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator {
        self.inner.edges().ids()
    }
}

impl<A: Allocator> Successors for CallGraph<'_, A> {
    type SuccIter<'this>
        = impl Iterator<Item = Self::NodeId>
    where
        Self: 'this;

    fn successors(&self, node: Self::NodeId) -> Self::SuccIter<'_> {
        self.inner
            .successors(NodeId::from_u32(node.as_u32()))
            .map(|id| DefId::new(id.as_u32()))
    }
}

impl<A: Allocator> Traverse for CallGraph<'_, A> {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum CallKindFilter {
    ApplyOnly,
    FilterOnly,
}

/// Analysis pass that populates a [`CallGraph`] from MIR bodies.
///
/// This pass traverses a MIR body and records an edge for each [`DefId`] reference encountered,
/// annotated with the appropriate [`CallKind`]. Run this pass on each body to build a complete
/// inter-procedural call graph.
pub struct CallGraphAnalysis<'graph, 'heap, A: Allocator = Global> {
    graph: &'graph mut CallGraph<'heap, A>,
    filter: Option<CallKindFilter>,
}

impl<'graph, 'heap, A: Allocator> CallGraphAnalysis<'graph, 'heap, A> {
    /// Creates a new analysis pass that will populate the given `graph`.
    #[must_use]
    pub const fn new(graph: &'graph mut CallGraph<'heap, A>) -> Self {
        Self {
            graph,
            filter: None,
        }
    }

    #[must_use]
    pub const fn with_filter(self, filter: CallKindFilter) -> Self {
        Self {
            graph: self.graph,
            filter: Some(filter),
        }
    }

    fn analyze(&mut self, body: &Body<'heap>) {
        let mut visitor = CallGraphVisitor {
            kind: CallKind::Opaque,
            caller: body.id,
            graph: self.graph,
            filter: self.filter,
        };

        Ok(()) = visitor.visit_body(body);
    }

impl<'env, 'heap, A: Allocator> AnalysisPass<'env, 'heap> for CallGraphAnalysis<'_, 'heap, A> {
    fn run(&mut self, _: &mut MirContext<'env, 'heap>, body: &Body<'heap>) {
        self.analyze(body);
    }
}

impl<'env, 'heap, A: Allocator> AnalysisPass<'env, 'heap> for CallGraphAnalysis<'_, 'heap, A> {
    fn run(&mut self, _: &mut MirContext<'env, 'heap>, body: &Body<'heap>) {
        self.analyze(body);
    }
}

/// Visitor that collects call edges during MIR traversal.
struct CallGraphVisitor<'graph, 'heap, A: Allocator = Global> {
    kind: CallKind,
    caller: DefId,
    graph: &'graph mut CallGraph<'heap, A>,
    filter: Option<CallKindFilter>,
}

impl<'heap, A: Allocator> Visitor<'heap> for CallGraphVisitor<'_, 'heap, A> {
    type Result = Result<(), !>;

    fn visit_def_id(&mut self, _: Location, def_id: DefId) -> Self::Result {
        if !matches!(
            (self.filter, self.kind),
            (None, _)
                | (Some(CallKindFilter::ApplyOnly), CallKind::Apply(_))
                | (Some(CallKindFilter::FilterOnly), CallKind::Filter(_))
        ) {
            return Ok(());
        }

        let source = NodeId::from_usize(self.caller.as_usize());
        let target = NodeId::from_usize(def_id.as_usize());

        self.graph.inner.add_edge(source, target, self.kind);
        Ok(())
    }

    fn visit_rvalue_apply(
        &mut self,
        location: Location,
        Apply {
            function,
            arguments,
        }: &Apply<'heap>,
    ) -> Self::Result {
        debug_assert_eq!(self.kind, CallKind::Opaque);

        if self.filter == Some(CallKindFilter::FilterOnly) {
            // In the case that we're only interested in filter edges, we can skip apply edges
            // completely.
            return Ok(());
        }

        self.kind = CallKind::Apply(location);
        self.visit_operand(location, function)?;
        self.kind = CallKind::Opaque;

        if self.filter.is_some() {
            // Arguments can only add opaque edges, if we're only checking for filter or apply edges
            // we can safely ignore them.
            return Ok(());
        }

        for argument in arguments {
            self.visit_operand(location, argument)?;
        }

        Ok(())
    }

    fn visit_graph_read_body(
        &mut self,
        location: GraphReadLocation,
        body: &GraphReadBody,
    ) -> Self::Result {
        match body {
            &GraphReadBody::Filter(func, env) => {
                debug_assert_eq!(self.kind, CallKind::Opaque);

                if self.filter == Some(CallKindFilter::ApplyOnly) {
                    // If we're only checking for apply edges, we can safely ignore filter edges.
                    return Ok(());
                }

                self.kind = CallKind::Filter(location);
                self.visit_def_id(location.base, func)?;
                self.kind = CallKind::Opaque;

                if self.filter.is_some() {
                    // Env can only add opaque edges, if we're only checking for filter or
                    // apply edges we can safely ignore them.
                    return Ok(());
                }

                self.visit_local(
                    location.base,
                    PlaceContext::Read(PlaceReadContext::Load),
                    env,
                )
            }
        }
    }
}
