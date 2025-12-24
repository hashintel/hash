use core::{alloc::Allocator, f32};

use hashql_core::{
    graph::{
        Successors as _,
        algorithms::{
            Tarjan,
            tarjan::{Metadata, SccId},
        },
    },
    heap::BumpAllocator,
    id::{IdVec, bit_vec::DenseBitSet},
};

use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId},
        location::Location,
        rvalue::RValue,
        terminator::{Terminator, TerminatorKind},
    },
    context::MirContext,
    def::{DefIdSlice, DefIdVec},
    pass::{AnalysisPass, analysis::CallGraph},
    visit::{self, Visitor},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(super) enum Inline {
    Always,
    Depends,
    Never,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct BodyProperties {
    pub inline: Inline,
    pub cost: f32,

    pub is_leaf: bool, // has no outgoing edges, except for intrinsics
}

pub(super) type LoopVec<A> = DefIdVec<Option<DenseBitSet<BasicBlockId>>, A>;

struct MemberCount;

impl<N, S> Metadata<N, S> for MemberCount {
    type Annotation = u32;

    fn annotate_node(&mut self, _: N) -> Self::Annotation {
        1
    }

    fn merge_into_scc(&mut self, lhs: &mut Self::Annotation, other: Self::Annotation) {
        *lhs += other;
    }

    fn merge_reachable(&mut self, _: &mut Self::Annotation, _: &Self::Annotation) {}
}

struct CostEstimationAnalysis<'ctx, 'heap, A: Allocator, S: BumpAllocator> {
    scratch: S,

    properties: DefIdVec<BodyProperties, A>,
    loops: LoopVec<A>,
    graph: &'ctx CallGraph<'heap, A>,
}

impl<'ctx, 'heap, A: Allocator, B: BumpAllocator> CostEstimationAnalysis<'ctx, 'heap, A, B> {
    fn new(
        bodies: &'ctx DefIdSlice<Body<'heap>>,
        graph: &'ctx CallGraph<'heap, A>,
        alloc: A,
        scratch: B,
    ) -> Self
    where
        A: Clone,
    {
        let properties = DefIdVec::from_domain_in(
            BodyProperties {
                inline: Inline::Depends,
                cost: 0.0,
                is_leaf: true,
            },
            bodies,
            alloc.clone(),
        );
        let loops = IdVec::new_in(alloc);

        CostEstimationAnalysis {
            scratch,
            properties,
            loops,
            graph,
        }
    }
}

impl<'env, 'heap, A: Allocator, S: BumpAllocator> AnalysisPass<'env, 'heap>
    for CostEstimationAnalysis<'_, 'heap, A, S>
{
    fn run(&mut self, _: &mut MirContext<'env, 'heap>, body: &Body<'heap>) {
        self.scratch.reset();

        let inline = match body.source {
            Source::Ctor(_) => Inline::Always,
            Source::Closure(_, _) | Source::Thunk(_, _) => Inline::Depends,
            Source::Intrinsic(_) => Inline::Never,
        };

        let tarjan: Tarjan<_, _, SccId, _, _> =
            Tarjan::new_with_metadata_in(&body.basic_blocks, MemberCount, &self.scratch);
        let scc = tarjan.run();

        // First create the "is in loop" bitset, we must additionally check if there are no
        // self-loops for each
        let mut bitset = None;
        for id in body.basic_blocks.ids() {
            let component = scc.scc(id);

            if *scc.annotation(component) > 1
                || body.basic_blocks.successors(id).any(|succ| succ == id)
            {
                let bitset =
                    bitset.get_or_insert_with(|| DenseBitSet::new_empty(body.basic_blocks.len()));
                bitset.insert(id);
            }
        }

        // Evaluate the total cost of the body
        let mut visitor = CostEstimationVisitor { total: 0.0 };
        visitor.visit_body(body);

        self.properties[body.id] = BodyProperties {
            inline,
            cost: visitor.total,
            is_leaf: self.graph.is_leaf(body.id),
        };

        if let Some(bitset) = bitset {
            self.loops.insert(body.id, bitset);
        }
    }
}

struct CostEstimationVisitor {
    total: f32,
}

#[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
impl<'heap> Visitor<'heap> for CostEstimationVisitor {
    type Result = Result<(), !>;

    fn visit_rvalue(&mut self, _: Location, rvalue: &RValue<'heap>) -> Self::Result {
        let cost = match rvalue {
            RValue::Load(_) => 1.0,
            RValue::Binary(_) | RValue::Unary(_) => 2.0,
            RValue::Aggregate(_) => 3.0,
            // We try to get something from the environment, as this needs to communicate with the
            // runtime it's most expensive.
            RValue::Input(_) => 5.0,
            // Nested calls are most expensive and therefore
            RValue::Apply(_) => 4.0,
        };

        self.total += cost;
        Ok(())
    }

    fn visit_terminator(&mut self, _: Location, terminator: &Terminator<'heap>) -> Self::Result {
        let cost = match &terminator.kind {
            TerminatorKind::SwitchInt(switch_int) => {
                1.0 + (switch_int.targets.targets().len() as f32 / 2.0)
            }
            // Similar to RValue::Input, we try to get something from the environment, as this needs
            // to communicate with the runtime it's most expensive.
            TerminatorKind::GraphRead(_) => 5.0,
            TerminatorKind::Goto(_) | TerminatorKind::Return(_) | TerminatorKind::Unreachable => {
                1.0
            }
        };

        self.total += cost;
        Ok(())
    }

    fn visit_basic_block(&mut self, id: BasicBlockId, block: &BasicBlock<'heap>) -> Self::Result {
        self.total += 1.0;

        visit::r#ref::walk_basic_block(self, id, block)
    }
}
