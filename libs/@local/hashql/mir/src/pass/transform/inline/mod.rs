//! Function inlining pass for MIR.
//!
//! This pass inlines function calls to reduce call overhead and enable further optimizations.
//! It operates in two phases:
//!
//! 1. **Normal phase**: Processes all functions using heuristic scoring and budget constraints.
//! 2. **Aggressive phase**: For filter closures only, inlines until fixpoint or cutoff.
//!
//! # Architecture
//!
//! The inliner uses several key components:
//!
//! - [`BodyAnalysis`]: Computes cost, directive, and loop information for each function.
//! - [`InlineHeuristics`]: Scores callsites based on cost, bonuses, and penalties.
//! - [`InlineState`]: Tracks inlining state including SCC membership and budget.
//!
//! # Normal Phase
//!
//! For non-filter functions, the normal phase:
//! 1. Processes SCCs in dependency order (callees before callers).
//! 2. For each callsite, computes a score using [`InlineHeuristics::score`].
//! 3. Selects candidates with positive scores, limited by per-caller budget.
//! 4. Updates caller costs after inlining to prevent cascade explosions.
//!
//! Recursive calls (same SCC) are never inlined to prevent infinite expansion.
//!
//! # Aggressive Phase
//!
//! Filter closures (used in graph read pipelines) bypass normal heuristics and get
//! aggressive inlining to fully flatten the filter logic. The aggressive phase:
//! 1. Iterates up to `aggressive_inline_cutoff` times per filter.
//! 2. On each iteration, inlines all eligible callsites found in the filter.
//! 3. Tracks which SCCs have been inlined to prevent cycles.
//! 4. Emits a diagnostic if the cutoff is reached.
//!
//! # Budget System
//!
//! Each caller has a budget of `max × budget_multiplier` cost units. When selecting
//! candidates:
//! - Candidates are sorted by score (highest first).
//! - Each inlined callee consumes its cost from the budget.
//! - Callsites with infinite score (directive or `always_inline`) bypass budget entirely.
//!
//! After inlining, the caller's cost is updated: the `Apply` cost is removed and the
//! callee's cost is added. This ensures subsequent inlining decisions see the true
//! accumulated cost.

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
    heap::{BumpAllocator, Heap},
    id::{
        Id as _, IdSlice,
        bit_vec::{DenseBitSet, SparseBitMatrix},
    },
    span::SpanId,
};

pub use self::{analysis::InlineCostEstimationConfig, heuristics::InlineHeuristicsConfig};
use self::{
    analysis::{BodyAnalysis, BodyProperties, CostEstimationResidual},
    find::FindCallsiteVisitor,
    heuristics::InlineHeuristics,
    rename::RenameVisitor,
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
    def::{DefId, DefIdSlice},
    intern::Interner,
    pass::{
        Changed, GlobalTransformPass, GlobalTransformState,
        analysis::{CallGraph, CallSite},
        transform::error,
    },
    visit::{Visitor as _, VisitorMut as _},
};

mod analysis;
mod find;
mod heuristics;
mod rename;

#[cfg(test)]
mod tests;

/// A candidate callsite for inlining, with its computed score.
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

        // Reverse ordering: higher scores come first (max-heap behavior).
        score.total_cmp(&other.score)
    }
}

/// Top-level configuration for the inline pass.
///
/// Combines cost estimation, heuristics, and pass-level parameters.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct InlineConfig {
    /// Weights for computing function body costs.
    pub cost: InlineCostEstimationConfig,
    /// Thresholds and bonuses for scoring callsites.
    pub heuristics: InlineHeuristicsConfig,
    /// Multiplier for computing per-caller budget.
    ///
    /// Budget = `heuristics.max × budget_multiplier`.
    /// Limits how much code can be inlined into a single function.
    ///
    /// Default: `2.0` (budget of 120 with default max of 60).
    pub budget_multiplier: f32,
    /// Maximum iterations for aggressive filter inlining.
    ///
    /// The aggressive phase runs up to this many iterations per filter,
    /// inlining all eligible callsites each iteration. If the limit is
    /// reached, a diagnostic is emitted.
    ///
    /// Default: `16` (generous for deep pipelines).
    pub aggressive_inline_cutoff: usize,
}

