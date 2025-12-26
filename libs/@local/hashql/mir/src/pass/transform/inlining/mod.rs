#![expect(clippy::float_arithmetic)]
use alloc::collections::BinaryHeap;
use core::{alloc::Allocator, cmp, mem};
use std::assert_matches::debug_assert_matches;

use hashql_core::{
    graph::algorithms::{
        Tarjan,
        tarjan::{SccId, StronglyConnectedComponents},
    },
    heap::BumpAllocator,
    id::Id,
    span::SpanId,
};

use self::{
    cost::{CostEstimationAnalysis, CostEstimationConfig, CostEstimationResidual},
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
    def::{DefId, DefIdSlice},
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

struct Inliner<A: Allocator, S: BumpAllocator> {
    alloc: A,
    scratch: S,

    config: InlineConfig,
}

impl<A: Allocator, S: BumpAllocator> Inliner<A, S> {
    fn global_analysis<'heap>(
        &self,
        bodies: &DefIdSlice<Body<'heap>>,
    ) -> (
        CallGraph<'heap, A>,
        CostEstimationResidual<A>,
        StronglyConnectedComponents<DefId, SccId, (), A>,
    )
    where
        A: Clone,
    {
        let callgraph = CallGraph::analyze_in(bodies, self.alloc.clone());
        let mut analysis = CostEstimationAnalysis::new(
            &callgraph,
            bodies,
            self.config.cost,
            self.alloc.clone(),
            self.alloc.clone(),
        );

        for body in bodies {
            analysis.analyze(body);
        }

        let costs = analysis.finish();

        let tarjan = Tarjan::new_in(&callgraph, self.alloc.clone());
        let sccs: StronglyConnectedComponents<DefId, SccId, (), A> = tarjan.run();

        (callgraph, costs, sccs)
    }

    fn select_callsites(
        &self,
        graph: &CallGraph<'_, A>,
        costs: &CostEstimationResidual<A>,
        sccs: &StronglyConnectedComponents<DefId, SccId, (), A>,

        body: DefId,
    ) -> Vec<CallSite<Location>, A>
    where
        A: Clone,
    {
        let component = sccs.scc(body);
        let scorer = CallScorer::new(self.config.score, graph, costs);

        let mut to_be_inlined = Vec::new_in(self.alloc.clone());
        let mut candidates = BinaryHeap::new_in(self.alloc.clone());

        for callsite in graph.apply_callsites(body) {
            if sccs.scc(callsite.target) == component {
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
        let chosen_candidates = candidates
            .into_iter_sorted()
            .take_while(|Candidate { score: _, callsite }| {
                let target_cost = costs.properties[callsite.target].cost;
                if remaining_budget - target_cost >= 0.0 {
                    remaining_budget -= target_cost;
                    return true;
                }

                false
            })
            .map(|Candidate { score: _, callsite }| callsite);
        to_be_inlined.extend(chosen_candidates);

        // sort the candidates by location (in reverse order), the reason we do this is so that
        // inlining doesn't disturb the location of subsequent candidates
        to_be_inlined.sort_unstable_by(|lhs, rhs| lhs.kind.cmp(&rhs.kind).reverse());

        to_be_inlined
    }

    fn inline_callsite<'heap>(
        interner: &Interner<'heap>,
        bodies: &mut hashql_core::id::IdSlice<DefId, Body<'heap>>,
        caller: DefId,
        location: Location,
        target: DefId,
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
                    target: Target::block(BasicBlockId::START.plus(bb_offset), interner),
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
                    lhs: Place::local(Local::new(local_offset + index), interner),
                    rhs: RValue::Load(arg),
                }),
            });
        }

        // if lhs is an argument, we must create a new local, and use that instead
        let lhs = if lhs.projections.is_empty() {
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
                    lhs: Place::local(local, interner),
                    rhs: RValue::Load(Operand::Place(lhs)),
                }),
            });

            local
        };

        // We now create new block, which has a block param for the new local, the terminator is
        // the terminator of the original block
        let continution = source.basic_blocks.as_mut().push(BasicBlock {
            params: interner.locals.intern_slice(&[lhs]),
            statements: after,
            terminator,
        });

        source
            .basic_blocks
            .as_mut()
            .extend(target.basic_blocks.iter().cloned());

        source
            .local_decls
            .extend(target.local_decls.iter().copied());

        let mut visitor = RenameVisitor {
            local_offset,
            bb_offset,
            continution,
            interner,
        };

        let bb_offset = BasicBlockId::from_usize(bb_offset);
        for (index, block) in source.basic_blocks.as_mut()[bb_offset..]
            .iter_mut()
            .enumerate()
        {
            visitor.visit_basic_block(bb_offset.plus(index), block);
        }
    }

    fn inline_body<'heap>(
        &self,
        interner: &Interner<'heap>,
        graph: &CallGraph<'_, A>,
        costs: &CostEstimationResidual<A>,
        sccs: &StronglyConnectedComponents<DefId, SccId, (), A>,

        bodies: &mut DefIdSlice<Body<'heap>>,
        body: DefId,
    ) where
        A: Clone,
    {
        // TODO: global overarching scratch space for BinaryHeap and Vec (sadly needs to be done
        // because we don't have checkpointing yet)
        let targets = self.select_callsites(graph, costs, sccs, body);

        // targets already come pre-ordered, so we can just iterate over them
        // they're ordered in reverse
        for CallSite {
            caller,
            kind: location,
            target,
        } in targets
        {
            Self::inline_callsite(interner, bodies, caller, location, target);
        }
    }
}
