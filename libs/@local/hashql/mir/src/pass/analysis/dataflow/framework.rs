use std::alloc::{Allocator, Global};

use hashql_core::{collections::WorkQueue, id::IdVec};

use super::lattice::{BoundedJoinSemiLattice, HasBottom, JoinSemiLattice};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        local::Local,
        location::Location,
        operand::Operand,
        statement::Statement,
        terminator::{
            Goto, GraphRead, SwitchInt, SwitchIntValue, SwitchTargets, Terminator, TerminatorKind,
        },
    },
    context::MirContext,
    pass::simplify_type_name,
};

pub enum Direction {
    Forward,
    Backward,
}

pub trait DataflowAnalysis<'heap> {
    type Domain<A: Allocator>: Clone;
    type Lattice<A: Allocator>: BoundedJoinSemiLattice<Self::Domain<A>>;
    type SwitchIntData = !;

    const DIRECTION: Direction = Direction::Forward;

    /// Returns a human-readable name for this pass.
    ///
    /// The default implementation extracts the type name without module path or generic
    /// parameters. Override this method to provide a custom name.
    fn name(&self) -> &'static str {
        const { simplify_type_name(core::any::type_name::<Self>()) }
    }

    fn lattice_in<A: Allocator>(&self, body: &Body<'heap>, alloc: A) -> Self::Lattice<A>;
    fn initialize_start<A: Allocator>(&self, body: &Body<'heap>, domain: &mut Self::Domain<A>);

    fn switch_int_data(
        &self,
        block: BasicBlockId,
        discriminant: &Operand<'heap>,
    ) -> Option<Self::SwitchIntData> {
        None
    }

    fn apply_switch_int_edge_effect<A: Allocator>(
        &self,
        targets: &SwitchTargets,
        value: SwitchIntValue,
        state: &mut Self::Domain<A>,
        data: &mut Self::SwitchIntData,
    ) {
        unreachable!();
    }

    fn transfer_statement<A: Allocator>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
        state: &mut Self::Domain<A>,
    ) {
    }

    fn transfer_terminator<A: Allocator>(
        &self,
        location: Location,
        terminator: &Terminator<'heap>,
        state: &mut Self::Domain<A>,
    ) {
    }

    fn transfer_edge<A: Allocator>(
        &self,
        block: BasicBlockId,
        params: &[Local],

        from: BasicBlockId,
        args: &[Operand<'heap>],

        state: &mut Self::Domain<A>,
    ) {
    }

    fn iterate_to_fixpoint_in<A>(
        &mut self,
        body: &Body<'heap>,
        context: &mut MirContext<'_, 'heap>,
        alloc: A,
    ) where
        A: Allocator + Clone,
    {
        let lattice = self.lattice_in(body, alloc.clone());
        let mut states = IdVec::from_fn_in(
            body.basic_blocks.len(),
            |_: BasicBlockId| lattice.bottom(),
            alloc.clone(),
        );
        self.initialize_start(body, &mut states[BasicBlockId::START]);

        let mut queue = WorkQueue::new_in(body.basic_blocks.len(), alloc);

        match Self::DIRECTION {
            Direction::Forward => {
                queue.extend(body.basic_blocks.reverse_postorder().iter().copied());
            }
            Direction::Backward => {
                queue.extend(body.basic_blocks.reverse_postorder().iter().copied().rev());
            }
        }

        // We're reusing it here, so that in the case of a bitset (the most common case) we don't
        // actually need to re-allocate every iteration.
        let mut state = lattice.bottom();
        while let Some(bb) = queue.dequeue() {
            state.clone_from(&states[bb]);
        }
    }

    fn iterate_to_fixpoint(&mut self, body: &Body<'heap>, context: &mut MirContext<'_, 'heap>) {
        self.iterate_to_fixpoint_in(body, context, Global);
    }
}

struct Driver<'analysis, 'mir, 'env, 'heap, D: DataflowAnalysis<'heap>, A: Allocator, F> {
    analysis: &'analysis D,
    lattice: &'analysis D::Lattice<A>,
    context: &'mir mut MirContext<'env, 'heap>,
    alloc: A,

    body: &'analysis Body<'heap>,
    state: &'analysis mut D::Domain<A>,

    id: BasicBlockId,
    block: &'analysis BasicBlock<'heap>,

    propagate: F,
}

