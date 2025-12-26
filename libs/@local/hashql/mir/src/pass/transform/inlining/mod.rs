#![expect(clippy::float_arithmetic)]
use alloc::collections::BinaryHeap;
use core::{alloc::Allocator, cmp, mem};

use hashql_core::{
    graph::algorithms::{
        Tarjan,
        tarjan::{SccId, StronglyConnectedComponents},
    },
    heap::{BumpAllocator, Heap, TransferInto},
    id::{Id, IdSlice},
    span::SpanId,
};

use self::{
    cost::{
        BodyProperties, CostEstimationAnalysis, CostEstimationConfig, CostEstimationResidual,
        LoopVec,
    },
    rename::RenameVisitor,
    score::{CallScorer, ScoreConfig},
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        local::{Local, LocalDecl},
        location::Location,
        operand::Operand,
        place::Place,
        rvalue::RValue,
        statement::{Assign, Statement, StatementKind},
        terminator::{Goto, Target, Terminator, TerminatorKind},
    },
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    intern::Interner,
    pass::analysis::{CallGraph, CallSite},
    visit::VisitorMut as _,
};

mod cost;
mod rename;
mod score;

struct Candidate {
    score: f32,
    callsite: CallSite<Location>,
}

impl PartialEq for Candidate {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == cmp::Ordering::Equal
    }
}

impl Eq for Candidate {}

impl PartialOrd for Candidate {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Candidate {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        let Self { score, callsite: _ } = self;

        score.total_cmp(&other.score).reverse()
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
struct InlineConfig {
    pub cost: CostEstimationConfig,
    pub score: ScoreConfig,
    pub budget_multiplier: f32,
}

impl InlineConfig {
    const DEFAULT: Self = Self {
        cost: CostEstimationConfig::DEFAULT,
        score: ScoreConfig::DEFAULT,
        budget_multiplier: 5.0,
    };
}

struct InlineState<'env, 'heap, A: Allocator> {
    config: InlineConfig,
    interner: &'env Interner<'heap>,

    graph: CallGraph<'heap, A>,
    properties: DefIdVec<BodyProperties, A>,
    loops: LoopVec<A>,
    components: StronglyConnectedComponents<DefId, SccId, (), A>,
}

impl<'heap, A: Allocator> InlineState<'_, 'heap, A> {
    fn select_callsites<S: Allocator + Clone>(
        &self,
        body: DefId,
        scratch: S,
    ) -> Vec<CallSite<Location>, S> {
        let component = self.components.scc(body);
        let scorer = CallScorer {
            config: self.config.score,
            graph: &self.graph,
            loops: &self.loops,
            properties: &self.properties,
        };

        let mut to_be_inlined = Vec::new_in(scratch.clone());
        let mut candidates = BinaryHeap::new_in(scratch.clone());

        for callsite in self.graph.apply_callsites(body) {
            if self.components.scc(callsite.target) == component {
                // We cannot inline calls to the same SCC, aka functions that are inside of a
                // recursive chain.
                continue;
            }

            let score = scorer.score(callsite);
            if score.is_sign_negative() {
                // The cost is negative, which means that the call site is not a candidate for
                // inlining.
                continue;
            }

            if score.is_infinite() {
                // The cost infinite, which means that the call site is *always* inlined, without
                // contributing to the overall cost of the caller.
                to_be_inlined.push(callsite);
                continue;
            }

            candidates.push(Candidate { score, callsite });
        }

        let mut remaining_budget = self.config.score.max * self.config.budget_multiplier;

        for candidate in candidates.into_iter_sorted() {
            let target_cost = self.properties[candidate.callsite.target].cost;

            if remaining_budget >= target_cost {
                remaining_budget -= target_cost;
                to_be_inlined.push(candidate.callsite);
            }
        }

        // sort the candidates by location (in reverse order), the reason we do this is so that
        // inlining doesn't disturb the location of subsequent candidates
        to_be_inlined.sort_unstable_by(|lhs, rhs| lhs.kind.cmp(&rhs.kind).reverse());

        to_be_inlined
    }

