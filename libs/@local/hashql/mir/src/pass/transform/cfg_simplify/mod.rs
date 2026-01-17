//! Control-flow graph simplification pass.
//!
//! This pass performs several CFG optimizations to reduce the number of basic blocks and simplify
//! control flow:
//!
//! - **Goto chaining**: Merges blocks connected by unconditional jumps when safe
//! - **Switch constant folding**: Replaces `SwitchInt` with known discriminants by direct `Goto`
//! - **Switch degeneration**: Converts `SwitchInt` with identical targets to `Goto`
//! - **Dead block elimination**: Marks unreachable blocks to enable further optimizations
//!
//! # Algorithm
//!
//! The pass uses a worklist-based fixed-point iteration:
//!
//! 1. Initialize the worklist with all blocks in reverse postorder
//! 2. For each block, repeatedly apply simplifications until no more changes occur
//! 3. After each simplification, mark newly unreachable blocks as dead
//! 4. Enqueue predecessors of modified blocks to propagate optimization opportunities
//! 5. Run SSA repair to fix any broken phi nodes
//!
//! Marking dead blocks immediately after each simplification (rather than at the end) enables
//! cascading optimizations. For example, constant-folding a `SwitchInt` may make one arm
//! unreachable, reducing the predecessor count of subsequent blocks, which then enables inlining.
//!
//! # Example
//!
//! Before:
//! ```text
//! bb0: switch_int(const 1) -> [0: bb1, 1: bb2]
//! bb1: /* dead code */
//! bb2: goto bb3
//! bb3: return
//! ```
//!
//! After:
//! ```text
//! bb0: return
//! bb1: unreachable
//! bb2: unreachable
//! bb3: unreachable
//! ```

#[cfg(test)]
mod tests;

use core::{iter::ExactSizeIterator as _, mem};

use hashql_core::{
    collections::{WorkQueue, fast_hash_set_with_capacity_in},
    graph::Predecessors as _,
    heap::{BumpAllocator, Scratch, TransferInto as _},
};

use super::{DeadBlockElimination, error::unreachable_switch_arm, ssa_repair::SsaRepair};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        constant::Constant,
        operand::Operand,
        place::Place,
        rvalue::RValue,
        statement::{Assign, Statement, StatementKind},
        terminator::{Goto, Terminator, TerminatorKind},
    },
    context::MirContext,
    pass::{Changed, TransformPass},
};

/// Returns `true` if the block contains only no-op statements.
///
/// A block with only no-ops can be safely bypassed or merged without affecting semantics.
fn is_noop(block: &BasicBlock<'_>) -> bool {
    block
        .statements
        .iter()
        .all(|statement| matches!(statement.kind, StatementKind::Nop))
}

/// Attempts to simplify a `Goto` terminator by merging with its target block.
///
/// # Simplification Cases
///
/// 1. **Single predecessor**: The target block has only one predecessor (this block), so we can
///    fully merge by moving all statements and assuming the target's terminator.
///
/// 2. **Multiple predecessors with no-op target**: The target block has multiple predecessors but
///    contains only no-ops, so we can safely assume its terminator without duplicating meaningful
///    work.
///
/// Self-loops (`goto` to the same block) cannot be simplified and are skipped.
///
/// # Merging Process
///
/// When merging block `A` into block `B` (where `A: goto B`):
///
/// 1. Generate assignments for `B`'s block parameters using the arguments from the `Goto`
/// 2. Append all statements from `B` to `A`
/// 3. Replace `A`'s terminator with `B`'s terminator
///
/// SSA invariants may be temporarily broken; the [`SsaRepair`] runs afterward to fix them.
fn simplify_goto<'heap>(body: &mut Body<'heap>, id: BasicBlockId, goto: Goto<'heap>) -> bool {
    // Self-loops cannot be optimized as there's no simplification possible.
    if goto.target.block == id {
        return false;
    }

    let target_predecessors_len = body.basic_blocks.predecessors(goto.target.block).len();

    // With multiple predecessors, we can only merge if the target is effectively empty.
    // Otherwise we'd duplicate statements across all predecessor paths.
    if target_predecessors_len > 1 && !is_noop(&body.basic_blocks[goto.target.block]) {
        return false;
    }

    // This is the only special case, if there are multiple predecessors, and the target itself
    // is a self-loop we cannot safely merge them. The reason is that in that case we wouldn't
    // be able to make any progress upon expansion, as we would replace our own terminator with
    // the exact same one. We could broaden the search to also check params (which would still
    // be correct), this case alone leads to more code generation as we're generating a
    // superfluous assignment.
    // The `target_predecessors_len` check isn't 100% necessary, as this case can only happen
    // iff the target is a self-loop, hence has multiple predecessors, but allows us to be a bit
    // more defensive about that fact.
    if target_predecessors_len > 1
        && let TerminatorKind::Goto(target_goto) =
            body.basic_blocks[goto.target.block].terminator.kind
        && target_goto.target.block == goto.target.block
    {
        return false;
    }

    let [block, target] = body
        .basic_blocks
        .as_mut()
        .get_disjoint_mut([id, goto.target.block])
        .unwrap_or_else(|_err| unreachable!("self-loops excluded by check above"));

    // Step 1: Assign block parameters before moving statements to maintain def-before-use.
    debug_assert_eq!(target.params.len(), goto.target.args.len());
    for (&param, &arg) in target.params.iter().zip(goto.target.args) {
        block.statements.push(Statement {
            span: block.terminator.span,
            kind: StatementKind::Assign(Assign {
                lhs: Place::local(param),
                rhs: RValue::Load(arg),
            }),
        });
    }

    // Step 2: Move statements from target to current block.
    // Safe even with multiple predecessors since we verified the target only has no-ops.
    block.statements.append(&mut target.statements);

    // Step 3: Assume the target's terminator.
    // With a single predecessor we can take ownership; otherwise we must clone.
    let next_terminator = if target_predecessors_len == 1 {
        let src = Terminator::unreachable(target.terminator.span);

        mem::replace(&mut target.terminator, src)
    } else {
        target.terminator.clone()
    };

    block.terminator = next_terminator;

    true
}

