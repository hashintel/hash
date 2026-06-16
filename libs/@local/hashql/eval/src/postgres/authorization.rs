//! Converts authorization policies into SQL conditions for entity queries.
//!
//! The compilation pipeline produces actor-agnostic queries. This module grafts
//! actor-specific policy conditions onto those queries at runtime, just before
//! the orchestrator executes them.
//!
//! The entry point is [`analysis_in`], which takes a compiled [`PreparedQuery`]
//! and a [`PolicyComponents`] and produces an [`AnalysisResidual`] containing:
//!
//! - A combined WHERE condition (the permit/forbid algebra)
//! - Auxiliary parameter values referenced by that condition
//! - The [`AuthorizationProjections`] that tracks which joins need to be appended

use alloc::borrow::Cow;
use core::alloc::Allocator;

use hash_graph_authorization::policies::{
    Effect, OptimizationData, PolicyComponents,
    action::ActionName,
    resource::{EntityResourceConstraint, EntityResourceFilter, ResourceConstraint},
};
use hash_graph_postgres_store::store::postgres::query::{
    Alias, BinaryExpression, BinaryOperator, Column, ColumnReference, Constant, Expression,
    ForeignKeyReference, FromItem, JoinType, PostgresType, Table, TableName, TableReference, table,
};
use hash_graph_store::filter::PathToken;
use postgres_types::ToSql;
use type_system::{
    ontology::{BaseUrl, VersionedUrl},
    principal::actor::{ActorEntityUuid, ActorId},
};

use super::{PreparedQuery, projections::Projections};

/// Tracks joins that authorization conditions require beyond what the compiled
/// query already provides.
///
/// Each accessor checks the base [`Projections`] first. If the table is already
/// joined in the compiled query, its alias is reused directly. Otherwise, a new
/// alias is allocated and the join is recorded for later compilation via
/// [`build_joins`](Self::build_joins).
struct AuthorizationProjections<'base> {
    index: usize,
    base: &'base Projections,

    entity_editions: Option<Alias>,
    entity_is_of_type_ids: Option<Alias>,
}

impl<'base> AuthorizationProjections<'base> {
    const fn new(base: &'base Projections) -> Self {
        Self {
            index: base.index,
            base,
            entity_editions: None,
            entity_is_of_type_ids: None,
        }
    }

    const fn next_alias(&mut self) -> Alias {
        let alias = Alias {
            condition_index: 0,
            chain_depth: 0,
            number: self.index,
        };
        self.index += 1;
        alias
    }

    fn temporal_metadata(&self) -> TableReference<'static> {
        self.base.temporal_metadata()
    }

    /// Returns a reference to `entity_editions`, reusing the base join when available.
    ///
    /// Used by [`CreatedByPrincipal`](EntityResourceFilter::CreatedByPrincipal) to access
    /// the `provenance` column.
    fn entity_editions(&mut self) -> TableReference<'static> {
        let alias = if let Some(base_alias) = self.base.entity_editions {
            base_alias
        } else if let Some(alias) = self.entity_editions {
            alias
        } else {
            let alias = self.next_alias();
            self.entity_editions = Some(alias);
            alias
        };

        TableReference {
            schema: None,
            name: TableName::from(Table::EntityEditions),
            alias: Some(alias),
        }
    }

    /// Returns a reference to `entity_is_of_type_ids`.
    ///
    /// Always allocates its own join. The base projections' `entity_type_ids` is a
    /// LATERAL aggregate (UNNEST + jsonb_agg for the result set); its internal table
    /// references are scoped to the subquery and not visible here.
    fn entity_is_of_type_ids(&mut self) -> TableReference<'static> {
        let alias = if let Some(alias) = self.entity_is_of_type_ids {
            alias
        } else {
            let alias = self.next_alias();
            self.entity_is_of_type_ids = Some(alias);
            alias
        };

        TableReference {
            schema: None,
            name: TableName::from(Table::EntityIsOfTypeIds),
            alias: Some(alias),
        }
    }

    /// Appends authorization-specific joins to the FROM tree.
    ///
    /// Only produces joins for tables that were not already present in the base
    /// projections. Tables reused from the base are referenced by their existing
    /// alias and require no additional join.
    fn build_joins(&self, mut from: FromItem<'static>) -> FromItem<'static> {
        if let Some(alias) = self.entity_editions {
            let fk = ForeignKeyReference::Single {
                on: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EditionId),
                join: Column::EntityEditions(table::EntityEditions::EditionId),
                join_type: JoinType::Inner,
            };

            from = from
                .join(
                    JoinType::Inner,
                    FromItem::table(Table::EntityEditions)
                        .alias(Table::EntityEditions.aliased(alias)),
                )
                .on(fk.conditions(self.base.base_alias, alias))
                .build();
        }

        if let Some(alias) = self.entity_is_of_type_ids {
            let fk = ForeignKeyReference::Single {
                on: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EditionId),
                join: Column::EntityIsOfTypeIds(table::EntityIsOfTypeIds::EntityEditionId),
                join_type: JoinType::Inner,
            };

            from = from
                .join(
                    JoinType::Inner,
                    FromItem::table(Table::EntityIsOfTypeIds)
                        .alias(Table::EntityIsOfTypeIds.aliased(alias)),
                )
                .on(fk.conditions(self.base.base_alias, alias))
                .build();
        }

        from
    }
}

