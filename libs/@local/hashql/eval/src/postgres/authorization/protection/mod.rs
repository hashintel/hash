use core::alloc::Allocator;

use hash_graph_authorization::policies::PolicyComponents;
use hash_graph_postgres_store::store::postgres::query::{
    Column, ColumnReference, Constant, Expression, Function, PostgresType, table,
};
use hash_graph_store::filter::{
    Parameter,
    protection::{
        PropertyFilter, PropertyFilterEntityQueryPath, PropertyFilterExpression,
        PropertyFilterExpressionList, PropertyProtectionFilterConfig,
    },
};
use type_system::{ontology::BaseUrl, principal::actor::ActorId};

use crate::postgres::{parameters::AuxiliaryParameters, projections::AuxiliaryProjections};

#[cfg(test)]
mod tests;

/// Resolves a query path to its backing column.
fn resolve_path<A: Allocator>(
    unit: &mut ProtectionTranslationUnit<'_, A>,
    path: PropertyFilterEntityQueryPath,
) -> Expression {
    match path {
        // base.entity_uuid
        PropertyFilterEntityQueryPath::Uuid => Expression::ColumnReference(ColumnReference {
            correlation: Some(unit.projections.temporal_metadata()),
            name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EntityUuid).into(),
        }),
        // eec.base_urls
        PropertyFilterEntityQueryPath::TypeBaseUrls => {
            Expression::ColumnReference(ColumnReference {
                correlation: Some(unit.projections.entity_edition_cache()),
                name: Column::EntityEditionCache(table::EntityEditionCache::BaseUrls).into(),
            })
        }
    }
}

/// Resolves a filter operand to a SQL expression.
///
/// Returns [`None`] for an actor operand when no actor is present.
fn resolve_expression<A: Allocator + Clone>(
    unit: &mut ProtectionTranslationUnit<'_, A>,
    expression: &PropertyFilterExpression<'_>,
) -> Option<Expression> {
    match expression {
        &PropertyFilterExpression::Path { path } => Some(resolve_path(unit, path)),
        PropertyFilterExpression::Parameter { parameter } => {
            let index = match parameter {
                &Parameter::Boolean(bool) => unit.parameters.push(bool),
                Parameter::Decimal(decimal) => unit.parameters.push(decimal.clone()),
                Parameter::Text(text) => unit.parameters.push(text.clone().into_owned()),
                Parameter::Vector(embedding) => unit.parameters.push(embedding.to_owned()),
                Parameter::Any(value) => unit.parameters.push(value.clone()),
                &Parameter::Uuid(uuid) => unit.parameters.push(uuid),
                Parameter::OntologyTypeVersion(version) => {
                    unit.parameters.push(version.clone().into_owned())
                }
                &Parameter::Timestamp(timestamp) => unit.parameters.push(timestamp),
            };

            Some(Expression::Parameter(index))
        }
        PropertyFilterExpression::ActorId => {
            let index = unit.parameters.push(unit.actor_id?);

            Some(Expression::Parameter(index))
        }
    }
}

