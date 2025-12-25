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

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct CostEstimationConfig {
    pub rvalue_load: f32,
    pub rvalue_binary: f32,
    pub rvalue_unary: f32,
    pub rvalue_aggregate: f32,
    pub rvalue_input: f32,
    pub rvalue_apply: f32,

    pub terminator_switch_int_base: f32,
    pub terminator_switch_int_branch_multiplier: f32,
    pub terminator_graph_read: f32,
    pub terminator_goto: f32,
    pub terminator_return: f32,
    pub terminator_unreachable: f32,

    pub basic_block: f32,
}

impl CostEstimationConfig {
    pub const DEFAULT: Self = Self {
        rvalue_load: 1.0,
        rvalue_binary: 2.0,
        rvalue_unary: 2.0,
        rvalue_aggregate: 3.0,
        rvalue_input: 5.0,
        rvalue_apply: 4.0,

        terminator_switch_int_base: 1.0,
        terminator_switch_int_branch_multiplier: 0.5,
        terminator_graph_read: 5.0,
        terminator_goto: 1.0,
        terminator_return: 1.0,
        terminator_unreachable: 0.0,

        basic_block: 1.0,
    };
}

struct CostEstimationAnalysis<'ctx, 'heap, A: Allocator, S: BumpAllocator> {
    scratch: S,
    config: CostEstimationConfig,

    properties: DefIdVec<BodyProperties, A>,
    loops: LoopVec<A>,
    graph: &'ctx CallGraph<'heap, A>,
}

impl<'ctx, 'heap, A: Allocator, B: BumpAllocator> CostEstimationAnalysis<'ctx, 'heap, A, B> {
    fn new(
        graph: &'ctx CallGraph<'heap, A>,
        bodies: &'ctx DefIdSlice<Body<'heap>>,
        config: CostEstimationConfig,

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

        Self {
            scratch,
            config,
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
        let mut visitor = CostEstimationVisitor {
            config: self.config,
            total: 0.0,
        };
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
    config: CostEstimationConfig,
    total: f32,
}

#[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
impl<'heap> Visitor<'heap> for CostEstimationVisitor {
    type Result = Result<(), !>;

    fn visit_rvalue(&mut self, _: Location, rvalue: &RValue<'heap>) -> Self::Result {
        let cost = match rvalue {
            RValue::Load(_) => self.config.rvalue_load,
            RValue::Binary(_) => self.config.rvalue_binary,
            RValue::Unary(_) => self.config.rvalue_unary,
            RValue::Aggregate(_) => self.config.rvalue_aggregate,
            // We try to get something from the environment, as this needs to communicate with the
            // runtime it's most expensive.
            RValue::Input(_) => self.config.rvalue_input,
            // Nested calls are most expensive and therefore
            RValue::Apply(_) => self.config.rvalue_apply,
        };

        self.total += cost;
        Ok(())
    }

    fn visit_terminator(&mut self, _: Location, terminator: &Terminator<'heap>) -> Self::Result {
        let cost = match &terminator.kind {
            TerminatorKind::SwitchInt(switch_int) => (switch_int.targets.targets().len() as f32)
                .mul_add(
                    self.config.terminator_switch_int_branch_multiplier,
                    self.config.terminator_switch_int_base,
                ),
            // Similar to RValue::Input, we try to get something from the environment, as this needs
            // to communicate with the runtime it's most expensive.
            TerminatorKind::GraphRead(_) => self.config.terminator_graph_read,
            TerminatorKind::Goto(_) => self.config.terminator_goto,
            TerminatorKind::Return(_) => self.config.terminator_return,
            TerminatorKind::Unreachable => self.config.terminator_unreachable,
        };

        self.total += cost;
        Ok(())
    }

    fn visit_basic_block(&mut self, id: BasicBlockId, block: &BasicBlock<'heap>) -> Self::Result {
        self.total += self.config.basic_block;

        visit::r#ref::walk_basic_block(self, id, block)
    }
}