/// Accumulates runtime parameter values for authorization conditions.
///
/// Compiled parameters occupy `$1..$K`. Auxiliary parameters start at `$K+1`
/// and are appended after compiled parameters during encoding.
struct AuxiliaryParameters<A: Allocator> {
    initial_offset: usize,
    parameters: Vec<Box<dyn ToSql + Sync, A>, A>,
}

impl<A: Allocator> AuxiliaryParameters<A> {
    /// Pushes a value and returns its 1-based parameter index (`$N`).
    fn push(&mut self, value: impl ToSql + Sync + 'static) -> usize
    where
        A: Clone,
    {
        let alloc = self.parameters.allocator().clone();
        self.parameters.push(Box::new_in(value, alloc));

        self.parameters.len() + self.initial_offset
    }
}

/// Working state for converting policies into SQL expressions.
struct PreparedAnalysis<'query, A: Allocator> {
    projections: AuthorizationProjections<'query>,
    parameters: AuxiliaryParameters<A>,
    actor_id: Option<ActorId>,
}

impl<'query, A: Allocator> PreparedAnalysis<'query, A> {
    fn new_in(
        query: &'query PreparedQuery<'_, impl Allocator>,
        policy: &PolicyComponents,
        alloc: A,
    ) -> Self {
        Self {
            projections: AuthorizationProjections::new(&query.projections),
            parameters: AuxiliaryParameters {
                initial_offset: query.parameters.len(),
                parameters: Vec::new_in(alloc),
            },
            actor_id: policy.actor_id(),
        }
    }
}

/// The result of analyzing policies for a single query.
///
/// Contains everything needed to graft authorization onto the compiled query:
/// a WHERE condition, the runtime parameter values it references, and the
/// projections that track which joins need to be appended to the FROM tree.
struct AnalysisResidual<'query, A: Allocator> {
    /// Combined permit/forbid condition.
    condition: Expression,
    /// Runtime values referenced by `condition` via `$N` parameter indices.
    auxiliary_parameters: Vec<Box<dyn ToSql + Sync, A>, A>,
    /// Tracks joins that need to be appended to the FROM tree.
    projections: AuthorizationProjections<'query>,
}

