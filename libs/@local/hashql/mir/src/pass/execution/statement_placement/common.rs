use core::{alloc::Allocator, cell::Cell, cmp::Reverse};

use hashql_core::{
    id::{
        Id as _,
        bit_vec::{BitRelations as _, DenseBitSet},
    },
    newtype,
    r#type::TypeId,
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
    pass::{
        analysis::dataflow::{
            framework::{DataflowAnalysis, DataflowResults},
            lattice::PowersetLattice,
        },
        execution::{
            Cost,
            cost::{StatementCostVec, TraversalCostVec},
        },
    },
    visit::Visitor,
};

newtype!(struct ParamIndex(u16 is 0..=0xFF_FF));

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

/// Target-specific predicates for determining whether rvalues and operands can be dispatched
/// to a particular execution target.
///
/// Implementations carry any target-specific state needed for the decision (e.g., which
/// environment fields are transferable for Postgres).
pub(crate) trait Supported<'heap> {
    fn is_supported_rvalue(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        domain: &DenseBitSet<Local>,
        rvalue: &RValue<'heap>,
    ) -> bool;

    fn is_supported_operand(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        domain: &DenseBitSet<Local>,
        operand: &Operand<'heap>,
    ) -> bool;

    fn is_type_serialization_safe(&self, context: &MirContext<'_, 'heap>, type_id: TypeId) -> bool {
        true
    }
}

impl<'heap, T> Supported<'heap> for &T
where
    T: Supported<'heap>,
{
    fn is_supported_rvalue(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        domain: &DenseBitSet<Local>,
        rvalue: &RValue<'heap>,
    ) -> bool {
        T::is_supported_rvalue(self, context, body, domain, rvalue)
    }

    fn is_supported_operand(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        domain: &DenseBitSet<Local>,
        operand: &Operand<'heap>,
    ) -> bool {
        T::is_supported_operand(self, context, body, domain, operand)
    }

    fn is_type_serialization_safe(&self, context: &MirContext<'_, 'heap>, type_id: TypeId) -> bool {
        T::is_type_serialization_safe(self, context, type_id)
    }
}

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
pub(crate) struct SupportedAnalysis<'ctx, 'env, 'heap, S, B> {
    pub body: &'ctx Body<'heap>,
    pub context: &'ctx MirContext<'env, 'heap>,

    pub supported: S,
    pub initialize_boundary: OnceValue<B>,
}

impl<'heap, S, B> SupportedAnalysis<'_, '_, 'heap, S, B> {
    /// Runs the analysis and returns the set of dispatchable locals.
    ///
    /// A local is dispatchable only if it is supported at every return block.
    pub(crate) fn finish_in<A: Allocator + Clone>(self, alloc: A) -> DenseBitSet<Local>
    where
        S: Supported<'heap>,
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

impl<'heap, S, B> DataflowAnalysis<'heap> for SupportedAnalysis<'_, '_, 'heap, S, B>
where
    S: Supported<'heap>,
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

        let is_supported = self
            .supported
            .is_supported_rvalue(self.context, self.body, state, rhs)
            && self
                .supported
                .is_type_serialization_safe(self.context, self.body.local_decls[param].r#type);
        state.set(lhs.local, is_supported);
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

        // This will only allocate if there are more than 128 params, which is unlikely.
        let mut is_supported_set = DenseBitSet::new_empty(target_params.len());

        for (index, arg) in source_args.iter().enumerate() {
            let is_supported =
                self.supported
                    .is_supported_operand(self.context, self.body, state, arg);
            is_supported_set.set(ParamIndex::from_usize(index), is_supported);
        }

        for (index, &param) in target_params.iter().enumerate() {
            let is_supported = is_supported_set.contains(ParamIndex::from_usize(index))
                && self
                    .supported
                    .is_type_serialization_safe(self.context, self.body.local_decls[param].r#type);

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
pub(crate) struct CostVisitor<'ctx, 'env, 'heap, S, A: Allocator> {
    pub body: &'ctx Body<'heap>,
    pub context: &'ctx MirContext<'env, 'heap>,
    pub dispatchable: &'ctx DenseBitSet<Local>,
    pub cost: Cost,

    pub statement_costs: StatementCostVec<A>,
    pub traversal_costs: TraversalCostVec<A>,

    pub supported: S,
}

impl<'heap, S, A: Allocator> Visitor<'heap> for CostVisitor<'_, '_, 'heap, S, A>
where
    S: Supported<'heap>,
{
    type Result = Result<(), !>;

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        match &statement.kind {
            StatementKind::Assign(Assign { lhs, rhs }) => {
                let cost = self
                    .supported
                    .is_supported_rvalue(self.context, self.body, self.dispatchable, rhs)
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