/// Attempts to simplify a `SwitchInt` terminator.
///
/// # Simplification Cases
///
/// 1. **Constant discriminant**: The switch value is a compile-time constant, so we replace the
///    switch with a direct `Goto` to the matching arm (or `otherwise`).
///
/// 2. **All targets identical**: Every arm jumps to the same block, so the switch degenerates to a
///    simple `Goto`.
///
/// 3. **Only otherwise**: No explicit cases, just a default arm—degenerates to `Goto`.
///
/// 4. **Redundant cases**: Cases that jump to the same target as `otherwise` are removed.
///
/// 5. **Target promotion**: When a switch arm targets an empty block with a `Goto` terminator, we
///    can redirect the switch directly to that `Goto`'s target.
#[expect(clippy::too_many_lines, reason = "mostly documentation")]
fn simplify_switch_int<'heap>(
    context: &mut MirContext<'_, 'heap>,
    body: &mut Body<'heap>,
    id: BasicBlockId,
) -> bool {
    let terminator = &body.basic_blocks[id].terminator;
    let TerminatorKind::SwitchInt(switch) = &terminator.kind else {
        unreachable!()
    };

    // Case 1: Constant discriminant - select the matching arm directly.
    if let Operand::Constant(Constant::Int(int)) = switch.discriminant {
        let discriminant = int.as_uint();

        // Look for an explicit case matching the discriminant.
        if let Some(index) = switch
            .targets
            .values()
            .iter()
            .position(|&value| value == discriminant)
        {
            let target = switch.targets.targets()[index];
            body.basic_blocks.as_mut()[id].terminator.kind = TerminatorKind::Goto(Goto { target });

            return true;
        }

        // Fall back to the otherwise branch if present.
        if let Some(otherwise) = switch.targets.otherwise() {
            body.basic_blocks.as_mut()[id].terminator.kind =
                TerminatorKind::Goto(Goto { target: otherwise });

            return true;
        }

        // No matching case and no otherwise—this violates compiler invariants.
        context
            .diagnostics
            .push(unreachable_switch_arm(terminator.span));
        body.basic_blocks.as_mut()[id].terminator.kind = TerminatorKind::Unreachable;
        return true;
    }

    // Case 2: All targets are identical - degenerate to Goto.
    if switch
        .targets
        .targets()
        .array_windows()
        .all(|[lhs, rhs]| lhs == rhs)
    {
        let target = switch.targets.targets()[0];
        body.basic_blocks.as_mut()[id].terminator.kind = TerminatorKind::Goto(Goto { target });

        return true;
    }

    // Case 3: Only an otherwise target with no explicit cases.
    if switch.targets.values().is_empty()
        && let Some(otherwise) = switch.targets.otherwise()
    {
        body.basic_blocks.as_mut()[id].terminator.kind =
            TerminatorKind::Goto(Goto { target: otherwise });

        return true;
    }

    // Case 4: Remove cases that are redundant with otherwise.
    if let Some(otherwise) = switch.targets.otherwise() {
        let redundant_values: Vec<_> = switch
            .targets
            .iter()
            .filter_map(|(value, target)| (target == otherwise).then_some(value))
            .collect();

        if !redundant_values.is_empty() {
            let TerminatorKind::SwitchInt(switch) =
                &mut body.basic_blocks.as_mut()[id].terminator.kind
            else {
                unreachable!()
            };

            for value in redundant_values {
                switch.targets.remove_target(value);
            }

            return true;
        }
    }

    // Case 5: Promote targets that point to empty blocks with Goto terminators.
    // This lets us skip intermediate blocks and potentially enable further simplifications.
    //
    // We can only promote when the target block is effectively empty (only no-ops).
    // Otherwise, we'd change execution order by skipping those statements.

    // We don't use `InlineVec` or similar here, because it doesn't make sense – most of the
    // time they are going to be empty.
    let target_len = switch.targets.targets().len();
    let mut promotion_goto = Vec::new();

    // To circumvent borrowing rules, and rule out modifications in most cases, we first check
    // if any modification is even needed. If that is not the case, we return early.
    for (index, &target) in switch.targets.targets().iter().enumerate() {
        let is_last = index == target_len - 1;
        let is_otherwise = switch.targets.has_otherwise() && is_last;

        // Skip self-loops.
        if target.block == id {
            continue;
        }

        // We can only promote terminators if we don't pass any arguments. Otherwise,
        // we'd need to assign parameters before the switch, which would affect all arms.
        // If two arms point to the same block, this corrupts the other arm's semantics.
        // We could insert an intermediate block, but that negates the optimization.
        if !target.args.is_empty() {
            continue;
        }

        let target_block = &body.basic_blocks[target.block];
        if !is_noop(target_block) {
            continue;
        }

        match &target_block.terminator.kind {
            TerminatorKind::Goto(_) => {
                promotion_goto.push((index, target));
            }
            // SwitchInt promotion is more complex and not yet implemented.
            // See: https://linear.app/hash/issue/BE-219/hashql-implement-switchint-simplification
            TerminatorKind::SwitchInt(target_switch)
                if !is_otherwise
                    && !switch.targets.has_otherwise()
                    && !target_switch.targets.has_otherwise() =>
            {
                // Requires discriminant folding with arithmetic operations.
            }
            TerminatorKind::SwitchInt(_)
            | TerminatorKind::Return(_)
            | TerminatorKind::GraphRead(_)
            | TerminatorKind::Unreachable => {}
        }
    }

    if promotion_goto.is_empty() {
        // There is not a single branch which can be promoted.
        // This is the case in the majority of cases.
        return false;
    }

    // Apply promotions: redirect switch targets through their Goto destinations.
    for (target_index, target) in promotion_goto {
        let [block, target_block] = body
            .basic_blocks
            .as_mut()
            .get_disjoint_mut([id, target.block])
            .unwrap_or_else(|_err| unreachable!("self-loops excluded above"));

        let TerminatorKind::SwitchInt(switch) = &mut block.terminator.kind else {
            unreachable!("we're simplifying a SwitchInt")
        };

        let TerminatorKind::Goto(goto) = target_block.terminator.kind else {
            unreachable!("promotion candidates are Goto blocks")
        };

        switch.targets.targets_mut()[target_index] = goto.target;

        // Note: We don't mark the target as unreachable here because other switch arms
        // may still reference it.
    }

    // for (target_index, target, _) in promotion_switch {
    // We know from the previous step that:
    // 1. The terminator is switch int
    // 2. The target is not ourselves (disjoint)
    // 3. The target is not the otherwise branch
    // 4. Both the source (us) and the target do not have an otherwise branch.

    // This is a bit more complicated, than the goto case, because to make it work we need
    // to fold the discriminant, which means adding some new statments.
    // δ = v == j
    // idx = (1 - δ)*v + δ*(|N| + r)
    //     = 1v + -δv + δ|N| + δr
    //     = v + δ*(-v + |N| + r)
    //     = v + δ*(|N| - v + r)
    // This optimization requires access to: `BinOp::Sub`, `BinOp::Add`, `BinOp::Mul`, which
    // aren't yet available.
    // see: https://linear.app/hash/issue/BE-219/hashql-implement-switchint-simplification
    // }

    true
}

