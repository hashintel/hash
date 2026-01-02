//! Cost estimation and body analysis for the inline pass.
//!
//! This module computes properties of each function body that inform inlining decisions:
//! - **Cost**: A scalar approximating MIR size/complexity, used by heuristics.
//! - **Directive**: Whether the function should always/never be inlined or use heuristics.
//! - **Loop blocks**: Which basic blocks are inside loops (for callsite scoring).
//!
//! # Cost Model
//!
//! The cost model converts MIR into a single scalar value per function body. Higher costs
//! make functions less likely to be inlined. The cost is computed by summing weighted
//! contributions from:
//!
//! - Each basic block (control flow overhead)
//! - Each rvalue (computation complexity)
//! - Each terminator (control flow and I/O operations)
//!
//! # Example Costs
//!
//! With default weights:
//! - Simple helper (1 block, 2 loads, 1 binary, 1 return): ~6
//! - Medium function (3 blocks, 5 loads, 2 aggregates, 1 graph read): ~21
//! - Complex filter (5 blocks, 10 loads, 3 switches, 2 applies): ~29

use core::{alloc::Allocator, f32};

use hashql_core::{
    graph::{
        Successors as _,
        algorithms::{
            Tarjan,
            tarjan::{Metadata, SccId},
        },
    },
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
    def::{DefIdSlice, DefIdVec},
    pass::analysis::CallGraph,
    visit::{self, Visitor},
};

/// Controls whether a function should be inlined and how.
///
/// The directive is determined by the function's [`Source`]:
/// - [`Source::Ctor`] → [`Always`](Self::Always): Constructors are always inlined.
/// - [`Source::Closure`] / [`Source::Thunk`] → [`Heuristic`](Self::Heuristic): Use scoring.
/// - [`Source::Intrinsic`] → [`Never`](Self::Never): Intrinsics cannot be inlined.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(super) enum InlineDirective {
    /// Always inline this function regardless of cost or budget.
    ///
    /// Used for constructors which are typically trivial and benefit from inlining.
    Always,
    /// Use heuristic scoring to decide whether to inline.
    ///
    /// The score considers cost, bonuses (loop, leaf, single caller), and budget.
    Heuristic,
    /// Never inline this function.
    ///
    /// Used for intrinsics which cannot be meaningfully inlined.
    Never,
}

/// Properties of a function body relevant to inlining decisions.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct BodyProperties {
    /// How this function should be treated for inlining.
    pub directive: InlineDirective,
    /// Estimated cost/complexity of the function body.
    ///
    /// This value is updated during inlining: when a callee is inlined into a caller,
    /// the caller's cost increases by the callee's cost (minus the `Apply` cost).
    pub cost: f32,
    /// Whether this function has no outgoing calls (except to intrinsics).
    ///
    /// Leaf functions receive a bonus during scoring because inlining them doesn't
    /// trigger further inlining cascades.
    pub is_leaf: bool,
}

/// Maps each function to its set of basic blocks that are inside loops.
///
/// Used during scoring to detect callsites in loops, which receive bonus points
/// since inlining hot code is more beneficial.
pub(super) type BasicBlockLoopVec<A> = DefIdVec<Option<DenseBitSet<BasicBlockId>>, A>;

/// Tarjan metadata that counts members in each SCC.
///
/// Used to detect loops: an SCC with >1 member, or a single node with a self-edge,
/// indicates a loop.
struct MemberCount;

impl<N, S> Metadata<N, S> for MemberCount {
    type Annotation = u32;

    fn annotate_node(&mut self, _: N) -> Self::Annotation {
        1
    }

    fn annotate_scc(&mut self, _: S, _: N) -> Self::Annotation {
        0
    }

    fn merge_into_scc(&mut self, lhs: &mut Self::Annotation, other: Self::Annotation) {
        *lhs += other;
    }

    fn merge_reachable(&mut self, _: &mut Self::Annotation, _: &Self::Annotation) {}
}

/// Configuration for cost estimation weights.
///
/// Each field specifies the cost contribution for a particular MIR construct.
/// Higher weights make functions containing those constructs less likely to be inlined.
///
/// # Design Principles
///
/// - **Cheap operations** (`load`, `goto`, `return`): Low weights (~1.0) since they add minimal
///   complexity.
/// - **Computation** (`binary`, `unary`, `aggregate`): Moderate weights (2.0-3.0) reflecting actual
///   work performed.
/// - **External effects** (`input`, `graph_read`): High weights (5.0-7.0) because these represent
///   expensive I/O operations that shouldn't be duplicated carelessly.
/// - **Calls** (`apply`): Moderate-high weight (4.0) since each call is a potential inline site
///   itself.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct InlineCostEstimationConfig {
    /// Cost of loading a value from a place.
    pub rvalue_load: f32,
    /// Cost of a binary operation (+, -, *, /, etc).
    pub rvalue_binary: f32,
    /// Cost of a unary operation (!, -).
    pub rvalue_unary: f32,
    /// Cost of constructing an aggregate (tuple, struct).
    pub rvalue_aggregate: f32,
    /// Cost of accessing function input parameters.
    pub rvalue_input: f32,
    /// Cost of a function application (call).
    pub rvalue_apply: f32,

    /// Base cost of a `SwitchInt` terminator.
    pub terminator_switch_int_base: f32,
    /// Additional cost per branch in a `SwitchInt`.
    ///
    /// Total switch cost = `base + multiplier × num_targets`.
    pub terminator_switch_int_branch_multiplier: f32,
    /// Cost of a graph database read operation.
    ///
    /// Set high (7.0) because graph reads are expensive I/O operations.
    pub terminator_graph_read: f32,
    /// Cost of an unconditional jump.
    pub terminator_goto: f32,
    /// Cost of a function return.
    pub terminator_return: f32,
    /// Cost of unreachable code (dead code, no runtime cost).
    pub terminator_unreachable: f32,

    /// Base cost per basic block (control flow overhead).
    pub basic_block: f32,
}

