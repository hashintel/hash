//! Grafts actor-specific authorization onto compiled queries at runtime.
//!
//! The compilation pipeline produces actor-agnostic queries. This module patches
//! them with two kinds of runtime conditions:
//!
//! - **Policy** ([`policy`]): permit/forbid admission conditions added to WHERE
//! - **Protection** ([`protection`]): property masking applied inside the `entity_editions` LATERAL
//!   subquery
use alloc::borrow::Cow;
use core::{alloc::Allocator, mem};

use hash_graph_authorization::policies::PolicyComponents;
use hash_graph_postgres_store::store::postgres::query::{
    Expression, FromItem, Function, SelectExpression, Table, TableName,
    table::{self, DatabaseColumn as _},
};
use hash_graph_store::filter::{PathToken, protection::PropertyProtectionFilterConfig};

use self::{
    policy::{PolicyTranslation, PolicyTranslationUnit},
    protection::ProtectionTranslationUnit,
};
use super::{
    PatchPreparedQueryLayer,
    prepared::{PatchContext, PatchPreparedQuery},
};

mod policy;
mod protection;
#[cfg(test)]
mod tests;

fn find_from_by_name<'from, 'id>(
    from: &'from mut FromItem<'id>,
    needle: &TableName<'_>,
) -> Option<&'from mut FromItem<'id>> {
    match from {
        FromItem::Table {
            only: _,
            table: _,
            alias: Some(alias),
            column_aliases: _,
            tablesample: _,
        } if *needle == *alias => Some(from),
        FromItem::Subquery {
            lateral: _,
            statement: _,
            alias: Some(alias),
            column_aliases: _,
        } if *needle == *alias => Some(from),
        FromItem::Function {
            lateral: _,
            function: _,
            with_ordinality: _,
            alias: Some(alias),
            column_aliases: _,
        } if *needle == *alias => Some(from),
        FromItem::JoinUsing {
            left: _,
            join_type: _,
            right: _,
            columns: _,
            alias: Some(alias),
        } if *needle == *alias => Some(from),
        FromItem::JoinOn {
            left,
            join_type: _,
            right,
            condition: _,
        }
        | FromItem::JoinUsing {
            left,
            join_type: _,
            right,
            columns: _,
            alias: _,
        }
        | FromItem::CrossJoin { left, right }
        | FromItem::NaturalJoin {
            left,
            join_type: _,
            right,
        } => {
            // right biased, that way we're faster in finding our goal, as our tree is left-heavy,
            // with leaves being on the right side.
            find_from_by_name(right, needle).or_else(|| find_from_by_name(left, needle))
        }
        FromItem::Table { .. } | FromItem::Subquery { .. } | FromItem::Function { .. } => None,
    }
}

/// Patch layer that grafts actor-specific authorization onto a compiled query.
///
/// Adds two kinds of runtime conditions:
///
/// - **Policy admission**: permit/forbid conditions appended to WHERE.
/// - **Property masking**: CASE WHEN expressions grafted into the `entity_editions` LATERAL
///   subquery, stripping protected property keys from `properties` and `property_metadata.value`.
///
/// This layer must be the innermost in the [`PreparedQueryPatch`] pipeline.
/// It locates the `entity_editions` LATERAL by the alias assigned during
/// compilation. If an outer layer were to introduce its own `entity_editions`,
/// the graft would patch the wrong node and masking would be bypassed.
///
/// [`PreparedQueryPatch`]: super::PreparedQueryPatch
pub struct AuthorizationPatch<'policy, 'path> {
    policy: &'policy PolicyComponents,
    properties: &'policy PropertyProtectionFilterConfig<'path>,
}

impl<'policy, 'path> AuthorizationPatch<'policy, 'path> {
    #[must_use]
    pub const fn new(
        policy: &'policy PolicyComponents,
        properties: &'policy PropertyProtectionFilterConfig<'path>,
    ) -> Self {
        Self { policy, properties }
    }
}

