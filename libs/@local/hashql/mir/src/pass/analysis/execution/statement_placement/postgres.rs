use core::{alloc::Allocator, cmp::Reverse};

use hashql_core::{
    id::bit_vec::DenseBitSet,
    symbol::{Symbol, sym},
};

use crate::{
    body::{
        Body,
        constant::Constant,
        local::Local,
        location::Location,
        operand::Operand,
        place::{Place, Projection, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, Binary, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
    },
    pass::analysis::dataflow::{framework::DataflowAnalysis, lattice::PowersetLattice},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
enum Feasibility {
    /// Maps to a single column or JSONB path. Any operation can be pushed.
    Direct,
    /// Maps to multiple columns in the same table. Only comparisons (==, !=) can be pushed,
    /// requiring the compiler to expand into column-wise comparisons.
    Composite,
    /// Contains synthesized data or spans multiple tables. Cannot be pushed to Postgres.
    NotPushable,
}

const fn is_supported_constant(constant: &Constant<'_>) -> bool {
    match constant {
        Constant::Int(_) | Constant::Primitive(_) | Constant::Unit => true,
        Constant::FnPtr(_) => false,
    }
}

/// A node in the path feasibility trie.
///
/// Each node represents a field in the entity path hierarchy and defines:
/// - What feasibility applies when the path ends at this node (`on_end`)
/// - What children exist for further path traversal
/// - Whether arbitrary sub-paths are allowed (for JSONB columns)
struct PathNode {
    /// Feasibility when the path ends at this node (no more projections).
    on_end: Feasibility,
    /// Whether any sub-path from here is allowed (e.g., JSONB columns).
    any_subpath: bool,
    /// Child nodes for specific field names (uses Symbol for pointer equality).
    children: &'static [(Symbol<'static>, Self)],
}

impl PathNode {
    const fn leaf(feasibility: Feasibility) -> Self {
        Self {
            on_end: feasibility,
            any_subpath: false,
            children: &[],
        }
    }

    const fn jsonb() -> Self {
        Self {
            on_end: Feasibility::Direct,
            any_subpath: true,
            children: &[],
        }
    }

    const fn branch(on_end: Feasibility, children: &'static [(Symbol<'static>, PathNode)]) -> Self {
        Self {
            on_end,
            any_subpath: false,
            children,
        }
    }

    fn lookup(&self, name: Symbol<'_>) -> Option<&PathNode> {
        self.children
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, node)| node)
    }
}

/// Entity path feasibility trie.
///
/// Structure mirrors the Entity struct paths from the pushability mapping document.
/// See `docs/entity-path-pushability.md` for the full mapping.
static ENTITY_PATHS: PathNode = PathNode::branch(
    Feasibility::NotPushable, // whole entity is not pushable
    &[
        (sym::lexical::properties, PathNode::jsonb()),
        (
            sym::lexical::metadata,
            PathNode::branch(
                Feasibility::NotPushable,
                &[
                    (
                        sym::lexical::record_id,
                        PathNode::branch(
                            Feasibility::Composite, // 4 columns
                            &[
                                (
                                    sym::lexical::entity_id,
                                    PathNode::branch(
                                        Feasibility::Composite, // 3 columns
                                        &[
                                            (
                                                sym::lexical::web_id,
                                                PathNode::leaf(Feasibility::Direct),
                                            ),
                                            (
                                                sym::lexical::entity_uuid,
                                                PathNode::leaf(Feasibility::Direct),
                                            ),
                                            (
                                                sym::lexical::draft_id,
                                                PathNode::leaf(Feasibility::Direct),
                                            ),
                                        ],
                                    ),
                                ),
                                (
                                    sym::lexical::edition_id,
                                    PathNode::leaf(Feasibility::Direct),
                                ),
                            ],
                        ),
                    ),
                    (
                        sym::lexical::temporal_versioning,
                        PathNode::branch(
                            Feasibility::Composite, // 2 columns
                            &[
                                (
                                    sym::lexical::decision_time,
                                    PathNode::leaf(Feasibility::Direct),
                                ),
                                (
                                    sym::lexical::transaction_time,
                                    PathNode::leaf(Feasibility::Direct),
                                ),
                            ],
                        ),
                    ),
                    (
                        sym::lexical::entity_type_ids,
                        PathNode::leaf(Feasibility::Direct),
                    ),
                    (sym::lexical::archived, PathNode::leaf(Feasibility::Direct)),
                    (
                        sym::lexical::confidence,
                        PathNode::leaf(Feasibility::Direct),
                    ),
                    (
                        sym::lexical::provenance,
                        PathNode::branch(
                            Feasibility::NotPushable, // spans multiple tables
                            &[
                                (sym::lexical::inferred, PathNode::jsonb()),
                                (sym::lexical::edition, PathNode::jsonb()),
                            ],
                        ),
                    ),
                    (sym::lexical::properties, PathNode::jsonb()), // property metadata
                ],
            ),
        ),
        (
            sym::lexical::link_data,
            PathNode::branch(
                Feasibility::NotPushable, // contains synthesized fields
                &[
                    (
                        sym::lexical::left_entity_id,
                        PathNode::branch(
                            Feasibility::NotPushable, // synthesized draft_id
                            &[
                                (sym::lexical::web_id, PathNode::leaf(Feasibility::Direct)),
                                (
                                    sym::lexical::entity_uuid,
                                    PathNode::leaf(Feasibility::Direct),
                                ),
                                (
                                    sym::lexical::draft_id,
                                    PathNode::leaf(Feasibility::NotPushable),
                                ),
                            ],
                        ),
                    ),
                    (
                        sym::lexical::right_entity_id,
                        PathNode::branch(
                            Feasibility::NotPushable, // synthesized draft_id
                            &[
                                (sym::lexical::web_id, PathNode::leaf(Feasibility::Direct)),
                                (
                                    sym::lexical::entity_uuid,
                                    PathNode::leaf(Feasibility::Direct),
                                ),
                                (
                                    sym::lexical::draft_id,
                                    PathNode::leaf(Feasibility::NotPushable),
                                ),
                            ],
                        ),
                    ),
                    (
                        sym::lexical::left_entity_confidence,
                        PathNode::leaf(Feasibility::Direct),
                    ),
                    (sym::lexical::left_entity_provenance, PathNode::jsonb()),
                    (
                        sym::lexical::right_entity_confidence,
                        PathNode::leaf(Feasibility::Direct),
                    ),
                    (sym::lexical::right_entity_provenance, PathNode::jsonb()),
                ],
            ),
        ),
    ],
);

fn is_supported_entity_projection(projections: &[Projection<'_>]) -> Option<Feasibility> {
    let mut node = &ENTITY_PATHS;

    for projection in projections {
        let ProjectionKind::FieldByName(name) = projection.kind else {
            return None;
        };

        if node.any_subpath {
            return Some(Feasibility::Direct);
        }

        node = node.lookup(name)?;
    }

    Some(node.on_end)
}

fn is_supported_place<'heap>(domain: &DenseBitSet<Local>, place: &Place<'heap>) -> bool {
    if !domain.contains(place.local) {
        return false;
    }

    // If there are projections, check if the path is pushable for entity types
    // TODO: We need type information to know if this is an entity projection.
    // For now, we check if any projections exist and validate them as entity paths.
    if !place.projections.is_empty() {
        match is_supported_entity_projection(&place.projections) {
            Some(Feasibility::Direct | Feasibility::Composite) => true,
            Some(Feasibility::NotPushable) | None => false,
        }
    } else {
        true
    }
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
