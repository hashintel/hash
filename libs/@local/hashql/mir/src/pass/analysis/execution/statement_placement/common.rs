use core::{alloc::Allocator, cell::Cell, cmp::Reverse};

use hashql_core::{
    heap::Heap,
    id::bit_vec::{BitRelations as _, DenseBitSet},
};

use crate::{
    body::{
        Body,
        basic_block::BasicBlockId,
        local::Local,
        location::Location,
        operand::Operand,
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

/// Single-use value wrapper ensuring a value is consumed exactly once.
pub(crate) struct OnceValue<T>(Cell<Option<T>>);

impl<T> OnceValue<T> {
    pub(crate) const fn new(value: T) -> Self {
        Self(Cell::new(Some(value)))
    }

    fn take(&self) -> T {
        self.0.take().expect("TakeCell already taken")
    }
}

type RValueFn<'heap> =
    fn(&MirContext<'_, 'heap>, &Body<'heap>, &DenseBitSet<Local>, &RValue<'heap>) -> bool;

type OperandFn<'heap> =
    fn(&MirContext<'_, 'heap>, &Body<'heap>, &DenseBitSet<Local>, &Operand<'heap>) -> bool;

/// Computes which locals can be dispatched to an execution target.
///
/// This is a "must" analysis: a local is only considered dispatchable if it is supported along
/// *all* paths reaching return blocks. If any path produces an unsupported value for a local,
/// that local is excluded from the dispatchable set.
///
/// The analysis is parameterized by target-specific predicates that determine whether individual
/// rvalues and operands are supported by that target.
///
/// Values flowing through [`GraphRead`] edges are always marked as unsupported, since graph
/// reads must be executed by the interpreter and cannot be dispatched to external backends.
///
/// [`GraphRead`]: crate::body::terminator::GraphRead
pub(crate) struct SupportedAnalysis<'ctx, 'env, 'heap, B> {
    pub body: &'ctx Body<'heap>,
    pub context: &'ctx MirContext<'env, 'heap>,

    pub is_supported_rvalue: RValueFn<'heap>,
    pub is_supported_operand: OperandFn<'heap>,
    pub initialize_boundary: OnceValue<B>,
}

impl<'heap, B> SupportedAnalysis<'_, '_, 'heap, B> {
    /// Runs the analysis and returns the set of dispatchable locals.
    ///
    /// A local is dispatchable only if it is supported at every return block.
    pub(crate) fn finish_in<A: Allocator + Clone>(self, alloc: A) -> DenseBitSet<Local>
    where
        B: FnOnce(&Body<'heap>, &mut DenseBitSet<Local>),
    {
        let body = self.body;
        let DataflowResults { exit_states, .. } = self.iterate_to_fixpoint_in(body, alloc);

        let mut has_return = false;
        let mut dispatchable = DenseBitSet::new_filled(body.local_decls.len());

        for (bb, state) in exit_states.iter_enumerated() {
            if matches!(
                body.basic_blocks[bb].terminator.kind,
                TerminatorKind::Return(_)
            ) {
                dispatchable.intersect(state);
                has_return = true;
            }
        }

        if !has_return {
            dispatchable.clear();
        }

        dispatchable
    }
}

impl<'heap, B> DataflowAnalysis<'heap> for SupportedAnalysis<'_, '_, 'heap, B>
where
    B: FnOnce(&Body<'heap>, &mut DenseBitSet<Local>),
{
    type Domain<A: Allocator> = DenseBitSet<Local>;
    type Lattice<A: Allocator + Clone> = Reverse<PowersetLattice>;
    type Metadata<A: Allocator> = !;
    type SwitchIntData = !;

    fn lattice_in<A: Allocator + Clone>(&self, body: &Body<'heap>, _: A) -> Self::Lattice<A> {
        Reverse(PowersetLattice::new(body.local_decls.len()))
    }

    fn initialize_boundary<A: Allocator>(
        &self,
        body: &Body<'heap>,
        domain: &mut Self::Domain<A>,
        _: A,
    ) {
        let initialize_boundary = self.initialize_boundary.take();

        (initialize_boundary)(body, domain);
    }

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

    fn transfer_edge<A: Allocator>(
        &self,
        _: BasicBlockId,
        source_args: &[Operand<'heap>],

        _: BasicBlockId,
        target_params: &[Local],

        state: &mut Self::Domain<A>,
    ) {
        debug_assert_eq!(source_args.len(), target_params.len());

        for (arg, &param) in source_args.iter().zip(target_params) {
            let is_supported = (self.is_supported_operand)(self.context, self.body, state, arg);
            state.set(param, is_supported);
        }
    }

    fn transfer_graph_read_edge<A: Allocator>(
        &self,
        _: BasicBlockId,

        _: BasicBlockId,
        target_params: &[Local],

        state: &mut Self::Domain<A>,
    ) {
        // Graph reads must happen inside of the interpreter, and are therefore not supported on any
        // backend.
        for &param in target_params {
            state.remove(param);
        }
    }
}

/// Assigns costs to statements based on the dispatchable set.
///
/// After the supportedness analysis computes which locals are dispatchable, this visitor walks
/// the body and assigns costs. A statement receives a cost if its rvalue is supported given the
/// dispatchable locals; otherwise it gets `None`. Storage statements always receive zero cost.
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
