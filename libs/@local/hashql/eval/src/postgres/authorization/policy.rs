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
use hashql_mir::pass::execution::VertexType;
use type_system::{
    ontology::{BaseUrl, VersionedUrl},
    principal::actor::{ActorEntityUuid, ActorId},
};

use crate::postgres::{
    PreparedQuery, parameters::AuxiliaryParameters, projections::AuxiliaryProjections,
};

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
    unit: &mut PolicyTranslationUnit<'_, '_, A>,
    url: VersionedUrl,
) -> Expression {
    let table = unit.projections.entity_is_of_type_ids();

    let base_url_index = unit.parameters.push(url.base_url);
    let version_index = unit.parameters.push(url.version);

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
    unit: &mut PolicyTranslationUnit<'_, '_, A>,
    base_url: BaseUrl,
) -> Expression {
    let base_url_index = unit.parameters.push(base_url);

    // $base = ANY(eit.base_urls)
    Expression::Binary(BinaryExpression {
        op: BinaryOperator::In,
        left: Box::new(Expression::Parameter(base_url_index)),
        right: Box::new(Expression::ColumnReference(ColumnReference {
            correlation: Some(unit.projections.entity_is_of_type_ids()),
            name: Column::EntityIsOfTypeIds(table::EntityIsOfTypeIds::BaseUrls).into(),
        })),
    })
}

/// Checks whether the entity was created by the current actor.
///
/// Uses entity-level provenance from `entity_ids` (the original creator).
/// Anonymous requests compare against the public actor UUID.
fn convert_created_by_principal<A: Allocator + Clone>(
    unit: &mut PolicyTranslationUnit<'_, '_, A>,
) -> Expression {
    let actor_uuid = unit
        .actor_id
        .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from);
    let actor_index = unit.parameters.push(actor_uuid);

    // ids.provenance->>'createdById'
    let provenance = Expression::ColumnReference(ColumnReference {
        correlation: Some(unit.projections.entity_ids()),
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
    unit: &mut PolicyTranslationUnit<'_, '_, A>,
    filter: &EntityResourceFilter,
) -> Expression {
    match filter {
        EntityResourceFilter::All { filters } => Expression::all(
            filters
                .iter()
                .map(|filter| convert_entity_resource_filter(unit, filter))
                .collect(),
        ),
        EntityResourceFilter::Any { filters } => Expression::any(
            filters
                .iter()
                .map(|filter| convert_entity_resource_filter(unit, filter))
                .collect(),
        ),
        EntityResourceFilter::Not { filter } => convert_entity_resource_filter(unit, filter).not(),
        EntityResourceFilter::IsOfType { entity_type } => {
            convert_is_of_type(unit, entity_type.clone())
        }
        EntityResourceFilter::IsOfBaseType { entity_type } => {
            convert_is_of_base_type(unit, entity_type.clone())
        }
        EntityResourceFilter::CreatedByPrincipal => convert_created_by_principal(unit),
    }
}

/// Converts a [`ResourceConstraint`] into a SQL [`Expression`].
///
/// Non-entity resource types (entity types, property types, data types, meta)
/// produce `FALSE` since they cannot match entity rows.
fn convert_resource_constraint<A: Allocator + Clone>(
    unit: &mut PolicyTranslationUnit<'_, '_, A>,
    constraint: &ResourceConstraint,
) -> Expression {
    match constraint {
        &ResourceConstraint::Web { web_id } => {
            let index = unit.parameters.push(web_id);

            // base.web_id = $N
            Expression::equal(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(unit.projections.temporal_metadata()),
                    name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::WebId)
                        .into(),
                }),
                Expression::Parameter(index),
            )
        }
        &ResourceConstraint::Entity(EntityResourceConstraint::Exact { id }) => {
            let index = unit.parameters.push(id);

            // base.entity_uuid = $N
            Expression::equal(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(unit.projections.temporal_metadata()),
                    name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EntityUuid)
                        .into(),
                }),
                Expression::Parameter(index),
            )
        }
        ResourceConstraint::Entity(EntityResourceConstraint::Web { web_id, filter }) => {
            let lhs =
                convert_resource_constraint(unit, &ResourceConstraint::Web { web_id: *web_id });
            let rhs = convert_entity_resource_filter(unit, filter);

            Expression::all(vec![lhs, rhs])
        }
        ResourceConstraint::Entity(EntityResourceConstraint::Any { filter }) => {
            convert_entity_resource_filter(unit, filter)
        }
        ResourceConstraint::EntityType(_)
        | ResourceConstraint::PropertyType(_)
        | ResourceConstraint::DataType(_)
        | ResourceConstraint::Meta(_) => Expression::Constant(Constant::Boolean(false)),
    }
}

