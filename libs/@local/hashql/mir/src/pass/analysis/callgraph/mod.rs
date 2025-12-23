//! Call graph analysis for MIR.
//!
//! This module provides [`CallGraphAnalysis`], a pass that constructs a [`CallGraph`] representing
//! function call relationships between [`DefId`]s in the MIR. The graph can be used for call site
//! enumeration, reachability analysis, and optimization decisions.
//!
//! # Graph Structure
//!
//! The call graph uses [`DefId`]s as nodes and tracks references between them as directed edges.
//! An edge from `A` to `B` means "the MIR body of A references B", annotated with a [`CallKind`]
//! describing how the reference occurs:
//!
//! - [`CallKind::Apply`]: Direct function application at a specific location
//! - [`CallKind::Filter`]: Graph-read filter function call
//! - [`CallKind::Opaque`]: Any other reference (types, constants, function pointers, etc.)
//!
//! # Usage Pattern
//!
//! Unlike [`DataDependencyAnalysis`] which is per-body, [`CallGraphAnalysis`] operates on a shared
//! [`CallGraph`] across multiple bodies. The caller must:
//!
//! 1. Create a [`CallGraph`] with a domain containing all [`DefId`]s that may appear
//! 2. Run [`CallGraphAnalysis`] on each body to populate edges
//! 3. Query the resulting graph
//!
//! # Limitations
//!
//! Only *direct* calls are tracked as [`CallKind::Apply`] — those where the callee [`DefId`]
//! appears syntactically in the function operand. Indirect calls through locals or function
//! pointers appear as [`CallKind::Opaque`] edges at the point where the [`DefId`] is referenced,
//! not at the call site.
//!
//! [`DataDependencyAnalysis`]: super::DataDependencyAnalysis

#[cfg(test)]
mod tests;

use alloc::alloc::Global;
use core::{alloc::Allocator, fmt};

use hashql_core::{
    graph::{LinkedGraph, NodeId},
    id::Id as _,
};

use crate::{
    body::{
        Body,
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
/// Each edge in the [`CallGraph`] is annotated with a `CallKind` to distinguish actual call sites
/// from other kinds of references.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum CallKind {
    /// Direct function application at the given MIR location.
    ///
    /// The [`DefId`] appears syntactically as the function operand in an [`Apply`] rvalue.
    Apply(Location),

    /// Graph-read filter function call at the given location.
    ///
    /// The [`DefId`] is the filter function in a [`GraphReadBody::Filter`] terminator.
    Filter(GraphReadLocation),

    /// Any other reference to a [`DefId`].
    ///
    /// Includes type references, constant uses, function pointer initialization, and other
    /// non-call references.
    Opaque,
}

/// A global call graph over [`DefId`]s.
pub struct CallGraph<A: Allocator = Global> {
    inner: LinkedGraph<(), CallKind, A>,
}

impl CallGraph {
    /// Creates a new call graph using the global allocator.
    pub fn new(domain: &DefIdSlice<impl Sized>) -> Self {
        Self::new_in(domain, Global)
    }
}

impl<A: Allocator + Clone> CallGraph<A> {
    /// Creates a new call graph using the specified allocator.
    pub fn new_in(domain: &DefIdSlice<impl Sized>, alloc: A) -> Self {
        let mut graph = LinkedGraph::new_in(alloc);
        graph.derive(domain, |_, _| ());

        Self { inner: graph }
    }
}

impl<A: Allocator> fmt::Display for CallGraph<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for edge in self.inner.edges() {
            let source = DefId::from_usize(edge.source().as_usize());
            let target = DefId::from_usize(edge.target().as_usize());

            #[expect(clippy::use_debug)]
            match edge.data {
                CallKind::Apply(location) => {
                    writeln!(fmt, "@{source} -> @{target} [Apply @ {location:?}]")?;
                }
                CallKind::Filter(location) => {
                    writeln!(fmt, "@{source} -> @{target} [Filter @ {location:?}]")?;
                }
                CallKind::Opaque => {
                    writeln!(fmt, "@{source} -> @{target} [Opaque]")?;
                }
            }
        }

        Ok(())
    }
}

/// Analysis pass that populates a shared [`CallGraph`] from MIR bodies.
///
/// This pass traverses a MIR body and records edges for each [`DefId`] reference encountered.
pub struct CallGraphAnalysis<'graph, A: Allocator = Global> {
    graph: &'graph mut CallGraph<A>,
}

impl<'graph, A: Allocator> CallGraphAnalysis<'graph, A> {
    /// Creates a new analysis pass that will populate the given graph.
    pub const fn new(graph: &'graph mut CallGraph<A>) -> Self {
        Self { graph }
    }
}

impl<'env, 'heap, A: Allocator> AnalysisPass<'env, 'heap> for CallGraphAnalysis<'_, A> {
    fn run(&mut self, _: &mut MirContext<'env, 'heap>, body: &Body<'heap>) {
        let mut visitor = CallGraphVisitor {
            kind: CallKind::Opaque,
            caller: body.id,
            graph: self.graph,
        };

        Ok(()) = visitor.visit_body(body);
    }
}

/// Visitor that collects call edges during MIR traversal.
struct CallGraphVisitor<'graph, A: Allocator = Global> {
    kind: CallKind,
    caller: DefId,
    graph: &'graph mut CallGraph<A>,
}

impl<'heap, A: Allocator> Visitor<'heap> for CallGraphVisitor<'_, A> {
    type Result = Result<(), !>;

    fn visit_def_id(&mut self, _: Location, def_id: DefId) -> Self::Result {
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
        self.kind = CallKind::Apply(location);
        self.visit_operand(location, function)?;
        self.kind = CallKind::Opaque;

        for argument in arguments.iter() {
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
                self.kind = CallKind::Filter(location);
                self.visit_def_id(location.base, func)?;
                self.kind = CallKind::Opaque;

                self.visit_local(
                    location.base,
                    PlaceContext::Read(PlaceReadContext::Load),
                    env,
                )
            }
        }
    }
}