/// Checks whether the entity has a specific `(base_url, version)` type pair.
///
/// Joins `entity_is_of_type_ids` (a view with parallel `base_urls text[]` and
/// `versions bigint[]` arrays). Uses `array_positions` to find all subscripts
/// where each value matches, then checks whether the two position sets overlap:
///
/// ```sql
/// array_positions(eit.base_urls, $base::text)
/// && array_positions(eit.versions, $version::bigint)
/// ```
///
/// This preserves the pairing invariant: the overlap means there is some index `i`
/// where `base_urls[i] = $base AND versions[i] = $version`.
fn convert_is_of_type<A: Allocator + Clone>(
    output: &mut PreparedAnalysis<'_, A>,
    url: VersionedUrl,
) -> Expression {
    let table = output.projections.entity_is_of_type_ids();

    let base_url_index = output.parameters.push(url.base_url);
    let version_index = output.parameters.push(url.version);

    // array_positions(table.base_urls, $base)
    let base_url_positions = Expression::Function(
        hash_graph_postgres_store::store::postgres::query::Function::ArrayPositions(
            Box::new(Expression::ColumnReference(ColumnReference {
                correlation: Some(table.clone()),
                name: Column::EntityIsOfTypeIds(table::EntityIsOfTypeIds::BaseUrls).into(),
            })),
            Box::new(Expression::Parameter(base_url_index)),
        ),
    );

    // array_positions(table.versions, $version)
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
    // The overlap operator checks if the two integer arrays share any element,
    // which means there is a position where both base_url and version match.
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
/// Compares `entity_editions.provenance->>'createdById'` against the actor UUID.
/// For anonymous/public requests (no actor), compares against the public actor UUID.
fn convert_created_by_principal<A: Allocator + Clone>(
    output: &mut PreparedAnalysis<'_, A>,
) -> Expression {
    let actor_uuid = output
        .actor_id
        .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from);
    let actor_index = output.parameters.push(actor_uuid);

    let provenance = Expression::ColumnReference(ColumnReference {
        correlation: Some(output.projections.entity_editions()),
        name: Column::EntityEditions(table::EntityEditions::Provenance).into(),
    });

    let created_by = Expression::Function(
        hash_graph_postgres_store::store::postgres::query::Function::JsonExtractAsText(
            Box::new(provenance),
            PathToken::Field(Cow::Borrowed("createdById")),
        ),
    );

    Expression::equal(created_by, Expression::Parameter(actor_index))
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

fn analysis_in<'query, A: Allocator + Clone>(
    query: &'query PreparedQuery<'_, impl Allocator>,
    policy: &PolicyComponents,
    alloc: A,
) -> AnalysisResidual<'query, A> {
    let action = match query.vertex_type {
        hashql_mir::pass::execution::VertexType::Entity => ActionName::ViewEntity,
    };
    let policies = policy.extract_filter_policies(action);
    let optimization_data = policy.optimization_data(action);

    let mut output = PreparedAnalysis::new_in(query, policy, alloc);
    let mut permits: Option<Vec<Expression>> = None;
    let mut forbids: Option<Vec<Expression>> = None;
    let mut blank_permit = false;

    for (effect, constraint) in policies {
        match (effect, constraint) {
            (Effect::Permit, _) if blank_permit => {}
            (Effect::Permit, None) => blank_permit = true,
            (Effect::Forbid, None) => {
                // Blank forbid: deny everything, no further analysis needed.

                return AnalysisResidual {
                    condition: Expression::Constant(Constant::Boolean(false)),
                    auxiliary_parameters: Vec::new_in(
                        output.parameters.parameters.allocator().clone(),
                    ),
                    projections: AuthorizationProjections::new(output.projections.base),
                };
            }
            (Effect::Permit, Some(constraint)) => {
                permits
                    .get_or_insert_default()
                    .push(convert_resource_constraint(&mut output, constraint));
            }
            (Effect::Forbid, Some(constraint)) => {
                forbids
                    .get_or_insert_default()
                    .push(convert_resource_constraint(&mut output, constraint));
            }
        }
    }

    optimize(&mut output, &mut permits, optimization_data);

    let permits = permits.map(Expression::any);
    let forbids = forbids.map(Expression::any);

    let expression = match (blank_permit, permits, forbids) {
        (true, _, None) => Expression::Constant(Constant::Boolean(true)),
        (true, _, Some(forbids)) => forbids.not(),
        (false, None, _) => Expression::Constant(Constant::Boolean(false)),
        (false, Some(permits), None) => permits,
        (false, Some(permits), Some(forbids)) => Expression::all(vec![permits, forbids.not()]),
    };

    AnalysisResidual {
        condition: expression,
        auxiliary_parameters: output.parameters.parameters,
        projections: output.projections,
    }
}
