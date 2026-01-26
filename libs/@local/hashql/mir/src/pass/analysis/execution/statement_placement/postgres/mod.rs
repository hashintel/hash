mod entity_access;
mod trie;

use core::{alloc::Allocator, cmp::Reverse};

use hashql_core::{
    heap::Heap,
    id::{
        Id as _,
        bit_vec::{BitRelations, DenseBitSet},
    },
    symbol::sym,
};

use self::{entity_access::entity_projection_access, trie::Access};
use super::cost::CostVec;
use crate::{
    body::{
        Body, Source,
        constant::Constant,
        local::Local,
        location::Location,
        operand::Operand,
        place::Place,
        rvalue::{Aggregate, AggregateKind, Binary, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::TerminatorKind,
    },
    context::MirContext,
    pass::analysis::{
        dataflow::{
            framework::{DataflowAnalysis, DataflowResults},
            lattice::PowersetLattice,
        },
        execution::statement_placement::cost::{Cost, cost},
    },
    visit::Visitor,
};

const fn is_supported_constant(constant: &Constant<'_>) -> bool {
    match constant {
        Constant::Int(_) | Constant::Primitive(_) | Constant::Unit => true,
        Constant::FnPtr(_) => false,
    }
}

fn is_supported_place<'heap>(
    context: &MirContext<'_, 'heap>,
    body: &Body<'heap>,
    domain: &DenseBitSet<Local>,
    place: &Place<'heap>,
) -> bool {
    // the first argument to the function is the environment, which depends on the domain, and
    // the second local is the filter itself. Therefore the second argument is specially handled.
    if matches!(body.source, Source::GraphReadFilter(_)) && place.local.as_usize() == 1 {
        // we must first check the type, to determine what "type" of filter it is, the function will
        // have a vertex, which is an opaque of either entity, entity-type, etc.
        let local_type = body.local_decls[place.local].r#type;
        let type_name = context
            .env
            .r#type(local_type)
            .kind
            .opaque()
            .map_or_else(|| unreachable!(), |opaque| opaque.name);

        if type_name == sym::path::Entity {
            return entity_projection_access(&place.projections) == Access::Direct;
        }

        unimplemented!("unimplemented lookup for declared type")
    }

    domain.contains(place.local)
}

fn is_supported_operand<'heap>(
    context: &MirContext<'_, 'heap>,
    body: &Body<'heap>,
    domain: &DenseBitSet<Local>,
    operand: &Operand<'heap>,
) -> bool {
    match operand {
        Operand::Place(place) => is_supported_place(context, body, domain, place),
        Operand::Constant(constant) => is_supported_constant(constant),
    }
}

fn is_supported_rvalue<'heap>(
    context: &MirContext<'_, 'heap>,
    body: &Body<'heap>,
    domain: &DenseBitSet<Local>,
    rvalue: &RValue<'heap>,
) -> bool {
    match rvalue {
        RValue::Load(operand) => is_supported_operand(context, body, domain, operand),
        RValue::Binary(Binary { op: _, left, right }) => {
            // Any binary operation present and supported is also supported by postgres (given that
            // the type is first coerced)
            is_supported_operand(context, body, domain, left)
                && is_supported_operand(context, body, domain, right)
        }
        RValue::Unary(Unary { op: _, operand }) => {
            // Any unary operation currently support is also supported by postgres, given a type
            // coercion.
            is_supported_operand(context, body, domain, operand)
        }
        RValue::Aggregate(Aggregate { kind, operands }) => {
            if *kind == AggregateKind::Closure {
                return false;
            }

            // We can construct a JSONB equivalent for each data type (opaques are simply
            // eliminated) given that we work in JSONB.
            operands
                .iter()
                .all(|operand| is_supported_operand(context, body, domain, operand))
        }
        // In general input is supported, as long as these parameters are given to the query
        // beforehand
        RValue::Input(_) => true,
        // Function calls are in general **not** supported
        RValue::Apply(_) => false,
    }
}

struct SupportedAnalysis<'ctx, 'env, 'heap> {
    body: &'ctx Body<'heap>,
    context: &'ctx MirContext<'env, 'heap>,
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

        let is_supported = is_supported_rvalue(self.context, self.body, state, rhs);
        if is_supported {
            state.insert(lhs.local);
        } else {
            state.remove(lhs.local);
        }
    }
}

struct CostVisitor<'ctx, 'env, 'heap> {
    body: &'ctx Body<'heap>,
    context: &'ctx MirContext<'env, 'heap>,
    dispatchable: &'ctx DenseBitSet<Local>,
    cost: Cost,
    costs: CostVec<&'heap Heap>,
}

impl<'heap> Visitor<'heap> for CostVisitor<'_, '_, 'heap> {
    type Result = Result<(), !>;

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        match &statement.kind {
            StatementKind::Assign(Assign { lhs: _, rhs }) => {
                let cost = is_supported_rvalue(self.context, self.body, self.dispatchable, rhs)
                    .then_some(self.cost);

                self.costs[location] = cost;
            }
            StatementKind::StorageDead(_) | StatementKind::StorageLive(_) | StatementKind::Nop => {
                self.costs[location] = Some(cost!(0));
            }
        }

        Ok(())
    }
}

struct PostgresStatementPlacement {
    statement_cost: Cost,
}

impl PostgresStatementPlacement {
    fn compute<'heap, A: Allocator + Clone>(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        alloc: A,
    ) -> CostVec<&'heap Heap> {
        let analysis = SupportedAnalysis { body, context };
        let DataflowResults { exit_states, .. } = analysis.iterate_to_fixpoint_in(body, alloc);

        let mut dispatchable = DenseBitSet::new_filled(body.local_decls.len());

        for (bb, state) in exit_states.iter_enumerated() {
            if matches!(
                body.basic_blocks[bb].terminator.kind,
                TerminatorKind::Return(_)
            ) {
                dispatchable.intersect(state);
            }
        }

        let costs = CostVec::new(&body.basic_blocks, context.heap);

        let mut visitor = CostVisitor {
            body,
            context,
            dispatchable: &dispatchable,
            cost: self.statement_cost,
            costs,
        };
        visitor.visit_body(body);

        visitor.costs
    }
}