impl<'heap, D: DataflowAnalysis<'heap>, A: Allocator, F: FnMut(BasicBlockId, &D::Domain<A>)>
    Driver<'_, '_, '_, 'heap, D, A, F>
{
    fn forward(self) {
        let Self {
            analysis,
            lattice,
            context: _,
            alloc: _,
            body,
            state,
            id,
            block,
            mut propagate,
        } = self;

        for (index, statement) in block.statements.iter().enumerate() {
            let location = Location {
                block: id,
                statement_index: index + 1, // `0` are the params
            };

            analysis.transfer_statement(location, statement, state);
        }

        let location = Location {
            block: id,
            statement_index: block.statements.len() + 1, // 0 is always the head, so `+1`
        };

        analysis.transfer_terminator(location, &block.terminator, state);

        let exit_state = state;
        match &block.terminator.kind {
            TerminatorKind::Goto(Goto { target }) => {
                let target_block = &body.basic_blocks[target.block];

                analysis.transfer_edge(
                    target.block,
                    &target_block.params,
                    id,
                    &target.args,
                    exit_state,
                );

                propagate(target.block, exit_state);
            }
            &TerminatorKind::GraphRead(GraphRead {
                head: _,
                body: _,
                tail: _,
                target,
            }) => {
                let target_block = &body.basic_blocks[target];

                analysis.transfer_edge(target, &target_block.params, id, &target.args, exit_state);

                propagate(target, exit_state);
            }
            TerminatorKind::SwitchInt(SwitchInt {
                discriminant,
                targets,
            }) => {
                if let Some(mut data) = analysis.switch_int_data(id, discriminant) {
                    let mut switch_data = lattice.bottom();
                    for (value, target) in targets.iter() {
                        switch_data.clone_from(exit_state);
                        analysis.apply_switch_int_edge_effect(
                            targets,
                            SwitchIntValue::Direct(value),
                            &mut switch_data,
                            &mut data,
                        );

                        let target_block = &body.basic_blocks[target.block];
                        analysis.transfer_edge(
                            target.block,
                            &target_block.params,
                            id,
                            &target.args,
                            &mut switch_data,
                        );

                        propagate(target.block, &switch_data);
                    }

                    if let Some(otherwise) = targets.otherwise() {
                        // We can just use `exit_state` here, because we don't need to preserve it
                        analysis.apply_switch_int_edge_effect(
                            targets,
                            SwitchIntValue::Otherwise,
                            exit_state,
                            &mut data,
                        );

                        let target_block = &body.basic_blocks[otherwise.block];
                        analysis.transfer_edge(
                            otherwise.block,
                            &target_block.params,
                            id,
                            &otherwise.args,
                            exit_state,
                        );

                        propagate(otherwise.block, exit_state);
                    }
                } else {
                    let mut switch_data = lattice.bottom();
                    for &target in targets.targets() {
                        switch_data.clone_from(exit_state);

                        let target_block = &body.basic_blocks[target.block];
                        analysis.transfer_edge(
                            target.block,
                            &target_block.params,
                            id,
                            &target.args,
                            &mut switch_data,
                        );

                        propagate(target.block, &switch_data);
                    }
                }
            }
            TerminatorKind::Return(_) | TerminatorKind::Unreachable => {}
        }
    }
}

fn iterate_backward<'heap, D, A>(
    analysis: &D,
    context: &mut MirContext<'_, 'heap>,
    alloc: A,

    body: &Body<'heap>,
    state: &mut D::Domain<A>,

    id: BasicBlockId,
    block: &BasicBlock<'heap>,
) where
    D: DataflowAnalysis<'heap>,
    A: Allocator + Clone,
{
    let location = Location {
        block: id,
        statement_index: block.statements.len() + 1, // 0 is always the head, so `+1`
    };

    analysis.transfer_terminator(location, &block.terminator, state);

    for (index, statement) in block.statements.iter().enumerate().rev() {
        let location = Location {
            block: id,
            statement_index: index + 1, // `0` are the params
        };

        analysis.transfer_statement(location, statement, state);
    }

    // join from all predecessors(?)
}