impl Default for InlineConfig {
    fn default() -> Self {
        Self {
            cost: InlineCostEstimationConfig::default(),
            heuristics: InlineHeuristicsConfig::default(),
            budget_multiplier: 2.0,
            aggressive_inline_cutoff: 16,
        }
    }
}

/// Reusable memory for callsite collection during inlining.
struct InlineStateMemory<A: Allocator> {
    /// Collected callsites to inline.
    callsites: Vec<CallSite<Location>, A>,
    /// Priority queue of candidates sorted by score.
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

/// State maintained during the inlining process.
struct InlineState<'ctx, 'state, 'env, 'heap, A: Allocator> {
    config: InlineConfig,
    interner: &'env Interner<'heap>,

    graph: CallGraph<'heap, A>,

    /// Functions that require aggressive inlining (filter closures).
    filters: DenseBitSet<DefId>,
    /// Tracks which SCCs have been inlined into each function.
    ///
    /// Used to prevent cycles during aggressive inlining: once an SCC
    /// has been inlined into a filter, it won't be inlined again.
    inlined: SparseBitMatrix<DefId, SccId, A>,

    // cost estimation properties
    costs: CostEstimationResidual<'heap, A>,

    /// SCC membership for cycle detection.
    components: StronglyConnectedComponents<DefId, SccId, (), A>,

    global: &'ctx mut GlobalTransformState<'state>,
}

impl<'heap, A: Allocator> InlineState<'_, '_, '_, 'heap, A> {
    /// Collect all non-recursive callsites for aggressive inlining.
    ///
    /// Used for filter functions which bypass normal heuristics.
    /// Records inlined SCCs to prevent cycles in subsequent iterations.
    fn collect_all_callsites(&mut self, body: DefId, mem: &mut InlineStateMemory<A>) {
        let component = self.components.scc(body);

        self.graph
            .apply_callsites(body)
            .filter(|callsite| self.components.scc(callsite.target) != component)
            .collect_into(&mut mem.callsites);

        self.inlined.insert(body, component);
        for callsite in &mem.callsites {
            self.inlined
                .insert(body, self.components.scc(callsite.target));
        }
    }

    /// Collect callsites using heuristic scoring and budget.
    ///
    /// For filter functions, delegates to [`collect_all_callsites`](Self::collect_all_callsites).
    /// For normal functions:
    /// 1. Scores each callsite using [`InlineHeuristics`].
    /// 2. Skips negative scores (not beneficial) and recursive calls (same SCC).
    /// 3. Infinite scores bypass budget; finite positive scores are ranked.
    /// 4. Selects candidates in score order until budget is exhausted.
    /// 5. Updates caller cost to reflect inlined code.
    #[expect(clippy::cast_precision_loss)]
    fn collect_callsites(&mut self, body: DefId, mem: &mut InlineStateMemory<A>) {
        if self.filters.contains(body) {
            return self.collect_all_callsites(body, mem);
        }

        let component = self.components.scc(body);
        let scorer = InlineHeuristics {
            config: self.config.heuristics,
            graph: &self.graph,
            loops: &self.costs.loops,
            properties: &self.costs.properties,
        };

        let targets = &mut mem.callsites;
        let candidates = &mut mem.candidates;

        for callsite in self.graph.apply_callsites(body) {
            if self.components.scc(callsite.target) == component {
                continue;
            }

            let score = scorer.score(callsite);
            if score.is_sign_negative() {
                continue;
            }

            if score.is_infinite() {
                targets.push(callsite);
                continue;
            }

            candidates.push(Candidate { score, callsite });
        }

        let mut remaining_budget = self.config.heuristics.max * self.config.budget_multiplier;

        for candidate in candidates.drain_sorted() {
            let target_cost = self.costs.properties[candidate.callsite.target].cost;

            if remaining_budget >= target_cost {
                remaining_budget -= target_cost;
                targets.push(candidate.callsite);
            }
        }

        // Update caller cost: remove Apply costs and add callee costs.
        // This ensures subsequent callers see the true accumulated cost.
        self.costs.properties[body].cost -= (targets.len() as f32) * self.config.cost.rvalue_apply;
        for target in targets {
            debug_assert_eq!(target.caller, body);

            let Ok([caller, target]) = self
                .costs
                .properties
                .get_disjoint_mut([target.caller, target.target])
            else {
                unreachable!("`inlinable_callsites` should have filtered out self-calls")
            };

            caller.cost += target.cost;
        }
    }

