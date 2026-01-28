//! Property masking for protected fields in SELECT statements.
//!
//! This module generates SQL expressions that remove protected properties (e.g., email)
//! from entity responses at the database level, ensuring they never leave the database
//! unless the actor is the entity owner.
//!
//! # Architecture
//!
//! The masking is implemented as a JSONB key deletion with conditional array building:
//!
//! ```sql
//! properties - (
//!     (CASE WHEN condition1 THEN ARRAY['prop1/', 'prop2/'] ELSE ARRAY[] END)
//!     ||
//!     (CASE WHEN condition2 THEN ARRAY['prop3/'] ELSE ARRAY[] END)
//! )
//! ```
//!
//! This approach:
//! - Evaluates ALL conditions (not just first match like CASE WHEN branches)
//! - Handles multi-type entities correctly (entity can have `User` AND `SecretEntity` types)
//! - Only removes properties when the exclusion condition matches

use hash_graph_store::filter::protection::{
    CellFilter, CellFilterExpression, CellFilterExpressionList, FilterProtectionConfig,
};
use type_system::{ontology::id::BaseUrl, principal::actor::ActorId};
use uuid::Uuid;

use super::{
    Condition, Expression, Function,
    expression::{Constant, PostgresType},
    table::{Column, EntityIsOfTypeIds, EntityTemporalMetadata},
};
use crate::store::postgres::query::Alias;

/// Aliases needed for property masking column references.
#[derive(Debug, Clone, Copy)]
pub struct MaskingAliases {
    /// Alias for `entity_temporal_metadata` table (base table for entity queries).
    pub base_alias: Alias,
    /// Alias for `entity_is_of_type_ids` table.
    pub entity_is_of_type_alias: Alias,
}

/// Builds a masking expression that removes protected properties from a JSONB column.
///
/// # Arguments
///
/// * `config` - The filter protection configuration containing property->exclusion mappings
/// * `actor_id` - The current actor's ID (for self-exclusion bypass)
/// * `properties_column` - The expression for the properties JSONB column
/// * `aliases` - Table aliases for column references used in masking conditions
///
/// # Returns
///
/// An `Expression` that evaluates to the properties JSONB with protected keys removed,
/// or `None` if no masking is needed.
#[must_use]
pub fn build_masking_expression(
    config: &FilterProtectionConfig<'_>,
    actor_id: Option<ActorId>,
    properties_column: Expression,
    aliases: MaskingAliases,
) -> Option<Expression> {
    if config.is_empty() {
        return None;
    }

    let rules: Vec<_> = config.protection_rules().collect();
    if rules.is_empty() {
        return None;
    }

    // Build CASE WHEN expressions for each rule
    let case_expressions: Vec<Expression> = rules
        .iter()
        .map(|(property_url, cell_filter)| {
            build_case_when_for_rule(property_url, cell_filter, actor_id, aliases)
        })
        .collect();

    // If only one rule, no need to concatenate
    let keys_to_remove = if case_expressions.len() == 1 {
        case_expressions
            .into_iter()
            .next()
            .expect("checked that len == 1")
    } else {
        Expression::Function(Function::ArrayConcat(case_expressions))
    };

    // Apply JsonDeleteKeys to remove the masked properties
    Some(Expression::Function(Function::JsonDeleteKeys(
        Box::new(properties_column),
        Box::new(keys_to_remove),
    )))
}

/// Builds a CASE WHEN expression for a single protection rule.
///
/// ```sql
/// CASE WHEN {condition} THEN ARRAY['{property_url}']::text[] ELSE ARRAY[]::text[] END
/// ```
fn build_case_when_for_rule(
    property_url: &BaseUrl,
    cell_filter: &CellFilter<'_>,
    actor_id: Option<ActorId>,
    aliases: MaskingAliases,
) -> Expression {
    let condition = cell_filter_to_condition(cell_filter, actor_id, aliases);

    // The THEN branch: ARRAY['{property_url}']::text[]
    let then_expr = Expression::Function(Function::ArrayLiteral {
        elements: vec![Expression::Constant(Constant::String(
            // SAFETY: We leak the string to get a 'static lifetime.
            // This is acceptable because these are configuration values that live for the
            // duration of the query.
            Box::leak(property_url.as_str().to_owned().into_boxed_str()),
        ))],
        element_type: PostgresType::Text,
    });

    // The ELSE branch: ARRAY[]::text[]
    let else_expr = Expression::Function(Function::ArrayLiteral {
        elements: vec![],
        element_type: PostgresType::Text,
    });

    Expression::CaseWhen {
        conditions: vec![(
            Box::new(Expression::Condition(Box::new(condition))),
            Box::new(then_expr),
        )],
        else_result: Some(Box::new(else_expr)),
    }
}

/// Converts a [`CellFilter`] to a SQL [`Condition`].
fn cell_filter_to_condition(
    filter: &CellFilter<'_>,
    actor_id: Option<ActorId>,
    aliases: MaskingAliases,
) -> Condition {
    match filter {
        CellFilter::All(filters) => {
            let conditions: Vec<_> = filters
                .iter()
                .map(|inner| cell_filter_to_condition(inner, actor_id, aliases))
                .collect();
            Condition::All(conditions)
        }
        CellFilter::Any(filters) => {
            let conditions: Vec<_> = filters
                .iter()
                .map(|inner| cell_filter_to_condition(inner, actor_id, aliases))
                .collect();
            Condition::Any(conditions)
        }
        CellFilter::Equal(lhs, rhs) => {
            let lhs_expr = cell_filter_expression_to_expression(lhs, actor_id, aliases);
            let rhs_expr = cell_filter_expression_to_expression(rhs, actor_id, aliases);
            Condition::Equal(lhs_expr, rhs_expr)
        }
        CellFilter::NotEqual(lhs, rhs) => {
            let lhs_expr = cell_filter_expression_to_expression(lhs, actor_id, aliases);
            let rhs_expr = cell_filter_expression_to_expression(rhs, actor_id, aliases);
            Condition::NotEqual(lhs_expr, rhs_expr)
        }
        CellFilter::In(value, list) => {
            let value_expr = cell_filter_expression_to_expression(value, actor_id, aliases);
            let list_expr = cell_filter_expression_list_to_expression(list, aliases);
            // Use IN/ANY for array membership: value = ANY(array_column)
            Condition::In(value_expr, list_expr)
        }
    }
}

