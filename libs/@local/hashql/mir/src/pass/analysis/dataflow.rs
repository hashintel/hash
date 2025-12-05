use std::alloc::{Allocator, Global};

use hashql_core::{
    graph::{LinkedGraph, NodeId},
    id::Id,
    intern::Interned,
    symbol::Symbol,
};

use crate::{
    body::{
        Body,
        local::Local,
        location::Location,
        operand::Operand,
        place::{FieldIndex, Place, PlaceContext, Projection},
        rvalue::{Aggregate, AggregateKind, Apply, ArgIndex, Binary, RValue, Unary},
        statement::Assign,
    },
    context::MirContext,
    pass::Pass,
    visit::Visitor,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Slot<'heap> {
    Index(FieldIndex),
    Field(Symbol<'heap>),
    ClosurePtr,
    ClosureEnv,
    ApplyPtr,
    ApplyArg(ArgIndex),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct Edge<'heap> {
    slot: Option<Slot<'heap>>,
    projections: Interned<'heap, [Projection<'heap>]>,
}

pub struct DataflowAnalysis<'heap, A: Allocator = Global> {
    graph: LinkedGraph<Local, Edge<'heap>, A>,
}

impl<'heap, A: Allocator> DataflowAnalysis<'heap, A> {
    pub fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            graph: LinkedGraph::new_in(alloc),
        }
    }

    pub fn new_with(mut graph: LinkedGraph<Local, Edge<'heap>, A>) -> Self {
        graph.clear();

        Self { graph }
    }
}

impl<'heap> DataflowAnalysis<'heap> {
    pub fn new() -> Self {
        Self::new_in(Global)
    }
}

impl<'env, 'heap, A: Allocator> Pass<'env, 'heap> for DataflowAnalysis<'heap, A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        self.graph.derive(&body.local_decls, |id, _| id);

        let Ok(()) = DataflowAnalysisVisitor {
            analysis: self,
            context,
        }
        .visit_body(body);
    }
}

struct DataflowAnalysisVisitor<'pass, 'env, 'heap, A: Allocator> {
    analysis: &'pass mut DataflowAnalysis<'heap, A>,
    context: &'pass mut MirContext<'env, 'heap>,
}

impl<'pass, 'env, 'heap, A: Allocator> DataflowAnalysisVisitor<'pass, 'env, 'heap, A> {
    fn collect(
        &mut self,
        location: Location,
        source: Local,
        slot: Option<Slot<'heap>>,

        operand: &Operand<'heap>,
    ) {
        Ok(()) = DataflowAnalysisCollectVisitor {
            analysis: self.analysis,
            context: self.context,
            source,
            slot,
        }
        .visit_operand(location, operand);
    }
}

impl<'heap, A: Allocator> Visitor<'heap> for DataflowAnalysisVisitor<'_, '_, 'heap, A> {
    type Result = Result<(), !>;

    fn visit_statement_assign(
        &mut self,
        location: Location,
        Assign { lhs, rhs }: &Assign<'heap>,
    ) -> Self::Result {
        let source = lhs.local;
        assert!(
            lhs.projections.is_empty(),
            "dataflow analysis may only work while in SSA form"
        );

        #[expect(clippy::match_same_arms, reason = "intention")]
        match rhs {
            RValue::Load(operand) => {
                self.collect(location, source, None, operand);
            }
            RValue::Binary(Binary { op: _, left, right }) => {
                self.collect(location, source, None, left);
                self.collect(location, source, None, right);
            }
            RValue::Unary(Unary { op: _, operand }) => {
                self.collect(location, source, None, operand);
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Tuple,
                operands,
            }) => {
                for (index, operand) in operands.iter_enumerated() {
                    self.collect(location, source, Some(Slot::Index(index)), operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Struct { fields },
                operands,
            }) => {
                debug_assert_eq!(fields.len(), operands.len());

                for (&field, operand) in fields.iter().zip(operands.iter()) {
                    self.collect(location, source, Some(Slot::Field(field)), operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::List,
                operands,
            }) => {
                // list and dict do not have accurate position by design
                for operand in operands.iter() {
                    self.collect(location, source, None, operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Dict,
                operands,
            }) => {
                for operand in operands.iter() {
                    self.collect(location, source, None, operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Opaque(_),
                operands,
            }) => {
                for operand in operands.iter() {
                    self.collect(location, source, None, operand);
                }
            }
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Closure,
                operands,
            }) => {
                debug_assert_eq!(operands.len(), 2);
                let ptr = &operands[FieldIndex::new(0)];
                let env = &operands[FieldIndex::new(1)];

                self.collect(location, source, Some(Slot::ClosurePtr), ptr);
                self.collect(location, source, Some(Slot::ClosureEnv), env);
            }
            RValue::Input(_) => {
                // input has no dependencies
            }
            RValue::Apply(Apply {
                function,
                arguments,
            }) => {
                self.collect(location, source, Some(Slot::ApplyPtr), function);

                for (index, argument) in arguments.iter_enumerated() {
                    self.collect(location, source, Some(Slot::ApplyArg(index)), argument);
                }
            }
        }

        Ok(())
    }
}

struct DataflowAnalysisCollectVisitor<'pass, 'env, 'heap, A: Allocator> {
    analysis: &'pass mut DataflowAnalysis<'heap, A>,
    context: &'pass mut MirContext<'env, 'heap>,

    source: Local,
    slot: Option<Slot<'heap>>,
}

impl<'heap, A: Allocator> Visitor<'heap> for DataflowAnalysisCollectVisitor<'_, '_, 'heap, A> {
    type Result = Result<(), !>;

    fn visit_place(
        &mut self,
        _: Location,
        _: PlaceContext,
        &Place { local, projections }: &Place<'heap>,
    ) -> Self::Result {
        self.analysis.graph.add_edge(
            NodeId::from_usize(self.source.as_usize()),
            NodeId::from_usize(local.as_usize()),
            Edge {
                slot: self.slot,
                projections,
            },
        );

        Ok(())
    }
}