    fn inline_callsite(
        &self,
        bodies: &mut IdSlice<DefId, Body<'heap>>,

        CallSite {
            caller,
            kind: location,
            target,
        }: CallSite<Location>,
    ) {
        let Ok([source, target]) = bodies.get_disjoint_mut([caller, target]) else {
            unreachable!("`inlinable_callsites` should have filtered out self-calls")
        };
        let target = &*target; // We take an explicit `&` here, downgrading the reference, to make sure that we don't modify the target body.

        let bb_offset = source.basic_blocks.len();
        let local_offset = source.local_decls.len();

        // We now need to rewire the basic block, we do this by first assigning the arguments,
        // assigning their value, and then splitting the block.
        let block = &mut source.basic_blocks.as_mut()[location.block];

        debug_assert!(target.basic_blocks[BasicBlockId::START].params.is_empty());
        // Must always be empty, otherwise we wouldn't have a valid function entrypoint.
        let terminator = mem::replace(
            &mut block.terminator,
            Terminator {
                span: SpanId::SYNTHETIC,
                kind: TerminatorKind::Goto(Goto {
                    target: Target::block(BasicBlockId::START.plus(bb_offset), self.interner),
                }),
            },
        );
        let after = block.statements.split_off(location.statement_index);
        let callsite = block.statements.pop().unwrap_or_else(|| unreachable!());

        block.terminator.span = callsite.span;

        let StatementKind::Assign(Assign {
            lhs,
            rhs: RValue::Apply(apply),
        }) = callsite.kind
        else {
            unreachable!("`inlinable_callsites` should only point to apply statements")
        };

        // For all arguments, add assignment expressions before the goto
        debug_assert_eq!(apply.arguments.len(), target.args);
        for (index, arg) in apply.arguments.into_iter().enumerate() {
            block.statements.push(Statement {
                span: callsite.span,
                kind: StatementKind::Assign(Assign {
                    lhs: Place::local(Local::new(local_offset + index), self.interner),
                    rhs: RValue::Load(arg),
                }),
            });
        }

        // if lhs is an argument, we must create a new local, and use that instead
        let result = if lhs.projections.is_empty() {
            lhs.local
        } else {
            let type_id = lhs.type_id(&source.local_decls);
            let local = source.local_decls.push(LocalDecl {
                span: callsite.span,
                r#type: type_id,
                name: None,
            });

            // Create the new assignment statement
            block.statements.push(Statement {
                span: callsite.span,
                kind: StatementKind::Assign(Assign {
                    lhs: Place::local(local, self.interner),
                    rhs: RValue::Load(Operand::Place(lhs)),
                }),
            });

            local
        };

        self.patch_callsite(source, target, result, after, terminator);
    }

    fn patch_callsite(
        &self,
        source: &mut Body<'heap>,
        callee: &Body<'heap>,

        result: Local,
        statements: Vec<Statement<'heap>, &'heap Heap>,
        terminator: Terminator<'heap>,
    ) {
        // We now create new block, which has a block param for the new local, the terminator is
        // the terminator of the original block
        let continution = source.basic_blocks.as_mut().push(BasicBlock {
            params: self.interner.locals.intern_slice(&[result]),
            statements,
            terminator,
        });

        let bb_offset = source.basic_blocks.bound();
        let local_offset = source.local_decls.len();

        source
            .basic_blocks
            .as_mut()
            .extend(callee.basic_blocks.iter().cloned());

        source
            .local_decls
            .extend(callee.local_decls.iter().copied());

        let mut visitor = RenameVisitor {
            local_offset,
            bb_offset: bb_offset.as_usize(),
            continution,
            interner: self.interner,
        };

        for (index, block) in source.basic_blocks.as_mut()[bb_offset..]
            .iter_mut()
            .enumerate()
        {
            visitor.visit_basic_block(bb_offset.plus(index), block);
        }
    }

    fn inline_body<S: Allocator + Clone>(
        &self,
        bodies: &mut DefIdSlice<Body<'heap>>,
        body: DefId,
        scratch: S,
    ) {
        // TODO: global overarching scratch space for BinaryHeap and Vec (sadly needs to be done
        // because we don't have checkpointing yet)
        let targets = self.select_callsites(body, scratch);

        // targets already come pre-ordered, so we can just iterate over them
        // they're ordered in reverse
        for callsite in targets {
            self.inline_callsite(bodies, callsite);
        }
    }
}

struct Inliner<A: Allocator> {
    alloc: A,

    config: InlineConfig,
}

impl<A: Allocator> Inliner<A> {
    fn state<'env, 'heap, B: Allocator + Clone>(
        &self,
        interner: &'env Interner<'heap>,
        bodies: &DefIdSlice<Body<'heap>>,
        alloc: B,
    ) -> InlineState<'env, 'heap, B> {
        let graph = CallGraph::analyze_in(bodies, alloc.clone());
        let mut analysis =
            CostEstimationAnalysis::new(&graph, bodies, self.config.cost, alloc.clone());

        for body in bodies {
            analysis.analyze(body);
        }

        let costs = analysis.finish();

        let tarjan = Tarjan::new_in(&graph, alloc.clone());
        let components = tarjan.run();

        InlineState {
            config: self.config,
            interner,
            graph,
            properties: costs.properties,
            loops: costs.loops,
            components,
        }
    }

    #[expect(unsafe_code)]
    pub fn inline<'heap>(
        &mut self,
        context: &MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) where
        A: BumpAllocator,
    {
        let state = self.state(context.interner, bodies, &self.alloc);

        // There are fundamentally two phases, the first is to just normally inline, the
        // second then does "aggressive" inlining, in which we inline any
        // callsite that is eligible until fix-point is reached.
        for id in bodies.ids() {
            let checkpoint = self.alloc.checkpoint();

            InlineState::inline_body(&state, bodies, id, &self.alloc);

            // SAFETY: `state` is used only with `&self`. It only has access to the allocator
            // through `self.alloc`, and due to the `&self` reference is unable to reallocate the
            // memory it uses.
            // Therefore, it is safe to assume that no allocation outside outlives
            // `InlineState::inline_body` for anything that's made inside of it.
            unsafe {
                self.alloc.rollback(checkpoint);
            }
        }

        // TODO: Implement aggressive inlining
    }
}