impl<A: Allocator + Clone, S: Allocator> PatchPreparedQueryLayer<A, S>
    for AuthorizationPatch<'_, '_>
{
    fn patch_query<N>(
        &self,
        context: &mut PatchContext<'_, A>,
        query: &mut super::PreparedQuery<'_, A>,
        scratch: S,
        next: &N,
    ) where
        N: PatchPreparedQuery<A, S>,
    {
        let mut policy = PolicyTranslationUnit {
            projections: &mut context.projections,
            parameters: &mut query.auxiliary_parameters,
            actor_id: self.policy.actor_id(),
        };
        let PolicyTranslation { condition } =
            policy.transpile(query.vertex_type, self.policy, &scratch);

        query
            .statement
            .select_clause
            .as_simple_mut()
            .unwrap_or_else(|| unreachable!("prepared queries are always simple queries"))
            .add_condition(condition, |lhs, rhs| Expression::all(vec![lhs, rhs]));

        // Lower protection before join materialization to register its join demands (e.g.
        // entity_edition_cache for TypeBaseUrls). Apply the resulting mask after building those
        // joins.
        let entity_edition_alias = context.projections.entity_edition_alias();

        let keys_to_remove = entity_edition_alias.and_then(|_| {
            let mut protection = ProtectionTranslationUnit {
                projections: &mut context.projections,
                parameters: &mut query.auxiliary_parameters,
                actor_id: self.policy.actor_id(),
            };

            protection
                .transpile(self.policy, self.properties)
                .keys_to_remove
        });

        next.patch_query(context, query, scratch);

        let select = query
            .statement
            .select_clause
            .as_simple_mut()
            .unwrap_or_else(|| unreachable!("prepared queries always have a select clause"));

        let Some((entity_edition_alias, keys_to_remove)) =
            Option::zip(entity_edition_alias, keys_to_remove)
        else {
            return;
        };

        let entity_edition_reference = Table::EntityEditions.aliased_name(entity_edition_alias);
        let from = select
            .from
            .as_mut()
            .unwrap_or_else(|| unreachable!("prepared queries always have a from value"));

        let Some(FromItem::Subquery {
            lateral: _,
            statement,
            alias: _,
            column_aliases: _,
        }) = find_from_by_name(from, &entity_edition_reference)
        else {
            unreachable!(
                "entity_edition_alias not found in from clause, even though it has been requested"
            );
        };

        let entity_editions_select = statement.select_clause.as_simple_mut().unwrap_or_else(|| {
            unreachable!("entity editions joined table is always a simple query")
        });

        #[cfg(debug_assertions)]
        let mut grafted_columns = 0_u32;

        for column in &mut entity_editions_select.selects {
            let SelectExpression::Expression {
                expression,
                output_name: Some(alias),
            } = column
            else {
                unreachable!(
                    "selects must be expressions, see: projections::build_entity_editions"
                );
            };

            let is_metadata =
                alias.as_ref() == table::EntityEditions::PropertyMetadata.name().as_str();
            if alias.as_ref() == table::EntityEditions::Properties.name().as_str() || is_metadata {
                let base = mem::replace(expression, Expression::Parameter(0));

                *expression = if is_metadata {
                    // `property_metadata` has some indirection. values live under `value`.
                    let values = Expression::from(Function::JsonExtract(
                        Box::new(base.clone()),
                        PathToken::Field(Cow::Borrowed("value")),
                    ))
                    .coalesce(Function::JsonBuildObject(Vec::new()));

                    let path = query.auxiliary_parameters.push(["value"].as_slice());
                    Expression::from(Function::JsonSet {
                        target: Box::new(base),
                        path: Box::new(Expression::Parameter(path)),
                        value: Box::new(values.subtract(keys_to_remove.clone())),
                    })
                } else {
                    // Group the subtraction so subsequent operators bind to its result.
                    base.subtract(keys_to_remove.clone()).grouped()
                };

                #[cfg(debug_assertions)]
                {
                    grafted_columns += 1;
                }
            }
        }

        #[cfg(debug_assertions)]
        {
            debug_assert_eq!(
                grafted_columns, 2,
                "entity_editions LATERAL must contain both `properties` and `property_metadata` \
                 projections for masking; found {grafted_columns}",
            );
        }
    }
}