/// Converts a [`CellFilterExpression`] to a SQL [`Expression`].
#[expect(
    clippy::wildcard_enum_match_arm,
    reason = "Only paths/parameters used in hash_default() are supported"
)]
fn cell_filter_expression_to_expression(
    expr: &CellFilterExpression<'_>,
    actor_id: Option<ActorId>,
    aliases: MaskingAliases,
) -> Expression {
    use hash_graph_store::{entity::EntityQueryPath, filter::Parameter};

    match expr {
        CellFilterExpression::Path { path } => {
            // Convert EntityQueryPath to column expression
            match path {
                EntityQueryPath::Uuid => {
                    // Uuid is on the base table (entity_temporal_metadata)
                    Expression::ColumnReference(
                        Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid)
                            .aliased(aliases.base_alias),
                    )
                }
                EntityQueryPath::TypeBaseUrls => {
                    // TypeBaseUrls is on entity_is_of_type_ids
                    Expression::ColumnReference(
                        Column::EntityIsOfTypeIds(EntityIsOfTypeIds::BaseUrls)
                            .aliased(aliases.entity_is_of_type_alias),
                    )
                }
                _ => {
                    // For other paths, we'd need full path compilation.
                    // For now, only support the paths used in hash_default().
                    unimplemented!(
                        "CellFilterExpression path {:?} not yet supported for masking",
                        path
                    );
                }
            }
        }
        CellFilterExpression::Parameter { parameter } => {
            // Convert parameter to expression
            match parameter {
                Parameter::Text(text) => {
                    // For text parameters used in type checks, we embed them as constants
                    // since they're known at query-build time.
                    Expression::Constant(Constant::String(
                        // SAFETY: We leak the string to get a 'static lifetime.
                        Box::leak(text.to_string().into_boxed_str()),
                    ))
                }
                _ => {
                    unimplemented!(
                        "CellFilterExpression parameter {:?} not yet supported for masking",
                        parameter
                    );
                }
            }
        }
        CellFilterExpression::ActorId => {
            // Use the actor's UUID if available, otherwise use nil UUID
            let uuid: Uuid = actor_id.map_or(Uuid::nil(), Into::into);
            // Embed the UUID as a string constant (for comparison with entity UUID)
            Expression::Constant(Constant::String(Box::leak(
                uuid.to_string().into_boxed_str(),
            )))
        }
    }
}

/// Converts a [`CellFilterExpressionList`] to a SQL [`Expression`] for array membership checks.
#[expect(
    clippy::wildcard_enum_match_arm,
    reason = "Only paths used in hash_default() are supported"
)]
fn cell_filter_expression_list_to_expression(
    list: &CellFilterExpressionList<'_>,
    aliases: MaskingAliases,
) -> Expression {
    use hash_graph_store::entity::EntityQueryPath;

    match list {
        CellFilterExpressionList::Path { path } => {
            match path {
                EntityQueryPath::TypeBaseUrls => {
                    // TypeBaseUrls is an array column from the entity_is_of_type join
                    Expression::ColumnReference(
                        Column::EntityIsOfTypeIds(EntityIsOfTypeIds::BaseUrls)
                            .aliased(aliases.entity_is_of_type_alias),
                    )
                }
                _ => {
                    unimplemented!(
                        "CellFilterExpressionList path {:?} not yet supported for masking",
                        path
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_store::filter::protection::FilterProtectionConfig;

    use super::*;
    use crate::store::postgres::query::{Transpile as _, table::EntityEditions};

    #[test]
    fn build_masking_for_hash_default() {
        let config = FilterProtectionConfig::hash_default();
        let properties_column = Expression::ColumnReference(
            Column::EntityEditions(EntityEditions::Properties).aliased(Alias {
                condition_index: 0,
                chain_depth: 0,
                number: 0,
            }),
        );
        let aliases = MaskingAliases {
            base_alias: Alias {
                condition_index: 0,
                chain_depth: 0,
                number: 0,
            },
            entity_is_of_type_alias: Alias {
                condition_index: 0,
                chain_depth: 0,
                number: 0,
            },
        };

        let result = build_masking_expression(&config, None, properties_column, aliases);

        let expr = result.expect("masking expression should be Some for hash_default config");
        let sql = expr.transpile_to_string();

        // Should contain CASE WHEN for the type check
        assert!(sql.contains("CASE"));
        assert!(sql.contains("WHEN"));
        // Should contain the email property URL
        assert!(sql.contains("email"));
        // Should delete keys from properties
        assert!(sql.contains(" - "));
    }

    #[test]
    fn empty_config_returns_none() {
        let config = FilterProtectionConfig::new();
        let properties_column = Expression::Constant(Constant::String("{}"));
        let aliases = MaskingAliases {
            base_alias: Alias {
                condition_index: 0,
                chain_depth: 0,
                number: 0,
            },
            entity_is_of_type_alias: Alias {
                condition_index: 0,
                chain_depth: 0,
                number: 0,
            },
        };

        let result = build_masking_expression(&config, None, properties_column, aliases);

        assert!(result.is_none());
    }
}
