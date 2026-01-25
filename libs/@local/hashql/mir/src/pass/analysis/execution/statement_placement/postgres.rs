use core::{alloc::Allocator, cmp::Reverse};

use hashql_core::id::bit_vec::DenseBitSet;

use crate::{
    body::{
        Body,
        constant::Constant,
        local::Local,
        location::Location,
        operand::Operand,
        place::{Place, Projection},
        rvalue::{Aggregate, AggregateKind, Binary, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
    },
    pass::analysis::dataflow::{framework::DataflowAnalysis, lattice::PowersetLattice},
};

// The env is always supported, because it is made up of any constituents that we can create
// ourselves.

const fn is_supported_constant(constant: &Constant<'_>) -> bool {
    match constant {
        Constant::Int(_) | Constant::Primitive(_) | Constant::Unit => true,
        Constant::FnPtr(_) => false,
    }
}

fn is_supported_entity_projection<'heap>(projections: &[Projection<'heap>]) {
    todo!()
}

fn is_supported_place(domain: &DenseBitSet<Local>, place: &Place<'_>) -> bool {
    // TODO: this is a bit more fine grained, for filters, locations for the embeddings are not
    // supported, and therefore also not any path alongside of it that just loads them, otherwise
    // just what it says on the tin. For that to matter we must investigate the path used for the
    // first part.
    // This should be relatively straightforward.
    // TODO: we must have a Source that tells us is this a GraphFilter, or a GraphMap or whatever,
    // to be able to know what we can and what we can't do.
    // For now it's just place.local
    domain.contains(place.local)
}

fn is_supported_operand(domain: &DenseBitSet<Local>, operand: &Operand<'_>) -> bool {
    match operand {
        Operand::Place(place) => is_supported_place(domain, place),
        Operand::Constant(constant) => is_supported_constant(constant),
    }
}

fn is_supported_rvalue(domain: &DenseBitSet<Local>, rvalue: &RValue<'_>) -> bool {
    match rvalue {
        RValue::Load(operand) => is_supported_operand(domain, operand),
        RValue::Binary(Binary { op: _, left, right }) => {
            // Any binary operation present and supported is also supported by postgres (given that
            // the type is first coerced)
            is_supported_operand(domain, left) && is_supported_operand(domain, right)
        }
        RValue::Unary(Unary { op: _, operand }) => {
            // Any unary operation currently support is also supported by postgres, given a type
            // coercion.
            is_supported_operand(domain, operand)
        }
        RValue::Aggregate(Aggregate { kind, operands }) => {
            if *kind == AggregateKind::Closure {
                return false;
            }

            // We can construct a JSONB equivalent for each data type (opaques are simply
            // eliminated) given that we work in JSONB.
            operands
                .iter()
                .all(|operand| is_supported_operand(domain, operand))
        }
        // In general input is supported, as long as these parameters are given to the query
        // beforehand
        RValue::Input(_) => true,
        // Function calls are in general **not** supported
        RValue::Apply(_) => false,
    }
}

struct PostgresAnalysis;

// TODO: we need access to a residual that we can just continuously update without state
// interference?
impl<'heap> DataflowAnalysis<'heap> for PostgresAnalysis {
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
        domain.insert_range(Local::new(0)..Local::new(body.args));
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

        let is_supported = is_supported_rvalue(state, rhs);
        if is_supported {
            state.insert(lhs.local);
        } else {
            state.remove(lhs.local);
        }
    }
}