    /// Perform the actual inlining of a callsite.
    ///
    /// This involves:
    /// 1. Splitting the caller's basic block at the call statement.
    /// 2. Creating a continuation block for code after the call.
    /// 3. Copying the callee's basic blocks and locals into the caller.
    /// 4. Renaming all references to account for the new offsets.
    /// 5. Redirecting the call to jump into the inlined code.
    fn inline(
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
        // Downgrade to shared ref to prevent accidental modification.
        let target = &*target;

        let bb_offset = source.basic_blocks.len();

        let block = &mut source.basic_blocks.as_mut()[location.block];

        debug_assert!(
            target.basic_blocks[BasicBlockId::START].params.is_empty(),
            "function entry block must have no params"
        );
        // Replace the block's terminator with a goto to the inlined entry block.
        // +1 because we push the continuation block first (see `apply`).
        let terminator = mem::replace(
            &mut block.terminator,
            Terminator {
                span: SpanId::SYNTHETIC,
                kind: TerminatorKind::Goto(Goto {
                    target: Target::block(BasicBlockId::START.plus(bb_offset + 1)),
                }),
            },
        );
        debug_assert!(
            location.statement_index > 0,
            "callsite location must point to a statement, not block params"
        );
        // statement_index is 1-based (0 = block params), so split_off gives statements
        // after the call, and pop removes the call statement itself.
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

        // Determine where to store the return value.
        // If lhs has projections (e.g., `foo.bar = call()`), we can't use it directly as a
        // block param. Create a temp local and prepend an assignment to write it back.
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
                        rhs: RValue::Load(Operand::Place(Place::local(local))),
                    }),
                },
            );

            local
        };

        let local_offset = source.local_decls.len();

        // Assign arguments to the callee's parameter locals.
        debug_assert_eq!(apply.arguments.len(), target.args);
        for (index, arg) in apply.arguments.into_iter().enumerate() {
            block.statements.push(Statement {
                span: callsite.span,
                kind: StatementKind::Assign(Assign {
                    lhs: Place::local(Local::new(local_offset + index)),
                    rhs: RValue::Load(arg),
                }),
            });
        }

        self.apply(source, target, result, after, terminator);
    }

    /// Apply the callee's code to the caller body.
    ///
    /// Creates the continuation block, copies callee blocks and locals,
    /// and renames all references to use the new offsets.
    fn apply(
        &self,
        source: &mut Body<'heap>,
        callee: &Body<'heap>,

        result: Local,
        statements: Vec<Statement<'heap>, &'heap Heap>,
        terminator: Terminator<'heap>,
    ) {
        // Create continuation block first. The inlined code's returns will jump here,
        // passing the return value as a block argument to `result`.
        let continuation = source.basic_blocks.as_mut().push(BasicBlock {
            params: self.interner.locals.intern_slice(&[result]),
            statements,
            terminator,
        });

        // Record offsets before extending - these are used to rename all references.
        let bb_offset = source.basic_blocks.bound();
        // This must match the `local_offset` used in `inline` for argument assignments.
        let local_offset = source.local_decls.len();

        // Copy callee's blocks and locals into caller.
        source
            .basic_blocks
            .as_mut()
            .extend(callee.basic_blocks.iter().cloned());

        source
            .local_decls
            .extend(callee.local_decls.iter().copied());

        // Rename all references in the copied blocks to use the new offsets.
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

    /// Process a single function: collect callsites and inline them.
    fn run(
        &mut self,
        bodies: &mut DefIdSlice<Body<'heap>>,
        body: DefId,
        mem: &mut InlineStateMemory<A>,
    ) -> Changed {
        self.collect_callsites(body, mem);
        // Sort in reverse order so later callsites are processed first.
        // This avoids index shifting issues when modifying the body.
        mem.callsites
            .sort_unstable_by(|lhs, rhs| lhs.kind.cmp(&rhs.kind).reverse());

        if mem.callsites.is_empty() {
            return Changed::No;
        }

        for callsite in mem.callsites.drain(..) {
            self.inline(bodies, callsite);
        }

        // Once finished we must recompute the `is_leaf` to propagate the changes
        let is_leaf = self.costs.is_leaf(&bodies[body]);
        self.costs.properties[body].is_leaf = is_leaf;

        Changed::Yes
    }
}

