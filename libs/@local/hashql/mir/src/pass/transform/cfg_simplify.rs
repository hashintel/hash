use core::{iter::ExactSizeIterator as _, mem};

use hashql_core::{
    collections::{FastHashSet, WorkQueue},
    graph::Predecessors as _,
};

use super::ssa_repair::SsaRepairPass;
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
    pass::Pass,
};

pub struct CfgSimplify {
    previous_reverse_postorder: Vec<BasicBlockId>,
    reverse_postorder: FastHashSet<BasicBlockId>,
}

impl CfgSimplify {
    fn is_noop(block: &BasicBlock<'_>) -> bool {
        block
            .statements
            .iter()
            .all(|statement| matches!(statement.kind, StatementKind::Nop))
    }

    fn simplify_goto<'heap>(
        context: &MirContext<'_, 'heap>,
        body: &mut Body<'heap>,
        id: BasicBlockId,
        goto: Goto<'heap>,
    ) -> bool {
        // There are two scenarios in which we simplify:
        // 1. The successor block has no statements (or just no-ops), in this case we just assume
        //    the terminator of said block.
        // 2. The successor block has a single predecessor, in this case we can merge the blocks,
        //    important is that we need to also add an assignment to the argument of said blocks to
        //    the ones chosen by the target. We assume the successor block terminator as the
        //    terminator.
        // 3. Self loops are excluded, as they (logically) cannot be simplified

        // self loops cannot be optimized
        if goto.target.block == id {
            return false;
        }

        // Check the amount of predecessors of the successor block, depending on the amount we can
        // do more optimizations.
        let target_predecessors_len = body.basic_blocks.predecessors(goto.target.block).len();

        // We do not need to worry about breaking SSA, as we invoke SSA repair pass after this.
        // In the case of multiple predecessors, we must first check if the target block is a nop,
        // if it isn't we cannot easily merge it. This is because otherwise we would be creating
        // statement duplication. Which is unintended, and might lead to excessive inflation of
        // statements.
        if target_predecessors_len > 1 && !Self::is_noop(&body.basic_blocks[goto.target.block]) {
            // We cannot simplify, because multiple blocks depend on the value, therefore leading to
            // duplication.
            return false;
        }

        let [block, target] = body
            .basic_blocks
            .as_mut()
            .get_disjoint_mut([id, goto.target.block])
            .unwrap_or_else(|_err| {
                unreachable!("self loops are not possible per previous statement")
            });

        // We do not need to worry about keeping the SSA invariants here, because we run the SSA
        // repair pass afterwards.

        // The subsumption is very straightforward, we simply:

        // 1. Assign the SSA variables their values from the predecessor block. This must happen
        //    before any statements are moved, so we don't have any use before def.
        debug_assert_eq!(target.params.len(), goto.target.args.len());
        for (&param, &args) in target.params.iter().zip(goto.target.args) {
            block.statements.push(Statement {
                span: block.terminator.span,
                kind: StatementKind::Assign(Assign {
                    lhs: Place::local(param, context.interner),
                    rhs: RValue::Load(args),
                }),
            });
        }

        // 2. Move all statements from the target block into the current block. We do this via
        //    draining. This is safe, because in the case of multiple predecessors we check that the
        //    target block is empty of statements or full of nops. Moving the nops from one block to
        //    another doesn't change any of the invariants.
        block.statements.append(&mut target.statements);

        // 3. Replace the terminator with the target block's terminator, depending on the amount of
        //    predecessors, we either need to clone, or can simply take the target block's
        //    terminator.
        block.terminator = if target_predecessors_len == 1 {
            let src = Terminator::unreachable(target.terminator.span);

            mem::replace(&mut target.terminator, src)
        } else {
            target.terminator.clone()
        };

        true
    }

    fn simplify_switch_int<'heap>(
        context: &mut MirContext<'_, 'heap>,
        body: &mut Body<'heap>,
        id: BasicBlockId,
    ) -> bool {
        // SwitchInt is very similar to any optimization that we're doing on a goto, except that we
        // do not inline, only re-point, this is because we always have multiple statements inside
        // of a switch target.
        // Except in the case that the SwitchInt is just an otherwise with no other cases, in this
        // case we degenerate to a goto, requeue and retry again.
        let terminator = &body.basic_blocks[id].terminator;
        let TerminatorKind::SwitchInt(switch) = &terminator.kind else {
            unreachable!()
        };

        // If the discriminant is an integer constant, take the value (or otherwise). We issue an
        // ICE in the case that the discriminant is not one of the switch targets. As this would be
        // a violation of the invariants provided by the compiler.
        if let Operand::Constant(Constant::Int(int)) = switch.discriminant {
            let discriminant = int.as_uint();

            if let Some(index) = switch
                .targets
                .values()
                .iter()
                .position(|&value| value == discriminant)
            {
                let target = switch.targets.targets()[index];
                body.basic_blocks.as_mut()[id].terminator.kind =
                    TerminatorKind::Goto(Goto { target });

                return true;
            }

            if let Some(otherwise) = switch.targets.otherwise() {
                body.basic_blocks.as_mut()[id].terminator.kind =
                    TerminatorKind::Goto(Goto { target: otherwise });

                return true;
            }

            // TODO: issue diagnostic (as ICE), and move to unreachable
            body.basic_blocks.as_mut()[id].terminator.kind = TerminatorKind::Unreachable;
            return true;
        }

        // In the case that *every* target is the same, we can degenerate to a goto
        if switch
            .targets
            .targets()
            .array_windows()
            .all(|[lhs, rhs]| lhs == rhs)
        {
            let target = switch.targets.targets()[0];

            // We can de-generate to a goto
            body.basic_blocks.as_mut()[id].terminator.kind = TerminatorKind::Goto(Goto { target });

            return true;
        }

        // If there is only a single otherwise target, we can also de-generate to a goto
        if switch.targets.values().is_empty()
            && let Some(otherwise) = switch.targets.otherwise()
        {
            body.basic_blocks.as_mut()[id].terminator.kind =
                TerminatorKind::Goto(Goto { target: otherwise });

            return true;
        }

        // If we have an otherwise target, remove any discriminant that points to the same target
        if let Some(otherwise) = switch.targets.otherwise() {
            let mut values = Vec::new();

            for (value, target) in switch.targets.iter() {
                if target == otherwise {
                    values.push(value);
                }
            }

            if !values.is_empty() {
                let TerminatorKind::SwitchInt(switch) =
                    &mut body.basic_blocks.as_mut()[id].terminator.kind
                else {
                    unreachable!()
                };

                for target in values {
                    switch.targets.remove_target(target);
                }

                return true;
            }
        }

        // There are only some other cases in which we can inline. All of these are only possible
        // iff the successor block is empty. This is because otherwise we would change execution
        // order, as we would need to move code into a different execution path. Which is in most
        // cases unsound.

        // In the large majority of cases, there are no targets that we can promote/inline.
        // Therefore we first do a quick scan to check if there is the possibility of promotion. If
        // that is not the case, we return early.
        let target_len = switch.targets.targets().len();

        // We don't use `InlineVec` or similar here, because it doesn't make sense – most of the
        // time they are going to be empty.
        let mut promotion_goto = Vec::new();

        // To circumvent borrowing rules, and rule out modifications in most cases, we first check
        // if any modification is even needed. If that is not the case, we return early.
        for (index, &target) in switch.targets.targets().iter().enumerate() {
            let is_last = index == target_len - 1;
            let is_otherwise = switch.targets.has_otherwise() && is_last;

            // We cannot promote a goto or target to ourselves (aka self loops).
            if target.block == id {
                continue;
            }

            let target_block = &body.basic_blocks[target.block];

            if !Self::is_noop(target_block) {
                continue;
            }

            match &target_block.terminator.kind {
                TerminatorKind::Goto(_) => {
                    promotion_goto.push((index, target));
                }
                // We can only promote a SwitchInt that isn't otherwise, and whenever the switch
                // doesn't have an otherwise branch (both the target and the source).
                // Otherwise we would create incorrect otherwise branches.
                TerminatorKind::SwitchInt(target_switch)
                    if !is_otherwise
                        && !switch.targets.has_otherwise()
                        && !target_switch.targets.has_otherwise() =>
                {
                    // This optimization is not yet implemented.
                    // see: https://linear.app/hash/issue/BE-219/hashql-implement-switchint-simplification
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

        // We go over each eligible target that can be promoted.
        for (target_index, target) in promotion_goto {
            // We know from the previous step that:
            // 1. The terminator is goto
            // 2. The target is not ourselves (disjoint)

            let [block, target] = body
                .basic_blocks
                .as_mut()
                .get_disjoint_mut([id, target.block])
                .unwrap_or_else(|_err| {
                    unreachable!("previous step has verified that these two are distinct")
                });

            let TerminatorKind::SwitchInt(switch) = &mut block.terminator.kind else {
                unreachable!("previous step has verified that the terminator is a switch int")
            };

            let TerminatorKind::Goto(goto) = target.terminator.kind else {
                unreachable!("previous step has verified that the terminator is a goto")
            };

            switch.targets.targets_mut()[target_index] = goto.target;

            // We cannot just take the target, and set it unreachable, because multiple switch
            // targets may point to it.
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

    fn simplify<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        body: &mut Body<'heap>,
        id: BasicBlockId,
    ) -> bool {
        // save the current reverse postorder
        self.previous_reverse_postorder.clear();
        self.previous_reverse_postorder
            .extend_from_slice(body.basic_blocks.reverse_postorder());

        // Check the type of the terminator, we're only able to simplify Goto and SwitchInt
        let changed = match &body.basic_blocks[id].terminator.kind {
            &TerminatorKind::Goto(goto) => Self::simplify_goto(context, body, id, goto),
            TerminatorKind::SwitchInt(_) => Self::simplify_switch_int(context, body, id),
            TerminatorKind::Return(_)
            | TerminatorKind::GraphRead(_)
            | TerminatorKind::Unreachable => false,
        };

        if changed {
            self.mark_dead_blocks(body);
        }

        changed
    }

    fn mark_dead_blocks(&mut self, body: &mut Body<'_>) {
        // We mark dead blocks as unreachable. We do this to allow for more optimizations. This is
        // done by moving the terminator to unreachable. Another pass (dead block elimination)
        // compacts the graph to then remove the dead blocks.

        // Given that we know that the reverse postorder is unique, we can use unchecked here
        let reverse_postorder = body.basic_blocks.reverse_postorder();
        self.reverse_postorder.clear();
        self.reverse_postorder.reserve(reverse_postorder.len());

        #[expect(unsafe_code)]
        for &block in reverse_postorder {
            // SAFETY: Reverse postorder is unique
            unsafe {
                self.reverse_postorder.insert_unique_unchecked(block);
            }
        }

        // Check if there are any blocks, which have changed
        for block in self.previous_reverse_postorder.drain(..) {
            if !self.reverse_postorder.contains(&block) {
                body.basic_blocks.as_mut()[block].terminator.kind = TerminatorKind::Unreachable;
            }
        }
    }
}

impl<'env, 'heap> Pass<'env, 'heap> for CfgSimplify {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        let mut queue = WorkQueue::new(body.basic_blocks.len());
        queue.extend(body.basic_blocks.reverse_postorder().iter().copied().rev());

        while let Some(block) = queue.dequeue() {
            let mut simplified = false;

            // re-run multiple times to potentially catch multiple simplifications
            while self.simplify(context, body, block) {
                simplified = true;
            }

            if !simplified {
                // We couldn't simplify so we don't need to enqueue the predecessors to notify
                continue;
            }

            // Enqueue the predecessors to notify them of the change
            // This is the heart of our fixed-point iteration algorithm which is resistant against
            // loops. We simply simplify until there are no more changes.
            for pred in body.basic_blocks.predecessors(block) {
                queue.enqueue(pred);
            }
        }

        // Some of the optimizations may break SSA, therefore we need to repair it
        SsaRepairPass.run(context, body);
    }
}
