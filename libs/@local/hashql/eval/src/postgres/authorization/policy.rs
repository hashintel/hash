use alloc::borrow::Cow;
use core::alloc::Allocator;

use hash_graph_authorization::policies::{
    Effect, OptimizationData, PolicyComponents,
    action::ActionName,
    resource::{EntityResourceConstraint, EntityResourceFilter, ResourceConstraint},
};
use hash_graph_postgres_store::store::postgres::query::{
    BinaryExpression, BinaryOperator, Column, ColumnReference, Constant, Expression, PostgresType,
    table,
};
use hash_graph_store::filter::PathToken;
use postgres_types::ToSql;
use type_system::{
    ontology::{BaseUrl, VersionedUrl},
    principal::actor::{ActorEntityUuid, ActorId},
};

use super::{AuthorizationProjections, AuxiliaryParameters};
use crate::postgres::PreparedQuery;

/// Context for policy-to-SQL conversion.
pub(crate) struct PreparedAnalysis<'query, A: Allocator> {
    projections: AuthorizationProjections<'query>,
    parameters: AuxiliaryParameters<A>,
    actor_id: Option<ActorId>,
}

impl<'query, A: Allocator> PreparedAnalysis<'query, A> {
    pub(crate) fn new_in(
        query: &'query PreparedQuery<'_, impl Allocator>,
        policy: &PolicyComponents,
        alloc: A,
    ) -> Self {
        Self {
            projections: AuthorizationProjections::new(query.projections()),
            parameters: AuxiliaryParameters {
                initial_offset: query.parameters.len(),
                parameters: Vec::new_in(alloc),
            },
            actor_id: policy.actor_id(),
        }
    }
}

/// Checks whether the entity has a specific `(base_url, version)` type pair.
///
/// ```sql
/// array_positions(eit.base_urls, $base::text)
/// && array_positions(eit.versions, $version::bigint)
/// ```
///
/// The overlap of position sets preserves the pairing invariant: a shared
/// position means `base_urls[i] = $base AND versions[i] = $version`.
fn convert_is_of_type<A: Allocator + Clone>(
    output: &mut PreparedAnalysis<'_, A>,
    url: VersionedUrl,
) -> Expression {
    let table = output.projections.entity_is_of_type_ids();

    let base_url_index = output.parameters.push(url.base_url);
    let version_index = output.parameters.push(url.version);

    // array_positions(eit.base_urls, $base)
    let base_url_positions = Expression::Function(
        hash_graph_postgres_store::store::postgres::query::Function::ArrayPositions(
            Box::new(Expression::ColumnReference(ColumnReference {
                correlation: Some(table.clone()),
                name: Column::EntityIsOfTypeIds(table::EntityIsOfTypeIds::BaseUrls).into(),
            })),
            Box::new(Expression::Parameter(base_url_index)),
        ),
    );

    // array_positions(eit.versions, $version)
    let version_positions = Expression::Function(
        hash_graph_postgres_store::store::postgres::query::Function::ArrayPositions(
            Box::new(Expression::ColumnReference(ColumnReference {
                correlation: Some(table),
                name: Column::EntityIsOfTypeIds(table::EntityIsOfTypeIds::Versions).into(),
            })),
            Box::new(Expression::Parameter(version_index)),
        ),
    );

    // array_positions(...) && array_positions(...)
    Expression::Binary(BinaryExpression {
        op: BinaryOperator::Overlap,
        left: Box::new(base_url_positions),
        right: Box::new(version_positions),
    })
}

/// Checks whether the entity has any type with the given base URL (any version).
///
/// ```sql
/// $base = ANY(eit.base_urls)
/// ```
fn convert_is_of_base_type<A: Allocator + Clone>(
    output: &mut PreparedAnalysis<'_, A>,
    base_url: BaseUrl,
) -> Expression {
    let base_url_index = output.parameters.push(base_url);

    // $base = ANY(eit.base_urls)
    Expression::Binary(BinaryExpression {
        op: BinaryOperator::In,
        left: Box::new(Expression::Parameter(base_url_index)),
        right: Box::new(Expression::ColumnReference(ColumnReference {
            correlation: Some(output.projections.entity_is_of_type_ids()),
            name: Column::EntityIsOfTypeIds(table::EntityIsOfTypeIds::BaseUrls).into(),
        })),
    })
}

