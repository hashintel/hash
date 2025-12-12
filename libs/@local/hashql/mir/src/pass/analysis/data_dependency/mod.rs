//! Data dependency analysis for MIR.
//!
//! This module provides [`DataDependencyAnalysis`], a pass that constructs a graph representing
//! structural data dependencies between locals in the MIR. The resulting [`DataDependencyGraph`]
//! can be used to trace which locals a given place ultimately depends on via projections.
//!
//! # Graph Structure
//!
//! The dependency graph uses locals as nodes and tracks structural dependencies as directed edges.
//! An edge from local `A` to local `B` means "A structurally depends on B" (i.e., A was
//! constructed from B in a way that can be resolved through field projections).
//!
//! For example, given the statement `_3 = (_1.field, _2)`:
//! - An edge `_3 → _1` is created with kind [`EdgeKind::Index(0)`] and the `.field` projection
//! - An edge `_3 → _2` is created with kind [`EdgeKind::Index(1)`]
//!
//! # Field Sensitivity
//!
//! The analysis is field-sensitive for structured types. When a tuple or struct is constructed,
//! each component is tracked separately via [`EdgeKind`] annotations on edges. This enables
//! [`DataDependencyGraph::resolve`] to trace through projections and find the original source
//! of a specific field access.
//!
//! # Structural vs Non-Structural Dependencies
//!
//! Only *structural* dependencies are tracked — those that can be resolved through via
//! projections (tuples, structs, closures, loads). Non-structural dependencies (binary
//! operations, function calls, etc.) are not tracked since they cannot be projected into.
//! Use dataflow analysis or inspect the [`RValue`] directly for those cases.
//!
//! # Requirements
//!
//! This analysis requires the MIR to be in SSA form. Assignments must target locals directly
//! without projections (i.e., `_1 = ...` is valid, but `_1.field = ...` is not).
//!
//! [`EdgeKind::Index(0)`]: graph::EdgeKind::Index
//! [`EdgeKind::Index(1)`]: graph::EdgeKind::Index
mod graph;
mod resolve;
#[cfg(test)]
mod tests;

use alloc::alloc::Global;
use core::alloc::Allocator;

use hashql_core::{
    graph::{LinkedGraph, NodeId},
    id::Id as _,
};

use self::graph::{ConstantBindings, EdgeData, EdgeKind};
pub use self::graph::{DataDependencyGraph, TransientDataDependencyGraph};
use crate::{
    body::{
        Body,
        local::Local,
        location::Location,
        operand::Operand,
        place::{FieldIndex, Place},
        rvalue::{Aggregate, AggregateKind, RValue},
        statement::Assign,
        terminator::Target,
    },
    context::MirContext,
    pass::AnalysisPass,
    visit::Visitor,
};

/// A MIR pass that builds a [`DataDependencyGraph`].
///
/// This pass traverses the MIR body and records data dependencies between locals. After running,
/// call [`finish`](Self::finish) to obtain the resulting [`DataDependencyGraph`].

pub struct DataDependencyAnalysis<'heap, A: Allocator = Global> {
    alloc: A,
    graph: LinkedGraph<Local, EdgeData<'heap>, A>,
    constant_bindings: ConstantBindings<'heap, A>,
}

impl<'heap, A: Allocator> DataDependencyAnalysis<'heap, A> {
    /// Creates a new analysis pass using the specified allocator.
    pub fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            alloc: alloc.clone(),
            graph: LinkedGraph::new_in(alloc.clone()),
            constant_bindings: ConstantBindings::empty_in(alloc),
        }
    }

    /// Completes the analysis and returns the constructed dependency graph.
    pub fn finish(self) -> DataDependencyGraph<'heap, A> {
        DataDependencyGraph::new(self.alloc, self.graph, self.constant_bindings)
    }
}

impl DataDependencyAnalysis<'_> {
    /// Creates a new analysis pass using the global allocator.
    #[must_use]
    pub fn new() -> Self {
        Self::new_in(Global)
    }
}

impl Default for DataDependencyAnalysis<'_> {
    fn default() -> Self {
        Self::new()
    }
}