/// Adds batched permit expressions from pre-analyzed [`OptimizationData`].
fn optimize<A: Allocator + Clone>(
    unit: &mut PolicyTranslationUnit<'_, '_, A>,
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
            let index = unit.parameters.push(entity_uuid);

            // base.entity_uuid = $N
            permits.get_or_insert_default().push(Expression::equal(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(unit.projections.temporal_metadata()),
                    name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EntityUuid)
                        .into(),
                }),
                Expression::Parameter(index),
            ));
        }
        entity_uuids => {
            let index = unit.parameters.push(entity_uuids.to_vec());

            // base.entity_uuid = ANY($N::uuid[])
            permits.get_or_insert_default().push(Expression::r#in(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(unit.projections.temporal_metadata()),
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
            let index = unit.parameters.push(web_id);

            // base.web_id = $N
            permits.get_or_insert_default().push(Expression::equal(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(unit.projections.temporal_metadata()),
                    name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::WebId)
                        .into(),
                }),
                Expression::Parameter(index),
            ));
        }
        web_ids => {
            let index = unit.parameters.push(web_ids.to_vec());

            // base.web_id = ANY($N::uuid[])
            permits.get_or_insert_default().push(Expression::r#in(
                Expression::ColumnReference(ColumnReference {
                    correlation: Some(unit.projections.temporal_metadata()),
                    name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::WebId)
                        .into(),
                }),
                Expression::Parameter(index)
                    .cast(PostgresType::Array(Box::new(PostgresType::Uuid))),
            ));
        }
    }
}

/// The WHERE condition produced by lowering permit/forbid policies.
pub(super) struct PolicyTranslation {
    pub condition: Expression,
}

/// Lowers [`PolicyComponents`] into a SQL condition.
///
/// Borrows shared projections and parameters so that multiple lowering
/// passes (policy, protection) accumulate into the same patch.
pub(crate) struct PolicyTranslationUnit<'parent, 'query, A: Allocator> {
    pub projections: &'parent mut AuxiliaryProjections<'query>,
    pub parameters: &'parent mut AuxiliaryParameters<A>,
    pub actor_id: Option<ActorId>,
    pub alloc: A,
}

impl<A: Allocator> PolicyTranslationUnit<'_, '_, A> {
    pub(crate) fn transpile<S>(
        &mut self,
        vertex_type: VertexType,
        policy: &PolicyComponents,
        scratch: S,
    ) -> PolicyTranslation
    where
        S: Allocator,
        A: Clone,
    {
        let action = match vertex_type {
            hashql_mir::pass::execution::VertexType::Entity => ActionName::ViewEntity,
        };
        let projections_snapshot = self.projections.snapshot();

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
                    // reset the projections to be from what they have been before
                    *self.projections = projections_snapshot;

                    // Blank forbid: deny everything, no further analysis needed.
                    return PolicyTranslation {
                        condition: Expression::Constant(Constant::Boolean(false)),
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
        let mut permits = Some(permit_constraints)
            .filter(|constraints| !constraints.is_empty())
            .map(|constraints| {
                constraints
                    .into_iter()
                    .map(|constraint| convert_resource_constraint(self, constraint))
                    .collect()
            });
        if !blank_permit {
            optimize(self, &mut permits, optimization_data);
        }
        let permits = permits.map(Expression::any);

        let forbids = Some(forbid_constraints)
            .filter(|constraints| !constraints.is_empty())
            .map(|constraints| {
                constraints
                    .into_iter()
                    .map(|constraint| convert_resource_constraint(self, constraint))
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

        PolicyTranslation {
            condition: expression,
        }
    }
}