/// Checks whether the entity was created by the current actor.
///
/// Uses entity-level provenance from `entity_ids` (the original creator).
/// Anonymous requests compare against the public actor UUID.
fn convert_created_by_principal<A: Allocator + Clone>(
    output: &mut PreparedAnalysis<'_, A>,
) -> Expression {
    let actor_uuid = output
        .actor_id
        .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from);
    let actor_index = output.parameters.push(actor_uuid);

    // ids.provenance->>'createdById'
    let provenance = Expression::ColumnReference(ColumnReference {
        correlation: Some(output.projections.entity_ids()),
        name: Column::EntityIds(table::EntityIds::Provenance).into(),
    });

    let created_by = Expression::Function(
        hash_graph_postgres_store::store::postgres::query::Function::JsonExtractAsText(
            Box::new(provenance),
            PathToken::Field(Cow::Borrowed("createdById")),
        ),
    );

    // ->> returns text, so the UUID parameter needs a text cast
    Expression::equal(
        created_by,
        Expression::Parameter(actor_index).cast(PostgresType::Text),
    )
}

/// Converts an [`EntityResourceFilter`] tree into a SQL [`Expression`].
fn convert_entity_resource_filter<A: Allocator + Clone>(
    output: &mut PreparedAnalysis<'_, A>,
    filter: &EntityResourceFilter,
) -> Expression {
    match filter {
        EntityResourceFilter::All { filters } => Expression::all(
            filters
                .iter()
                .map(|filter| convert_entity_resource_filter(output, filter))
                .collect(),
        ),
        EntityResourceFilter::Any { filters } => Expression::any(
            filters
                .iter()
                .map(|filter| convert_entity_resource_filter(output, filter))
                .collect(),
        ),
        EntityResourceFilter::Not { filter } => {
            convert_entity_resource_filter(output, filter).not()
        }
        EntityResourceFilter::IsOfType { entity_type } => {
            convert_is_of_type(output, entity_type.clone())
        }
        EntityResourceFilter::IsOfBaseType { entity_type } => {
            convert_is_of_base_type(output, entity_type.clone())
        }
        EntityResourceFilter::CreatedByPrincipal => convert_created_by_principal(output),
    }
}

/// Converts a [`ResourceConstraint`] into a SQL [`Expression`].
///
/// Non-entity resource types (entity types, property types, data types, meta)
/// produce `FALSE` since they cannot match entity rows.
fn convert_resource_constraint<A: Allocator + Clone>(
    output: &mut PreparedAnalysis<'_, A>,
    constraint: &ResourceConstraint,
) -> Expression {
    match constraint {
        &ResourceConstraint::Web { web_id } => {
            let index = output.parameters.push(web_id);

            // base.web_id = $N
            Expression::equal(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(output.projections.temporal_metadata()),
                    name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::WebId)
                        .into(),
                }),
                Expression::Parameter(index),
            )
        }
        &ResourceConstraint::Entity(EntityResourceConstraint::Exact { id }) => {
            let index = output.parameters.push(id);

            // base.entity_uuid = $N
            Expression::equal(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(output.projections.temporal_metadata()),
                    name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EntityUuid)
                        .into(),
                }),
                Expression::Parameter(index),
            )
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

/// Adds batched permit expressions from pre-analyzed [`OptimizationData`].
fn optimize<A: Allocator + Clone>(
    output: &mut PreparedAnalysis<'_, A>,
    permits: &mut Option<Vec<Expression>>,
    OptimizationData {
        permitted_entity_uuids,
        permitted_entity_type_uuids: _,
        permitted_property_type_uuids: _,
        permitted_data_type_uuids: _,
        permitted_web_ids,
    }: &OptimizationData,
) {
    match &**permitted_entity_uuids {
        [] => {}
        &[entity_uuid] => {
            let index = output.parameters.push(entity_uuid);

            // base.entity_uuid = $N
            permits.get_or_insert_default().push(Expression::equal(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(output.projections.temporal_metadata()),
                    name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EntityUuid)
                        .into(),
                }),
                Expression::Parameter(index),
            ));
        }
        entity_uuids => {
            let index = output.parameters.push(entity_uuids.to_vec());

            // base.entity_uuid = ANY($N::uuid[])
            permits.get_or_insert_default().push(Expression::r#in(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(output.projections.temporal_metadata()),
                    name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EntityUuid)
                        .into(),
                }),
                Expression::Parameter(index)
                    .cast(PostgresType::Array(Box::new(PostgresType::Uuid))),
            ));
        }
    }

    match &**permitted_web_ids {
        [] => {}
        &[web_id] => {
            let index = output.parameters.push(web_id);

            // base.web_id = $N
            permits.get_or_insert_default().push(Expression::equal(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(output.projections.temporal_metadata()),
                    name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::WebId)
                        .into(),
                }),
                Expression::Parameter(index),
            ));
        }
        web_ids => {
            let index = output.parameters.push(web_ids.to_vec());

            // base.web_id = ANY($N::uuid[])
            permits.get_or_insert_default().push(Expression::r#in(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(output.projections.temporal_metadata()),
                    name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::WebId)
                        .into(),
                }),
                Expression::Parameter(index)
                    .cast(PostgresType::Array(Box::new(PostgresType::Uuid))),
            ));
        }
    }
}