impl<'env, 'heap, A: Allocator + Clone> AnalysisPass<'env, 'heap>
    for DataDependencyAnalysis<'heap, A>
{
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &Body<'heap>) {
        let mut graph = LinkedGraph::new_in(self.alloc.clone());
        let mut constant_bindings =
            ConstantBindings::from_domain_in(&body.local_decls, self.alloc.clone());

        graph.derive(&body.local_decls, |id, _| id);

        let Ok(()) = DataDependencyAnalysisVisitor {
            graph: &mut graph,
            constant_bindings: &mut constant_bindings,
            context,
            body,
        }
        .visit_body(body);

        self.graph = graph;
        self.constant_bindings = constant_bindings;
    }
}

/// Visitor that collects data dependencies during MIR traversal.
struct DataDependencyAnalysisVisitor<'pass, 'env, 'heap, A: Allocator> {
    graph: &'pass mut LinkedGraph<Local, EdgeData<'heap>, A>,
    constant_bindings: &'pass mut ConstantBindings<'heap, A>,
    #[expect(dead_code, reason = "will be used in future")]
    context: &'pass mut MirContext<'env, 'heap>,
    body: &'pass Body<'heap>,
}

impl<'heap, A: Allocator> DataDependencyAnalysisVisitor<'_, '_, 'heap, A> {
    /// Records a structural dependency edge from `source` to the local in `place`.
    fn collect_place(
        &mut self,
        source: Local,
        kind: EdgeKind<'heap>,
        &Place { local, projections }: &Place<'heap>,
    ) {
        self.graph.add_edge(
            NodeId::from_usize(source.as_usize()),
            NodeId::from_usize(local.as_usize()),
            EdgeData { kind, projections },
        );
    }

    /// Records a structural dependency from `source` to the operand.
    ///
    /// For places, creates an edge in the graph.
    /// For constants, records a constant binding for later resolution.
    fn collect_operand(&mut self, source: Local, kind: EdgeKind<'heap>, operand: &Operand<'heap>) {
        match operand {
            Operand::Place(place) => self.collect_place(source, kind, place),
            &Operand::Constant(constant) => {
                self.constant_bindings.insert(source, kind, constant);
            }
        }
    }
}

impl<'heap, A: Allocator> Visitor<'heap> for DataDependencyAnalysisVisitor<'_, '_, 'heap, A> {
    type Result = Result<(), !>;

    fn visit_target(
        &mut self,
        _: Location,
        &Target { block, args }: &Target<'heap>,
    ) -> Self::Result {
        let params = self.body.basic_blocks[block].params;
        debug_assert_eq!(params.len(), args.len());

        for (&param, arg) in params.iter().zip(args.iter()) {
            self.collect_operand(param, EdgeKind::Param, arg);
        }

        Ok(())
    }

    fn visit_statement_assign(
        &mut self,
        _: Location,
        Assign { lhs, rhs }: &Assign<'heap>,
    ) -> Self::Result {
        let source = lhs.local;
        assert!(
            lhs.projections.is_empty(),
            "dataflow analysis requires SSA form: assignment to {:?} has projections",
            lhs.local
        );

        match rhs {
            RValue::Load(operand) => {
                self.collect_operand(source, EdgeKind::Load, operand);
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Tuple,
                operands,
            }) => {
                for (index, operand) in operands.iter_enumerated() {
                    self.collect_operand(source, EdgeKind::Index(index), operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Struct { fields },
                operands,
            }) => {
                debug_assert_eq!(fields.len(), operands.len());

                for (&field, (index, operand)) in fields.iter().zip(operands.iter_enumerated()) {
                    self.collect_operand(source, EdgeKind::Field(index, field), operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Closure,
                operands,
            }) => {
                debug_assert_eq!(operands.len(), 2);
                let ptr = &operands[FieldIndex::new(0)];
                let env = &operands[FieldIndex::new(1)];

                self.collect_operand(source, EdgeKind::ClosurePtr, ptr);
                self.collect_operand(source, EdgeKind::ClosureEnv, env);
            }
            // Non-structural: no edges created, dependencies handled via dataflow/RValue inspection
            RValue::Binary(_)
            | RValue::Unary(_)
            | RValue::Apply(_)
            | RValue::Input(_)
            | RValue::Aggregate(Aggregate {
                kind: AggregateKind::List | AggregateKind::Dict | AggregateKind::Opaque(_),
                ..
            }) => {}
        }

        Ok(())
    }
}
