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

struct FindLocal<'local> {
    locals: &'local [Local],
}

impl Visitor<'_> for FindLocal<'_> {
    type Result = ControlFlow<(), ()>;

    fn visit_local(&mut self, _: Location, local: Local) -> Self::Result {
        if self.locals.contains(&local) {
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    }
}

struct ReplaceLocals<'local, 'heap> {
    source: &'local [Local],
    replacements: &'local [Local],
    interner: &'local Interner<'heap>,
}

impl<'heap> VisitorMut<'heap> for ReplaceLocals<'_, 'heap> {
    type Filter = Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn visit_basic_block_params(
        &mut self,
        _: Location,
        _: &mut Interned<'heap, [Local]>,
    ) -> Self::Result<()> {
        // We do not walk params, as they are immediately discarded, allows us to save on interning
        Ok(())
    }

    fn visit_local(&mut self, _: Location, local: &mut Local) -> Self::Result<()> {
        let needle = *local;

        let Some(position) = self.source.iter().position(|&source| source == needle) else {
            return Ok(());
        };

        let replacement = self.replacements[position];
        *local = replacement;
        Ok(())
    }
}

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

        // check the predecessors of the successor
        let target_predecessors_len = body.basic_blocks.predecessors(goto.target.block).len();

        match target_predecessors_len {
            0 => unreachable!(),
            1 => {
                // We're the single predecessor, we can assume the whole contents of it. It's safe
                // for us to just assign the SSA variables given directly, as we're the only
                // predecessor, and therefore are the only way to reach these block params.
                let [block, target] = body
                    .basic_blocks
                    .as_mut()
                    .get_disjoint_mut([id, goto.target.block])
                    .unwrap_or_else(|_err| unreachable!("we just verified that they're disjoint"));

                debug_assert_eq!(target.params.len(), goto.target.args.len()); // sanity check
                let block_terminator_span = block.terminator.span;

                for (&param, &arg) in target.params.iter().zip(goto.target.args.iter()) {
                    block.statements.push(Statement {
                        span: block_terminator_span,
                        kind: StatementKind::Assign(Assign {
                            lhs: Place::local(param, context.interner),
                            rhs: RValue::Load(arg),
                        }),
                    });
                }

                block.statements.append(&mut target.statements);

                // Remove any parameters from the block as they are no longer used, otherwise we
                // would violate the SSA property, essentially we're creating an unreachable empty
                // block.
                target.params = context.interner.locals.intern_slice(&[]);

                // Replacing with unreachable is correct here, because the basic block we've
                // "stolen" the instructions from is now unreachable.
                let kind = mem::replace(&mut target.terminator.kind, TerminatorKind::Unreachable);
                block.terminator = Terminator {
                    span: target.terminator.span,
                    kind,
                };

                true
            }
            _ => {
                // There are multiple predecessors, we can only re-target if the successor block has
                // no statements (or is a no-op)
                let target = &body.basic_blocks[goto.target.block];

                if !Self::is_noop(target) {
                    // We cannot simplify, because multiple blocks depend on the value (leading to
                    // value duplication) and we cannot re-target the successor block without
                    // removing logic, which would be unsound.
                    return false;
                }

                // In case the target is empty, the replacement is trivial, we simply replace the
                // terminator block, no other operations need to be performed.
                if target.params.is_empty() {
                    let [block, target] = body
                        .basic_blocks
                        .as_mut()
                        .get_disjoint_mut([id, goto.target.block])
                        .expect("we have verified previously that they're not the same");

                    block.terminator = target.terminator.clone();
                    return true;
                }

                // If there are parameters associated with this operation, it becomes more
                // complicated. Parameters passed may be live-out. This means that
                // they are used *after* this block. This becomes a problem down the
                // line, if we were to assign the parameter just like that in the block we would
                // break SSA, multiple places would define the same variable multiple times.
                // To be able to do this, we would first need an SSA repair step / updater, which
                // pushes down these operations down. Even in that case this operation would still
                // be unsafe.
                //
                // There is an easy version that is still safe, if the variable is just live inside
                // of the body of the basic block we can still continue, albeit that every name
                // would require rebinding (otherwise we would break SSA).
                //
                // This is an easy optimization option, and goes hand in hand with a future SSA
                // updater / repair step.
                let mut bfs = body
                    .basic_blocks
                    .breadth_first_traversal([goto.target.block]);

                let first = bfs.next();
                debug_assert_eq!(first, Some(goto.target.block)); // Skip the first block, as we're only interested in it's successors

                let mut find_local = FindLocal {
                    locals: &target.params,
                };
                if bfs.any(|block| {
                    find_local
                        .visit_basic_block(block, &body.basic_blocks[block])
                        .is_break()
                }) {
                    // The value is used inside of a block, that is not the target, therefore it's
                    // live-out and the local is *not* safe to inline.
                    return false;
                }
                drop(bfs);

                let replacements: TinyVec<_> = target
                    .params
                    .iter()
                    .map(|&target| {
                        let decl = body.local_decls[target];

                        body.local_decls.push(decl)
                    })
                    .collect();

                // We're not the only one, so we cannot consume the target (aka `mem::take` it),
                // instead we need to clone here
                let mut terminator = target.terminator.clone();

                let mut replace_local = ReplaceLocals {
                    source: &target.params,
                    replacements: &replacements,
                    interner: context.interner,
                };
                let Ok(()) = replace_local.visit_terminator(
                    Location {
                        block: goto.target.block,
                        // + 2 to account for the params and the terminator
                        statement_index: target.statements.len() + 2,
                    },
                    &mut terminator,
                );

                // We have successfully replaced all the local variables in the block with the new
                // variables

                debug_assert_eq!(target.params.len(), goto.target.args.len()); // sanity check

                // Now that we have verified everything, assign the values given into the block with
                // ours and append the terminator
                let block = &mut body.basic_blocks.as_mut()[id];
                let block_terminator_span = block.terminator.span;

                // This is safe, because we just replaced all the local variables in the block with
                // the new variables, therefore not breaking SSA
                for (&param, &args) in replacements.iter().zip(goto.target.args) {
                    block.statements.push(Statement {
                        span: block_terminator_span,
                        kind: StatementKind::Assign(Assign {
                            lhs: Place::local(param, context.interner),
                            rhs: RValue::Load(args),
                        }),
                    });
                }

                block.terminator = terminator;

                // Now that we've changed the target block we need to not only notify our parents
                // (which is done through the simplify loop). We also need to notify any
                // predecessors from target – this is because they may benefit from
                // any of the changes we've done (such as further inlining) – see the previous match
                // arm.
                // We do not need to filter for ourselves, because we're no longer a predecessor of
                // the target block.
                self.queue
                    .extend(body.basic_blocks.predecessors(goto.target.block));

                true
            }
        }
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