/// Resolves operands, rolling back their parameters and joins if any is absent.
fn resolve_operands<A: Allocator + Clone, const N: usize>(
    unit: &mut ProtectionTranslationUnit<'_, A>,
    operands: [&PropertyFilterExpression<'_>; N],
) -> Option<[Expression; N]> {
    let checkpoint = unit.parameters.checkpoint();
    let projections = unit.projections.snapshot();

    let result = operands.try_map(|operand| resolve_expression(unit, operand));
    if result.is_none() {
        unit.parameters.rollback(checkpoint);
        *unit.projections = projections;
    }

    result
}

/// Lowers a [`PropertyFilter`] condition tree into a SQL boolean expression.
fn lower_filter<A: Allocator + Clone>(
    unit: &mut ProtectionTranslationUnit<'_, A>,
    filter: &PropertyFilter<'_>,
) -> Expression {
    match filter {
        PropertyFilter::All(filters) => Expression::all(
            filters
                .iter()
                .map(|filter| lower_filter(unit, filter))
                .collect(),
        ),
        PropertyFilter::Any(filters) => Expression::any(
            filters
                .iter()
                .map(|filter| lower_filter(unit, filter))
                .collect(),
        ),
        // anonymous requests have no actor identity to match. Equality is false and inequality is
        // true to preserve non-owner masking.
        PropertyFilter::Equal(lhs, rhs) => resolve_operands(unit, [lhs, rhs]).map_or(
            Expression::Constant(Constant::Boolean(false)),
            |[lhs, rhs]| Expression::equal(lhs, rhs),
        ),
        PropertyFilter::NotEqual(lhs, rhs) => resolve_operands(unit, [lhs, rhs]).map_or(
            Expression::Constant(Constant::Boolean(true)),
            |[lhs, rhs]| Expression::not_equal(lhs, rhs),
        ),
        // $lhs = ANY($rhs)
        PropertyFilter::In(lhs, rhs) => {
            let Some(lhs) = resolve_expression(unit, lhs) else {
                return Expression::Constant(Constant::Boolean(false));
            };

            let rhs = match rhs {
                &PropertyFilterExpressionList::Path { path } => resolve_path(unit, path),
            };

            Expression::r#in(lhs, rhs)
        }
    }
}

/// Builds the mask expression for a single protected property.
///
/// ```sql
/// CASE WHEN <condition>
///      THEN ARRAY[$url]::text[]
///      ELSE '{}'::text[]
/// END
/// ```
///
/// Evaluates to a single-element array containing the property's base URL
/// when the condition holds (property should be masked), or an empty array
/// otherwise.
fn lower_property_filter<A: Allocator + Clone>(
    unit: &mut ProtectionTranslationUnit<'_, A>,
    property_url: BaseUrl,
    filter: &PropertyFilter<'_>,
) -> Expression {
    let condition = lower_filter(unit, filter);
    let url_index = unit.parameters.push(property_url);

    // CASE WHEN <condition> THEN ARRAY[$url]::text[] ELSE '{}'::text[] END
    Expression::CaseWhen {
        conditions: vec![(
            condition,
            Expression::Function(Function::ArrayLiteral {
                elements: vec![Expression::Parameter(url_index)],
                element_type: PostgresType::Text,
            }),
        )],
        else_result: Some(Box::new(Expression::Function(Function::ArrayLiteral {
            elements: vec![],
            element_type: PostgresType::Text,
        }))),
    }
}

/// The mask expression produced by lowering property protection rules.
///
/// When present, this expression evaluates to a `text[]` of property base URLs
/// that should be stripped. It is subtracted from the `properties` and
/// `property_metadata` columns inside the `entity_editions` LATERAL subquery.
pub(super) struct ProtectionTranslation {
    /// `NULL` when no properties are protected (no masking needed).
    pub keys_to_remove: Option<Expression>,
}

/// Lowers [`PropertyProtectionFilterConfig`] into a mask expression.
///
/// Borrows shared projections and parameters so that multiple lowering
/// passes (policy, protection) accumulate into the same patch.
pub(crate) struct ProtectionTranslationUnit<'parent, A: Allocator> {
    pub projections: &'parent mut AuxiliaryProjections,
    pub parameters: &'parent mut AuxiliaryParameters<A>,
    pub actor_id: Option<ActorId>,
}

impl<A: Allocator + Clone> ProtectionTranslationUnit<'_, A> {
    pub(crate) fn transpile(
        &mut self,
        policy: &PolicyComponents,
        config: &PropertyProtectionFilterConfig<'_>,
    ) -> ProtectionTranslation {
        if config.is_empty() || policy.is_instance_admin() {
            return ProtectionTranslation {
                keys_to_remove: None,
            };
        }

        let cases: Vec<_> = config
            .property_filters()
            .iter()
            .map(|(property_url, filter)| lower_property_filter(self, property_url.clone(), filter))
            .collect();

        // array_cat(CASE ..., CASE ..., ...)
        ProtectionTranslation {
            keys_to_remove: Some(Expression::concatenate(cases)),
        }
    }
}