impl Default for InlineCostEstimationConfig {
    fn default() -> Self {
        Self {
            rvalue_load: 1.0,
            rvalue_binary: 2.0,
            rvalue_unary: 2.0,
            rvalue_aggregate: 3.0,
            rvalue_input: 5.0,
            rvalue_apply: 4.0,

            terminator_switch_int_base: 1.0,
            terminator_switch_int_branch_multiplier: 0.5,
            terminator_graph_read: 7.0,
            terminator_goto: 1.0,
            terminator_return: 1.0,
            terminator_unreachable: 0.0,

            basic_block: 1.0,
        }
    }
}

/// Results from body analysis, consumed by the inline pass.
pub(crate) struct CostEstimationResidual<A: Allocator> {
    /// Properties for each function body.
    pub properties: DefIdVec<BodyProperties, A>,
    /// For each function, which basic blocks are inside loops.
    pub loops: BasicBlockLoopVec<A>,
}

/// Analyzes all function bodies to compute inlining-relevant properties.
///
/// For each body, computes:
/// - [`InlineDirective`] based on the function's source.
/// - Cost using [`InlineCostEstimationConfig`] weights.
/// - Which basic blocks are inside loops (for callsite scoring).
/// - Whether the function is a leaf (no outgoing calls).
pub(crate) struct BodyAnalysis<'ctx, 'heap, A: Allocator> {
    alloc: A,
    config: InlineCostEstimationConfig,

    properties: DefIdVec<BodyProperties, A>,
    loops: BasicBlockLoopVec<A>,
    graph: &'ctx CallGraph<'heap, A>,
}

impl<'ctx, 'heap, A: Allocator> BodyAnalysis<'ctx, 'heap, A> {
    pub(crate) fn new(
        graph: &'ctx CallGraph<'heap, A>,
        bodies: &'ctx DefIdSlice<Body<'heap>>,
        config: InlineCostEstimationConfig,

        alloc: A,
    ) -> Self
    where
        A: Clone,
    {
        let properties = DefIdVec::from_domain_in(
            BodyProperties {
                directive: InlineDirective::Heuristic,
                cost: 0.0,
                is_leaf: true,
            },
            bodies,
            alloc.clone(),
        );
        let loops = IdVec::new_in(alloc.clone());

        Self {
            alloc,
            config,
            properties,
            loops,
            graph,
        }
    }

    pub(crate) fn finish(self) -> CostEstimationResidual<A> {
        CostEstimationResidual {
            properties: self.properties,
            loops: self.loops,
        }
    }

    /// Analyze a single function body.
    ///
    /// Computes:
    /// 1. The inline directive based on [`Body::source`].
    /// 2. Loop detection using Tarjan's algorithm on the CFG.
    /// 3. Cost by visiting all rvalues and terminators.
    pub(crate) fn run(&mut self, body: &Body<'heap>) {
        let inline = match body.source {
            Source::Ctor(_) => InlineDirective::Always,
            Source::Closure(_, _) | Source::Thunk(_, _) => InlineDirective::Heuristic,
            Source::Intrinsic(_) => InlineDirective::Never,
        };

        // Detect loops using SCC analysis on the CFG.
        // A block is in a loop if its SCC has >1 member or it has a self-edge.
        let tarjan: Tarjan<_, _, SccId, _, _> =
            Tarjan::new_with_metadata_in(&body.basic_blocks, MemberCount, &self.alloc);
        let scc = tarjan.run();

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

        let mut visitor = CostEstimationVisitor {
            config: self.config,
            total: 0.0,
        };
        visitor.visit_body(body);

        self.properties[body.id] = BodyProperties {
            directive: inline,
            cost: visitor.total,
            is_leaf: self.graph.is_leaf(body.id),
        };

        if let Some(bitset) = bitset {
            self.loops.insert(body.id, bitset);
        }
    }
}

/// Visitor that sums up cost contributions from all MIR constructs.
struct CostEstimationVisitor {
    config: InlineCostEstimationConfig,
    total: f32,
}

#[expect(clippy::cast_precision_loss)]
impl<'heap> Visitor<'heap> for CostEstimationVisitor {
    type Result = Result<(), !>;

    fn visit_rvalue(&mut self, _: Location, rvalue: &RValue<'heap>) -> Self::Result {
        let cost = match rvalue {
            RValue::Load(_) => self.config.rvalue_load,
            RValue::Binary(_) => self.config.rvalue_binary,
            RValue::Unary(_) => self.config.rvalue_unary,
            RValue::Aggregate(_) => self.config.rvalue_aggregate,
            RValue::Input(_) => self.config.rvalue_input,
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