/// Dispatches to the appropriate simplification based on terminator kind.
///
/// After a successful simplification, marks any newly unreachable blocks as dead.
/// Returns `true` if any simplification was applied.
fn simplify<'heap, A: BumpAllocator>(
    context: &mut MirContext<'_, 'heap>,
    body: &mut Body<'heap>,
    id: BasicBlockId,
    alloc: &A,
) -> bool {
    let kind = &body.basic_blocks[id].terminator.kind;
    match kind {
        &TerminatorKind::Goto(_) | TerminatorKind::SwitchInt(_) => {}
        TerminatorKind::Return(_) | TerminatorKind::GraphRead(_) | TerminatorKind::Unreachable => {
            return false;
        }
    }

    // Snapshot reachable blocks before modification to detect newly dead blocks.
    // This is done *after* we check the terminator, to ensure that we don't recompute postorder
    // if we don't need to.
    let previous_reverse_postorder = body.basic_blocks.reverse_postorder().transfer_into(alloc);

    let changed = match kind {
        &TerminatorKind::Goto(goto) => simplify_goto(body, id, goto),
        TerminatorKind::SwitchInt(_) => simplify_switch_int(context, body, id),
        TerminatorKind::Return(_) | TerminatorKind::GraphRead(_) | TerminatorKind::Unreachable => {
            unreachable!()
        }
    };

    if changed {
        mark_dead_blocks(body, previous_reverse_postorder, alloc);
    }

    changed
}

