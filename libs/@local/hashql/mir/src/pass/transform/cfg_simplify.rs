use core::{convert::Infallible, iter::ExactSizeIterator as _, mem, ops::ControlFlow};

use hashql_core::{
    collections::{TinyVec, WorkQueue},
    graph::{Predecessors as _, Traverse as _},
    intern::Interned,
};

use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        local::Local,
        location::Location,
        place::Place,
        rvalue::RValue,
        statement::{Assign, Statement, StatementKind},
        terminator::{Goto, Terminator, TerminatorKind},
    },
    context::MirContext,
    intern::Interner,
    visit::{Visitor, VisitorMut, r#mut::filter::Deep},
};

pub struct CfgSimplify {
    queue: WorkQueue<BasicBlockId>,
}

impl CfgSimplify {
    fn is_noop(block: &BasicBlock<'_>) -> bool {
        block
            .statements
            .iter()
            .all(|statement| matches!(statement.kind, StatementKind::Nop))
    }

    fn simplify_goto<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
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
        &mut self,
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

        if switch.targets.values().is_empty()
            && let Some(otherwise) = switch.targets.otherwise()
        {
            // We only have an otherwise present, degenerate to a goto, re-queue and retry again
            body.basic_blocks.as_mut()[id].terminator.kind =
                TerminatorKind::Goto(Goto { target: otherwise });

            // We have changed the CFG, requeue the predecessors as well, as they might have changes
            // as well.
            return true;
        }

        // We act as a goto with multiple predecessors in what we can inline, this is because any
        // further inlining would change the code execution order (as code would be executed before
        // reaching the SwitchInt). We do each optimization on each target.
        for &target in switch.targets.targets() {
            // Check the target if it is eligible for promotion. As a single branch acts as a goto
            // statement, many of the same promotion rules apply. These are:
            // 1. Only promote if the body is empty
            // 2. If we have any arguments, we must ensure that the arguments are:
            //  1. rebound to new names inside of the terminator
            //  2. none of the parameters are live-out, aka are only used inside of the successor
            //     block
            // We only inline two types of blocks:
            // 1. SwitchInt, through SwitchInt inlining, which re-targets values.
            // 2. Goto.

            // goto is less mechanical, because we don't need to recompute extra things

            // We can inline without re-targeting (and always without live-out analysis iff we're
            // the only predecessor, as we still retain SSA properties).

            let target_block = &body.basic_blocks[target.block];

            if !Self::is_noop(target_block) {
                continue;
            }

            match &target_block.terminator.kind {
                TerminatorKind::Goto(_) => {}
                TerminatorKind::SwitchInt(_) => {}
                TerminatorKind::Return(_)
                | TerminatorKind::GraphRead(_)
                | TerminatorKind::Unreachable => continue,
            }

            let predecessor_len = body.basic_blocks.predecessors(target.block).len();
            if predecessor_len > 0 {
                // We need to do live-out analysis (and rename) to ensure that any variables that
                // are mentioned are really eligible without breaking SSA.
                // In the future breaking SSA may be valid, if we have an SSA repair function.
            }
        }

        todo!()
    }

    fn simplify<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        body: &mut Body<'heap>,
        id: BasicBlockId,
    ) -> bool {
        // Check the type of the terminator, we're only able to simplify Goto and SwitchInt
        match &body.basic_blocks[id].terminator.kind {
            &TerminatorKind::Goto(goto) => self.simplify_goto(context, body, id, goto),
            TerminatorKind::SwitchInt(_) => self.simplify_switch_int(context, body, id),
            TerminatorKind::Return(_)
            | TerminatorKind::GraphRead(_)
            | TerminatorKind::Unreachable => false,
        }

        // The algorithm proposed here allows for loops, which are currently not possible, but may
        // be in the future.
        // It works in the following way:
        // 1. Enqueue in post-order for the first pass, meaning that successors are before ancestors
        // 2. Run through the queue, simplify each block
        // 3. Enqueue the block's predecessors if something has changed, indicating that we have
        //    made progress
        // 4. Run until we have reached a fixed point (queue is empty)

        // How does CFG simplify work?
        // 1. GOTO:
        //  1. If the successor block has no statements (or no-ops), assume the terminator of the
        //     successor block.
        //  2. If the successor block has statements, and we're the **only** ancestor of the
        //     successor block, fold any statements into our block, and assume the terminator of the
        //     successor block.
        // 2. SwitchInt: Only work if the successor block has no statements
        //  1. If the successor block is a goto, re-target the SwitchInt to that target
        //  2. If the successor block is a SwitchInt, re-target the SwitchInt

        // How does the retargeting work?
        // Given a nested SwitchInt statement, we can retarget using the following equation:
        // let N be the outer SwitchInt
        // let M be the inner SwitchInt at N(j)
        // let v be the currently chosen location

        // δ = v == j
        // idx = (1 - δ)*v + δ*(|N| + r)
        //     = 1v + -δv + δ|N| + δr
        //     = v + δ*(-v + |N| + r)
        //     = v + δ*(|N| - v + r)
    }

    fn setup<'heap>(&mut self, context: &mut MirContext<'_, 'heap>, body: &mut Body<'heap>) {
        self.queue
            .extend(body.basic_blocks.reverse_postorder().iter().copied().rev());

        while let Some(block) = self.queue.dequeue() {
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
                self.queue.enqueue(pred);
            }
        }
    }
}
