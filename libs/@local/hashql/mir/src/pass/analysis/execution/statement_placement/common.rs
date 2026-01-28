use core::cmp::Reverse;
use std::alloc::Allocator;

use hashql_core::{
    heap::Heap,
    id::bit_vec::{BitRelations as _, DenseBitSet},
};

use crate::{
    body::{
        Body,
        local::Local,
        location::Location,
        rvalue::RValue,
        statement::{Assign, Statement, StatementKind},
        terminator::TerminatorKind,
    },
    context::MirContext,
    pass::analysis::{
        dataflow::{
            framework::{DataflowAnalysis, DataflowResults},
            lattice::PowersetLattice,
        },
        execution::{Cost, StatementCostVec, cost::TraversalCostVec},
    },
    visit::Visitor,
};

type RValueFn<'heap> =
    fn(&MirContext<'_, 'heap>, &Body<'heap>, &DenseBitSet<Local>, &RValue<'heap>) -> bool;

pub(crate) struct SupportedAnalysis<'ctx, 'env, 'heap> {
    pub body: &'ctx Body<'heap>,
    pub context: &'ctx MirContext<'env, 'heap>,

    pub is_supported_rvalue: RValueFn<'heap>,
}

impl SupportedAnalysis<'_, '_, '_> {
    pub(crate) fn finish_in<A: Allocator + Clone>(self, alloc: A) -> DenseBitSet<Local> {
        let body = self.body;
        let DataflowResults { exit_states, .. } = self.iterate_to_fixpoint_in(body, alloc);

        let mut dispatchable = DenseBitSet::new_filled(body.local_decls.len());

        for (bb, state) in exit_states.iter_enumerated() {
            if matches!(
                body.basic_blocks[bb].terminator.kind,
                TerminatorKind::Return(_)
            ) {
                dispatchable.intersect(state);
            }
        }

        dispatchable
    }
}

impl<'heap> DataflowAnalysis<'heap> for SupportedAnalysis<'_, '_, 'heap> {
    type Domain<A: Allocator> = DenseBitSet<Local>;
    type Lattice<A: Allocator + Clone> = Reverse<PowersetLattice>;
    type Metadata<A: Allocator> = !;
    type SwitchIntData = !;

    fn lattice_in<A: Allocator + Clone>(&self, body: &Body<'heap>, _: A) -> Self::Lattice<A> {
        Reverse(PowersetLattice::new(body.local_decls.len()))
    }

    fn initialize_boundary<A: Allocator>(&self, _: &Body<'heap>, _: &mut Self::Domain<A>, _: A) {}

    fn transfer_statement<A: Allocator>(
        &self,
        _: Location,
        statement: &Statement<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        let StatementKind::Assign(Assign { lhs, rhs }) = &statement.kind else {
            return;
        };

        assert!(
            lhs.projections.is_empty(),
            "MIR must be in MIR(SSA) form for analysis to take place"
        );

        let is_supported = (self.is_supported_rvalue)(self.context, self.body, state, rhs);
        if is_supported {
            state.insert(lhs.local);
        } else {
            state.remove(lhs.local);
        }
    }
}

pub(crate) struct CostVisitor<'ctx, 'env, 'heap> {
    pub body: &'ctx Body<'heap>,
    pub context: &'ctx MirContext<'env, 'heap>,
    pub dispatchable: &'ctx DenseBitSet<Local>,
    pub cost: Cost,

    pub statement_costs: StatementCostVec<&'heap Heap>,
    pub traversal_costs: TraversalCostVec<&'heap Heap>,

    pub is_supported_rvalue: RValueFn<'heap>,
}

impl<'heap> Visitor<'heap> for CostVisitor<'_, '_, 'heap> {
    type Result = Result<(), !>;

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        match &statement.kind {
            StatementKind::Assign(Assign { lhs, rhs }) => {
                let cost =
                    (self.is_supported_rvalue)(self.context, self.body, self.dispatchable, rhs)
                        .then_some(self.cost);

                if let Some(cost) = cost
                    && lhs.projections.is_empty()
                {
                    self.traversal_costs.insert(lhs.local, cost);
                }

                self.statement_costs[location] = cost;
            }
            StatementKind::StorageDead(_) | StatementKind::StorageLive(_) | StatementKind::Nop => {
                self.statement_costs[location] = Some(cost!(0));
            }
        }

        Ok(())
    }
}