/// Marks blocks that became unreachable after a simplification.
///
/// Compares the current reachable blocks (via reverse postorder) against the snapshot taken
/// before simplification. Any block that was previously reachable but is no longer in the
/// traversal is marked with an `Unreachable` terminator.
///
/// This enables cascading optimizations: marking a block dead removes it from predecessor
/// counts, potentially allowing previously blocked merges to proceed.
fn mark_dead_blocks<A: BumpAllocator>(
    body: &mut Body<'_>,
    previous_reverse_postorder: &[BasicBlockId],
    alloc: &A,
) {
    let mut reverse_postorder = fast_hash_set_with_capacity_in(body.basic_blocks.len(), alloc);

    #[expect(unsafe_code)]
    for &block in body.basic_blocks.reverse_postorder() {
        // SAFETY: Reverse postorder contains each block at most once.
        unsafe {
            reverse_postorder.insert_unique_unchecked(block);
        }
    }

    // Mark blocks that disappeared from the reachable set.
    for &block in previous_reverse_postorder {
        if !reverse_postorder.contains(&block) {
            body.basic_blocks.as_mut()[block].terminator.kind = TerminatorKind::Unreachable;
        }
    }
}

/// Control-flow graph simplification pass.
///
/// Simplifies the CFG by merging blocks, constant-folding switches, and eliminating dead blocks.
pub struct CfgSimplify<A: BumpAllocator = Scratch> {
    alloc: A,
}

impl CfgSimplify {
    /// Creates a new instance of the control-flow graph simplification pass.
    #[must_use]
    pub fn new() -> Self {
        Self {
            alloc: Scratch::new(),
        }
    }
}

impl<A: BumpAllocator> CfgSimplify<A> {
    #[must_use]
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }

    fn simplify<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        body: &mut Body<'heap>,
        id: BasicBlockId,
    ) -> bool {
        self.alloc
            .scoped(|alloc| simplify(context, body, id, &alloc))
    }
}

impl Default for CfgSimplify {
    fn default() -> Self {
        Self::new()
    }
}

impl<'env, 'heap, A: BumpAllocator> TransformPass<'env, 'heap> for CfgSimplify<A> {
    /// Runs the CFG simplification pass on the given body.
    ///
    /// Uses a worklist algorithm that processes blocks in reverse postorder and re-enqueues
    /// predecessors when changes occur. This ensures optimization opportunities propagate
    /// backward through the CFG until a fixed point is reached.
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        let mut queue = WorkQueue::new(body.basic_blocks.len());
        let mut changed = false;

        // Process in reverse of reverse-postorder (i.e., roughly postorder) to handle
        // successors before predecessors, maximizing optimization opportunities.
        queue.extend(body.basic_blocks.reverse_postorder().iter().copied().rev());

        while let Some(block) = queue.dequeue() {
            let mut simplified = false;

            // Repeatedly simplify until no more changes—catches cascading opportunities
            // like SwitchInt → Goto → inline.
            loop {
                if !self.simplify(context, body, block) {
                    break;
                }

                simplified = true;
            }

            changed |= simplified;
            if !simplified {
                continue;
            }

            // Notify predecessors that this block changed; they may have new opportunities.
            for pred in body.basic_blocks.predecessors(block) {
                queue.enqueue(pred);
            }
        }

        if !changed {
            // We haven't made any changes, meaning that we can skip further analysis, as no blocks
            // will be made unreachable, and SSA won't be violated.
            return Changed::No;
        }

        // Unreachable blocks will be dead, therefore must be removed
        let _: Changed = self
            .alloc
            .scoped(|alloc| DeadBlockElimination::new_in(alloc).run(context, body));

        // Simplifications may break SSA (e.g., merged blocks with conflicting definitions).
        let _: Changed = self
            .alloc
            .scoped(|alloc| SsaRepair::new_in(alloc).run(context, body));

        // We ignore the changed of the sub-passes above, because we **know** that we already
        // modified, if they don't doesn't matter.

        changed.into()
    }
}
