//! Grafts actor-specific authorization onto compiled queries at runtime.
//!
//! The compilation pipeline produces actor-agnostic queries. This module patches
//! them with two kinds of runtime conditions:
//!
//! - **Policy** ([`policy`]): permit/forbid admission conditions added to WHERE
//! - **Protection** ([`protection`]): property masking applied inside the `entity_editions` LATERAL
//!   subquery
use core::{alloc::Allocator, mem};

use hash_graph_authorization::policies::PolicyComponents;
use hash_graph_postgres_store::store::postgres::query::{
    Alias, Expression, FromItem, SelectExpression, TableReference,
    table::{self, DatabaseColumn as _},
};
use hash_graph_store::filter::protection::PropertyProtectionFilterConfig;

use self::{
    policy::{PolicyTranslation, PolicyTranslationUnit},
    protection::ProtectionTranslationUnit,
};
use super::{PatchPreparedQueryLayer, prepared::PatchContext};

mod policy;
mod protection;
#[cfg(test)]
mod tests;

fn find_from_by_alias<'from, 'id>(
    from: &'from mut FromItem<'id>,
    needle: Alias,
) -> Option<&'from mut FromItem<'id>> {
    match from {
        FromItem::Table {
            only: _,
            table: _,
            alias: Some(TableReference {
                alias: Some(alias), ..
            }),
            column_alias: _,
            tablesample: _,
        } if needle == *alias => Some(from),
        FromItem::Subquery {
            lateral: _,
            statement: _,
            alias: Some(TableReference {
                alias: Some(alias), ..
            }),
            column_alias: _,
        } if needle == *alias => Some(from),
        FromItem::Function {
            lateral: _,
            function: _,
            with_ordinality: _,
            alias: Some(TableReference {
                alias: Some(alias), ..
            }),
            column_alias: _,
        } if needle == *alias => Some(from),
        FromItem::JoinOn {
            left,
            join_type: _,
            right,
            condition: _,
        } => {
            // right biased, that way we're faster in finding our goal, as our tree is left-heavy,
            // with leaves being on the right side.
            find_from_by_alias(right, needle).or_else(|| find_from_by_alias(left, needle))
        }
        FromItem::JoinUsing {
            left: _,
            join_type: _,
            right: _,
            columns: _,
            alias: Some(TableReference {
                alias: Some(alias), ..
            }),
        } if needle == *alias => Some(from),
        FromItem::JoinUsing {
            left,
            join_type: _,
            right,
            columns: _,
            alias: _,
        } => find_from_by_alias(left, needle).or_else(|| find_from_by_alias(right, needle)),
        FromItem::CrossJoin { left, right } => {
            find_from_by_alias(left, needle).or_else(|| find_from_by_alias(right, needle))
        }
        FromItem::NaturalJoin {
            left,
            join_type: _,
            right,
        } => find_from_by_alias(left, needle).or_else(|| find_from_by_alias(right, needle)),
        FromItem::Table { .. } | FromItem::Subquery { .. } | FromItem::Function { .. } => None,
    }
}

pub struct AuthorizationPatch<'policy, 'path> {
    policy: &'policy PolicyComponents,
    properties: &'policy PropertyProtectionFilterConfig<'path>,
}

impl<A: Allocator + Clone, S: Allocator> PatchPreparedQueryLayer<A, S>
    for AuthorizationPatch<'_, '_>
{
    fn patch_query<N>(
        &mut self,
        context: &mut PatchContext<'_, A>,
        query: &mut super::PreparedQuery<'_, A>,
        scratch: S,
        next: &mut N,
    ) where
        N: super::prepared::PatchPreparedQuery<A, S>,
    {
        let mut policy = PolicyTranslationUnit {
            projections: &mut context.projections,
            parameters: &mut query.auxiliary_parameters,
            actor_id: self.policy.actor_id(),
        };
        let PolicyTranslation { condition } =
            policy.transpile(query.vertex_type, self.policy, &scratch);
        query.statement.where_expression.add_condition(condition);

        // Lower protection BEFORE join materialization so its join demands
        // (e.g. entity_is_of_type_ids for TypeBaseUrls) are registered.
        // The resulting mask expression is grafted AFTER joins are built.
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

        let Some((entity_edition_alias, keys_to_remove)) =
            Option::zip(entity_edition_alias, keys_to_remove)
        else {
            return;
        };

        let from = query
            .statement
            .from
            .as_mut()
            .unwrap_or_else(|| unreachable!("prepared queries always have a from value"));

        let Some(FromItem::Subquery {
            lateral: _,
            statement,
            alias: _,
            column_alias: _,
        }) = find_from_by_alias(from, entity_edition_alias)
        else {
            unreachable!(
                "entity_edition_alias not found in from clause, even though it has been requested"
            );
        };

        for column in &mut statement.selects {
            let SelectExpression::Expression {
                expression,
                alias: Some(alias),
            } = column
            else {
                unreachable!(
                    "selects must be expressions, see: projections::build_entity_editions"
                );
            };

            if alias.as_ref() == table::EntityEditions::Properties.as_str()
                || alias.as_ref() == table::EntityEditions::PropertyMetadata.as_str()
            {
                let base = mem::replace(expression, Expression::Parameter(0));

                // Group the result of the subtraction so that subsequent operators bind to the
                // result, and not to one of it's parts.
                *expression = Expression::subtract(base, keys_to_remove.clone()).grouped();
            }
        }
    }
}