/// Everything needed to graft authorization onto a compiled query.
pub(super) struct PolicyResidual<'query, A: Allocator> {
    pub condition: Expression,
    /// Parameter values referenced by `condition` via `$N` indices.
    pub auxiliary_parameters: Vec<Box<dyn ToSql + Sync, A>, A>,
    pub projections: AuthorizationProjections<'query>,
}

/// Converts policies into a SQL condition using the permit/forbid algebra.
///
/// `scratch` is used for temporary constraint collection.
pub(crate) fn lower_policy<'query, A: Allocator + Clone, S: Allocator>(
    query: &'query PreparedQuery<'_, impl Allocator>,
    policy: &PolicyComponents,
    alloc: A,
    scratch: S,
) -> PolicyResidual<'query, A> {
    let action = match query.vertex_type {
        hashql_mir::pass::execution::VertexType::Entity => ActionName::ViewEntity,
    };
    let policies = policy.extract_filter_policies(action);
    let optimization_data = policy.optimization_data(action);

    let mut permit_constraints = Vec::new_in(&scratch);
    let mut forbid_constraints = Vec::new_in(&scratch);
    let mut blank_permit = false;

    for (effect, constraint) in policies {
        match (effect, constraint) {
            (Effect::Permit, _) if blank_permit => {}
            (Effect::Permit, None) => {
                blank_permit = true;
                permit_constraints.clear();
            }
            (Effect::Forbid, None) => {
                // Blank forbid: deny everything, no further analysis needed.
                return PolicyResidual {
                    condition: Expression::Constant(Constant::Boolean(false)),
                    auxiliary_parameters: Vec::new_in(alloc),
                    projections: AuthorizationProjections::new(query.projections()),
                };
            }
            (Effect::Permit, Some(constraint)) => {
                permit_constraints.push(constraint);
            }
            (Effect::Forbid, Some(constraint)) => {
                forbid_constraints.push(constraint);
            }
        }
    }

    // Phase 2: lower only surviving constraints to SQL
    let mut output = PreparedAnalysis::new_in(query, policy, alloc);

    let mut permits = Some(permit_constraints)
        .filter(|constraints| !constraints.is_empty())
        .map(|constraints| {
            constraints
                .into_iter()
                .map(|constraint| convert_resource_constraint(&mut output, constraint))
                .collect()
        });
    if !blank_permit {
        optimize(&mut output, &mut permits, optimization_data);
    }
    let permits = permits.map(Expression::any);

    let forbids = Some(forbid_constraints)
        .filter(|constraints| !constraints.is_empty())
        .map(|constraints| {
            constraints
                .into_iter()
                .map(|constraint| convert_resource_constraint(&mut output, constraint))
                .collect()
        })
        .map(Expression::any);

    let expression = match (blank_permit, permits, forbids) {
        // blank permit, no forbids: allow all
        (true, _, None) => Expression::Constant(Constant::Boolean(true)),
        // blank permit + forbids: allow everything except forbidden
        (true, _, Some(forbids)) => forbids.not(),
        // no permits at all: deny all
        (false, None, _) => Expression::Constant(Constant::Boolean(false)),
        // constrained permits only
        (false, Some(permits), None) => permits,
        // constrained permits + forbids
        (false, Some(permits), Some(forbids)) => Expression::all(vec![permits, forbids.not()]),
    };

    PolicyResidual {
        condition: expression,
        auxiliary_parameters: output.parameters.parameters,
        projections: output.projections,
    }
}
