use core::alloc::Allocator;

use hash_graph_authorization::policies::{
    Effect, PolicyComponents,
    action::ActionName,
    resource::{EntityResourceConstraint, EntityResourceFilter, ResourceConstraint},
};
use hash_graph_postgres_store::store::postgres::query::{
    Column, ColumnReference, Constant, Expression, TableReference, VariadicExpression,
    VariadicOperator, table,
};
use hashql_core::id::{Id, bit_vec::FiniteBitSet};
use postgres_types::ToSql;

use super::{PreparedQuery, projections::Projections};

struct AuthorizationProjections<'base> {
    index: usize,
    base: &'base Projections,
}

impl<'base> AuthorizationProjections<'base> {
    fn temporal_metadata(&self) -> TableReference<'static> {
        self.base.temporal_metadata()
    }
}

struct AuxiliaryParameters<A: Allocator> {
    initial_offset: usize,
    parameters: Vec<Box<dyn ToSql + Sync, A>, A>,
}

impl<A: Allocator> AuxiliaryParameters<A> {
    fn push(&mut self, value: impl ToSql + Sync + 'static) -> usize
    where
        A: Clone,
    {
        let alloc = self.parameters.allocator().clone();
        self.parameters.push(Box::new_in(value, alloc));

        self.parameters.len() + self.initial_offset
    }
}

struct PreparedAnalysis<'query, A: Allocator> {
    projections: AuthorizationProjections<'query>,
    parameters: AuxiliaryParameters<A>,
}

impl<'query, A: Allocator> PreparedAnalysis<'query, A> {
    fn new_in(query: &'query PreparedQuery<'_, impl Allocator>, alloc: A) -> Self {
        Self {
            projections: AuthorizationProjections {
                index: query.projections.index,
                base: &query.projections,
            },
            parameters: AuxiliaryParameters {
                initial_offset: query.parameters.len(),
                parameters: Vec::new_in(alloc),
            },
        }
    }
}

struct AnalysisResidual {
    condition: Expression,
}

fn convert_entity_resource_filter<A: Allocator + Clone>(
    output: &mut PreparedAnalysis<'_, A>,
    filter: &EntityResourceFilter,
) -> Expression {
    match filter {
        EntityResourceFilter::All { filters } => {
            let expressions = filters
                .iter()
                .map(|filter| convert_entity_resource_filter(output, filter))
                .collect();

            Expression::Variadic(VariadicExpression {
                op: VariadicOperator::And,
                exprs: expressions,
            })
        }
        EntityResourceFilter::Any { filters } => {
            let expressions = filters
                .iter()
                .map(|filter| convert_entity_resource_filter(output, filter))
                .collect();

            Expression::Variadic(VariadicExpression {
                op: VariadicOperator::Or,
                exprs: expressions,
            })
        }
        EntityResourceFilter::Not { filter } => {
            convert_entity_resource_filter(output, filter).not()
        }
        EntityResourceFilter::IsOfType { entity_type } => {
            todo!()
        }
        EntityResourceFilter::IsOfBaseType { entity_type } => todo!(),
        EntityResourceFilter::CreatedByPrincipal => {
            todo!()
        }
    }
}

fn convert_resource_constraint<A: Allocator + Clone>(
    output: &mut PreparedAnalysis<A>,
    constraint: &ResourceConstraint,
) -> Expression {
    match constraint {
        &ResourceConstraint::Web { web_id } => {
            let index = output.parameters.push(web_id);

            let reference = Expression::ColumnReference(ColumnReference {
                correlation: Some(output.projections.temporal_metadata()),
                name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::WebId).into(),
            });

            let param = Expression::Parameter(index);

            Expression::equal(reference, param)
        }
        &ResourceConstraint::Entity(EntityResourceConstraint::Exact { id }) => {
            let index = output.parameters.push(id);

            let reference = Expression::ColumnReference(ColumnReference {
                correlation: Some(output.projections.temporal_metadata()),
                name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EntityUuid)
                    .into(),
            });

            let param = Expression::Parameter(index);

            Expression::equal(reference, param)
        }
        ResourceConstraint::Entity(EntityResourceConstraint::Web { web_id, filter }) => {
            let lhs =
                convert_resource_constraint(output, &ResourceConstraint::Web { web_id: *web_id });
            let rhs = convert_entity_resource_filter(output, filter);

            Expression::all(vec![lhs, rhs])
        }
        ResourceConstraint::Entity(EntityResourceConstraint::Any { filter }) => {
            convert_entity_resource_filter(output, filter)
        }
        ResourceConstraint::EntityType(_)
        | ResourceConstraint::PropertyType(_)
        | ResourceConstraint::DataType(_)
        | ResourceConstraint::Meta(_) => Expression::Constant(Constant::Boolean(false)),
    }
}

fn analysis_in<A: Allocator + Clone>(
    query: &PreparedQuery<'_, impl Allocator>,
    policy: &PolicyComponents,
    alloc: A,
) -> AnalysisResidual {
    let policies = policy.extract_filter_policies(match query.vertex_type {
        hashql_mir::pass::execution::VertexType::Entity => ActionName::ViewEntity,
    });

    let mut output = PreparedAnalysis::new_in(query, alloc);
    let mut permits = Vec::new();
    let mut forbids = Vec::new();
    let mut blank_permit = false;

    for (effect, constraint) in policies {
        match (effect, constraint) {
            (Effect::Permit, _) if blank_permit => {}
            (Effect::Permit, None) => blank_permit = true,
            (Effect::Forbid, None) => {
                return AnalysisResidual {
                    condition: Expression::Constant(Constant::Boolean(false)),
                };
            }
            (Effect::Permit, Some(constraint)) => {
                permits.push(convert_resource_constraint(&mut output, constraint));
            }
            (Effect::Forbid, Some(constraint)) => {
                forbids.push(convert_resource_constraint(&mut output, constraint));
            }
        }
    }

    todo!()
}