/// The main inline pass.
///
/// Inlines function calls to reduce overhead and enable optimizations.
pub struct Inline<A: BumpAllocator> {
    alloc: A,

    config: InlineConfig,
}

impl<A: BumpAllocator> Inline<A> {
    pub const fn new_in(config: InlineConfig, alloc: A) -> Self {
        Self { alloc, config }
    }

    /// Build initial state by analyzing all bodies.
    fn state<'ctx, 'state, 'env, 'heap>(
        &self,
        state: &'ctx mut GlobalTransformState<'state>,
        interner: &'env Interner<'heap>,
        bodies: &DefIdSlice<Body<'heap>>,
    ) -> InlineState<'ctx, 'state, 'env, 'heap, &A> {
        let graph = CallGraph::analyze_in(bodies, &self.alloc);
        let mut analysis = BodyAnalysis::new(&graph, bodies, self.config.cost, &self.alloc);

        for body in bodies {
            analysis.run(body);
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
            costs,
            components,
            global: state,
        }
    }

    /// Run the normal inlining phase.
    ///
    /// Processes SCCs in dependency order (callees before callers) so that
    /// cost updates propagate correctly.
    fn normal<'heap, 'alloc>(
        &self,
        state: &mut InlineState<'_, '_, '_, 'heap, &'alloc A>,
        bodies: &mut IdSlice<DefId, Body<'heap>>,
        mem: &mut InlineStateMemory<&'alloc A>,
    ) -> Changed {
        let members = state.components.members_in(&self.alloc);

        let mut any_changed = Changed::No;
        for scc in members.sccs() {
            for &id in members.of(scc) {
                let changed = state.run(bodies, id, mem);
                any_changed |= changed;
                state.global.mark(id, changed);
            }
        }
        any_changed
    }

    /// Run the aggressive inlining phase for filter functions.
    ///
    /// For each filter, iteratively inlines all eligible callsites until
    /// no more are found or the cutoff is reached.
    fn aggressive<'heap, 'alloc>(
        &self,
        context: &mut MirContext<'_, 'heap>,
        state: &mut InlineState<'_, '_, '_, 'heap, &'alloc A>,
        bodies: &mut IdSlice<DefId, Body<'heap>>,
        mem: &mut InlineStateMemory<&'alloc A>,
    ) -> Changed {
        let mut any_changed = Changed::No;

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

                any_changed = Changed::Yes;
                state.global.mark(filter, Changed::Yes);

                mem.callsites
                    .sort_unstable_by(|lhs, rhs| lhs.kind.cmp(&rhs.kind).reverse());
                for callsite in mem.callsites.drain(..) {
                    let target_component = state.components.scc(callsite.target);
                    state.inlined.insert(filter, target_component);

                    state.inline(bodies, callsite);
                }

                iteration += 1;
            }

            if iteration == self.config.aggressive_inline_cutoff {
                context.diagnostics.push(error::excessive_inlining_depth(
                    bodies[filter].span,
                    self.config.aggressive_inline_cutoff,
                ));
            }
        }

        any_changed
    }
}

impl<'env, 'heap, A: BumpAllocator> GlobalTransformPass<'env, 'heap> for Inline<A> {
    fn run(
        &mut self,
        context: &mut MirContext<'env, 'heap>,
        state: &mut GlobalTransformState<'_>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Changed {
        let mut state = self.state(state, context.interner, bodies);
        let mut mem = InlineStateMemory::new(&self.alloc);

        let mut changed = Changed::No;
        changed |= self.normal(&mut state, bodies, &mut mem);
        changed |= self.aggressive(context, &mut state, bodies, &mut mem);
        changed
    }
}
