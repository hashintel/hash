#![expect(clippy::float_arithmetic)]
use alloc::collections::BinaryHeap;
use core::{alloc::Allocator, cmp, mem};

use hashql_core::{
    graph::{
        DirectedGraph as _,
        algorithms::{
            Tarjan,
            tarjan::{SccId, StronglyConnectedComponents},
        },
    },
    heap::{BumpAllocator, Heap, ResetAllocator},
    id::{
        Id as _, IdSlice,
        bit_vec::{DenseBitSet, SparseBitMatrix},
    },
    span::SpanId,
};

use self::{
    cost::{BodyProperties, CostEstimationAnalysis, CostEstimationConfig, LoopVec},
    find::FindCallsiteVisitor,
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
    visit::{Visitor as _, VisitorMut as _},
};

mod cost;
mod find;
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

        score.total_cmp(&other.score).reverse() // Higher scores first (max-heap).
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct InlineConfig {
    pub cost: CostEstimationConfig,
    pub score: ScoreConfig,
    pub budget_multiplier: f32,
    pub aggressive_inline_cutoff: usize,
}

impl InlineConfig {
    pub const DEFAULT: Self = Self {
        cost: CostEstimationConfig::DEFAULT,
        score: ScoreConfig::DEFAULT,
        budget_multiplier: 5.0,
        aggressive_inline_cutoff: 16,
    };
}

struct InlineStateMemory<A: Allocator> {
    callsites: Vec<CallSite<Location>, A>,
    candidates: BinaryHeap<Candidate, A>,
}

impl<A: Allocator> InlineStateMemory<A> {
    fn new(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            callsites: Vec::new_in(alloc.clone()),
            candidates: BinaryHeap::new_in(alloc),
        }
    }
}

struct InlineState<'env, 'heap, A: Allocator> {
    config: InlineConfig,
    interner: &'env Interner<'heap>,

    graph: CallGraph<'heap, A>,

    filters: DenseBitSet<DefId>, // Bodies requiring aggressive inlining.
    inlined: SparseBitMatrix<DefId, SccId, A>, /* Tracks which SCCs have been inlined into each
                                  * body. */

    properties: DefIdVec<BodyProperties, A>,
    loops: LoopVec<A>,
    components: StronglyConnectedComponents<DefId, SccId, (), A>,
}

impl<'heap, A: Allocator> InlineState<'_, 'heap, A> {
    fn select_all_callsites(&mut self, body: DefId, mem: &mut InlineStateMemory<A>) {
        let component = self.components.scc(body);

        self.graph
            .apply_callsites(body)
            .filter(|callsite| self.components.scc(callsite.target) != component)
            .collect_into(&mut mem.callsites);

        // Record inlined SCCs to prevent cycles during aggressive inlining.
        self.inlined.insert(body, component);
        for callsite in &mem.callsites {
            self.inlined
                .insert(body, self.components.scc(callsite.target));
        }
    }

    fn select_callsites(&mut self, body: DefId, mem: &mut InlineStateMemory<A>) {
        if self.filters.contains(body) {
            return self.select_all_callsites(body, mem);
        }

        let component = self.components.scc(body);
        let scorer = CallScorer {
            config: self.config.score,
            graph: &self.graph,
            loops: &self.loops,
            properties: &self.properties,
        };

        let targets = &mut mem.callsites;
        let candidates = &mut mem.candidates;

        for callsite in self.graph.apply_callsites(body) {
            if self.components.scc(callsite.target) == component {
                // Cannot inline recursive calls (same SCC).
                continue;
            }

            let score = scorer.score(callsite);
            if score.is_sign_negative() {
                // Negative score means inlining is not beneficial.
                continue;
            }

            if score.is_infinite() {
                // Infinite score means always inline without contributing to budget.
                targets.push(callsite);
                continue;
            }

            candidates.push(Candidate { score, callsite });
        }

        let mut remaining_budget = self.config.score.max * self.config.budget_multiplier;

        for candidate in candidates.drain_sorted() {
            let target_cost = self.properties[candidate.callsite.target].cost;

            if remaining_budget >= target_cost {
                remaining_budget -= target_cost;
                targets.push(candidate.callsite);
            }
        }
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
        let target = &*target; // Downgrade to shared ref to prevent accidental modification.

        let bb_offset = source.basic_blocks.len();

        let block = &mut source.basic_blocks.as_mut()[location.block];

        debug_assert!(
            target.basic_blocks[BasicBlockId::START].params.is_empty(),
            "function entry block must have no params"
        );
        let terminator = mem::replace(
            &mut block.terminator,
            Terminator {
                span: SpanId::SYNTHETIC,
                kind: TerminatorKind::Goto(Goto {
                    // +1 because patch_callsite pushes the continuation block first.
                    target: Target::block(BasicBlockId::START.plus(bb_offset + 1), self.interner),
                }),
            },
        );
        debug_assert!(
            location.statement_index > 0,
            "callsite location must point to a statement, not block params"
        );
        // statement_index is 1-based: split_off gives statements after the call,
        // pop removes the call statement itself.
        let mut after = block.statements.split_off(location.statement_index);
        let callsite = block.statements.pop().unwrap_or_else(|| unreachable!());

        block.terminator.span = callsite.span;

        let StatementKind::Assign(Assign {
            lhs,
            rhs: RValue::Apply(apply),
        }) = callsite.kind
        else {
            unreachable!("`inlinable_callsites` should only point to apply statements")
        };

        // If lhs has projections, create a temp local and assign to lhs after the call.
        let result = if lhs.projections.is_empty() {
            lhs.local
        } else {
            let type_id = lhs.type_id(&source.local_decls);
            let local = source.local_decls.push(LocalDecl {
                span: callsite.span,
                r#type: type_id,
                name: None,
            });

            // Prepend assignment to write the result back to the projected place.
            after.insert(
                0,
                Statement {
                    span: callsite.span,
                    kind: StatementKind::Assign(Assign {
                        lhs,
                        rhs: RValue::Load(Operand::Place(Place::local(local, self.interner))),
                    }),
                },
            );

            local
        };

        let local_offset = source.local_decls.len();

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
        // Create continuation block with result as block param.
        let continuation = source.basic_blocks.as_mut().push(BasicBlock {
            params: self.interner.locals.intern_slice(&[result]),
            statements,
            terminator,
        });

        let bb_offset = source.basic_blocks.bound();
        // This must match the `local_offset` used in `inline_callsite` for argument assignments.
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
            continuation,
            interner: self.interner,
        };

        for (index, block) in source.basic_blocks.as_mut()[bb_offset..]
            .iter_mut()
            .enumerate()
        {
            visitor.visit_basic_block(bb_offset.plus(index), block);
        }
    }

    fn inline_body(
        &mut self,
        bodies: &mut DefIdSlice<Body<'heap>>,
        body: DefId,
        mem: &mut InlineStateMemory<A>,
    ) {
        self.select_callsites(body, mem);
        // Sort in reverse order so later callsites are processed first (avoids index shifting).
        mem.callsites
            .sort_unstable_by(|lhs, rhs| lhs.kind.cmp(&rhs.kind).reverse());

        for callsite in mem.callsites.drain(..) {
            self.inline_callsite(bodies, callsite);
        }
    }
}

