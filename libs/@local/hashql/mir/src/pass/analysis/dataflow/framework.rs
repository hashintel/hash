use alloc::alloc::Global;
use core::alloc::Allocator;

use hashql_core::{collections::WorkQueue, graph::Predecessors as _, id::IdVec};

use super::lattice::{BoundedJoinSemiLattice, HasBottom as _, JoinSemiLattice as _};
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
    fn initialize_boundary<A: Allocator>(&self, body: &Body<'heap>, domain: &mut Self::Domain<A>);

    #[expect(unused_variables, reason = "trait definition")]
    fn switch_int_data(
        &self,
        block: BasicBlockId,
        discriminant: &Operand<'heap>,
    ) -> Option<Self::SwitchIntData> {
        None
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn apply_switch_int_edge_effect<A: Allocator>(
        &self,
        targets: &SwitchTargets,
        value: SwitchIntValue,
        state: &mut Self::Domain<A>,
        data: &mut Self::SwitchIntData,
    ) {
        unreachable!();
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn transfer_statement<A: Allocator>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
        state: &mut Self::Domain<A>,
    ) {
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn transfer_terminator<A: Allocator>(
        &self,
        location: Location,
        terminator: &Terminator<'heap>,
        state: &mut Self::Domain<A>,
    ) {
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn transfer_edge<A: Allocator>(
        &self,
        source_block: BasicBlockId,
        source_args: &[Operand<'heap>],

        target_block: BasicBlockId,
        target_params: &[Local],

        state: &mut Self::Domain<A>,
    ) {
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn transfer_graph_read_edge<A: Allocator>(
        &self,
        source_block: BasicBlockId,

        target_block: BasicBlockId,
        target_params: &[Local],

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

        let mut queue = WorkQueue::new_in(body.basic_blocks.len(), alloc.clone());
        let mut states = IdVec::from_fn_in(
            body.basic_blocks.len(),
            |_: BasicBlockId| lattice.bottom(),
            alloc,
        );

        match Self::DIRECTION {
            Direction::Forward => {
                self.initialize_boundary(body, &mut states[BasicBlockId::START]);
            }
            Direction::Backward => {
                for (bb, block) in body.basic_blocks.iter_enumerated() {
                    if matches!(block.terminator.kind, TerminatorKind::Return(_)) {
                        self.initialize_boundary(body, &mut states[bb]);
                    }
                }
            }
        }

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

            let driver = Driver {
                analysis: &*self,
                lattice: &lattice,

                body,
                state: &mut state,
                id: bb,
                block: &body.basic_blocks[bb],
                propagate: |target: BasicBlockId, state: &Self::Domain<A>| {
                    let changed = lattice.join(&mut states[target], state);
                    if changed {
                        queue.enqueue(target);
                    }
                },
            };

            match Self::DIRECTION {
                Direction::Forward => {
                    driver.forward();
                }
                Direction::Backward => {
                    driver.backward();
                }
            }
        }
    }

    fn iterate_to_fixpoint(&mut self, body: &Body<'heap>, context: &mut MirContext<'_, 'heap>) {
        self.iterate_to_fixpoint_in(body, context, Global);
    }
}

struct Driver<'analysis, 'heap, D: DataflowAnalysis<'heap> + ?Sized, A: Allocator, F> {
    analysis: &'analysis D,
    lattice: &'analysis D::Lattice<A>,

    body: &'analysis Body<'heap>,
    state: &'analysis mut D::Domain<A>,

    id: BasicBlockId,
    block: &'analysis BasicBlock<'heap>,

    propagate: F,
}

impl<
    'heap,
    D: DataflowAnalysis<'heap> + ?Sized,
    A: Allocator,
    F: FnMut(BasicBlockId, &D::Domain<A>),
> Driver<'_, 'heap, D, A, F>
{
    #[expect(clippy::too_many_lines, reason = "minimal amount")]
    fn forward(self) {
        let Self {
            analysis,
            lattice,

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
                analysis.transfer_edge(
                    id,
                    &target.args,
                    target.block,
                    &body.basic_blocks[target.block].params,
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
                analysis.transfer_graph_read_edge(
                    id,
                    target,
                    &body.basic_blocks[target].params,
                    exit_state,
                );

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

                        analysis.transfer_edge(
                            id,
                            &target.args,
                            target.block,
                            &body.basic_blocks[target.block].params,
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

                        analysis.transfer_edge(
                            id,
                            &otherwise.args,
                            otherwise.block,
                            &body.basic_blocks[otherwise.block].params,
                            exit_state,
                        );

                        propagate(otherwise.block, exit_state);
                    }
                } else {
                    let mut switch_data = lattice.bottom();
                    for &target in targets.targets() {
                        switch_data.clone_from(exit_state);

                        analysis.transfer_edge(
                            id,
                            &target.args,
                            target.block,
                            &body.basic_blocks[target.block].params,
                            &mut switch_data,
                        );

                        propagate(target.block, &switch_data);
                    }
                }
            }
            TerminatorKind::Return(_) | TerminatorKind::Unreachable => {}
        }
    }

    fn backward(self) {
        let Self {
            analysis,
            lattice,
            body,
            state,
            id,
            block,
            mut propagate,
        } = self;

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

        let entry_state = state;

        for predecessor in body.basic_blocks.predecessors(id) {
            match &body.basic_blocks[predecessor].terminator.kind {
                TerminatorKind::Goto(Goto { target }) => {
                    debug_assert_eq!(target.block, id);

                    let mut state = entry_state.clone();
                    analysis.transfer_edge(
                        predecessor,
                        &target.args,
                        id,
                        &block.params,
                        &mut state,
                    );
                    propagate(predecessor, &state);
                }
                TerminatorKind::SwitchInt(SwitchInt {
                    discriminant,
                    targets,
                }) => {
                    if let Some(_data) = analysis.switch_int_data(predecessor, discriminant) {
                        unimplemented!("switch_int_data is not supported for backward analyses");
                    } else {
                        let mut combined = lattice.bottom();

                        for &target in targets.targets() {
                            if target.block != id {
                                continue;
                            }

                            let mut edge_state = entry_state.clone();
                            analysis.transfer_edge(
                                predecessor,
                                &target.args,
                                id,
                                &block.params,
                                &mut edge_state,
                            );
                            lattice.join(&mut combined, &edge_state);
                        }

                        propagate(predecessor, &combined);
                    }
                }
                TerminatorKind::GraphRead(GraphRead {
                    head: _,
                    body: _,
                    tail: _,
                    target,
                }) => {
                    debug_assert_eq!(*target, id);

                    let mut state = entry_state.clone();
                    analysis.transfer_graph_read_edge(predecessor, id, &block.params, &mut state);
                    propagate(predecessor, &state);
                }

                TerminatorKind::Return(_) | TerminatorKind::Unreachable => {
                    unreachable!("predecessor {predecessor} has no edge to {id}")
                }
            }
        }
    }
}