pub struct Inline<A: BumpAllocator> {
    alloc: A,

    config: InlineConfig,
}

impl<A: BumpAllocator> Inline<A> {
    pub const fn new_in(config: InlineConfig, alloc: A) -> Self {
        Self { alloc, config }
    }

    fn state<'env, 'heap>(
        &self,
        interner: &'env Interner<'heap>,
        bodies: &DefIdSlice<Body<'heap>>,
    ) -> InlineState<'env, 'heap, &A> {
        let graph = CallGraph::analyze_in(bodies, &self.alloc);
        let mut analysis =
            CostEstimationAnalysis::new(&graph, bodies, self.config.cost, &self.alloc);

        for body in bodies {
            analysis.analyze(body);
        }

        let mut filters = DenseBitSet::new_empty(bodies.len());
        for filter in graph.filters() {
            filters.insert(filter);
        }

        let costs = analysis.finish();

        let tarjan = Tarjan::new_in(&graph, &self.alloc);
        let components = tarjan.run();

        InlineState {
            config: self.config,
            filters,
            inlined: SparseBitMatrix::new_in(components.node_count(), &self.alloc),
            interner,
            graph,
            properties: costs.properties,
            loops: costs.loops,
            components,
        }
    }

    fn normal_inline<'heap, 'alloc>(
        &self,
        state: &mut InlineState<'_, 'heap, &'alloc A>,
        bodies: &mut IdSlice<DefId, Body<'heap>>,
        mem: &mut InlineStateMemory<&'alloc A>,
    ) {
        // Process SCCs in dependency order (callees before callers).
        let members = state.components.members_in(&self.alloc);

        for scc in members.sccs() {
            for &id in members.of(scc) {
                state.inline_body(bodies, id, mem);
            }
        }
    }

    fn aggressive_inline<'heap, 'alloc>(
        &self,
        state: &mut InlineState<'_, 'heap, &'alloc A>,
        bodies: &mut IdSlice<DefId, Body<'heap>>,
        mem: &mut InlineStateMemory<&'alloc A>,
    ) {
        // For each filter, inline all eligible callsites until fixpoint or cutoff.
        for filter in &state.filters {
            let mut iteration = 0;
            while iteration < self.config.aggressive_inline_cutoff {
                let mut visitor = FindCallsiteVisitor {
                    caller: filter,
                    state,
                    mem,
                };
                visitor.visit_body(&bodies[filter]);

                if mem.callsites.is_empty() {
                    break;
                }

                mem.callsites
                    .sort_unstable_by(|lhs, rhs| lhs.kind.cmp(&rhs.kind).reverse());
                for callsite in mem.callsites.drain(..) {
                    let target_component = state.components.scc(callsite.target);
                    state.inlined.insert(filter, target_component);

                    state.inline_callsite(bodies, callsite);
                }

                iteration += 1;
            }

            if iteration == self.config.aggressive_inline_cutoff {
                // TODO: issue diagnostic that filter is excessively deep and wasn't able to be
                // fully inlined
            }
        }
    }

    pub fn run<'heap>(
        &mut self,
        context: &MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) where
        A: ResetAllocator,
    {
        self.alloc.reset();

        let mut state = self.state(context.interner, bodies);
        let mut mem = InlineStateMemory::new(&self.alloc);

        self.normal_inline(&mut state, bodies, &mut mem);
        self.aggressive_inline(&mut state, bodies, &mut mem);
    }
}
