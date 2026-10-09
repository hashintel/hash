//! Lazy join planner for entity-backed SQL queries.
//!
//! See [`Projections`] for the main entry point.

use core::alloc::Allocator;

use hash_graph_postgres_store::store::postgres::query::{
    self, Alias, Column, ColumnName, ColumnReference, Correlation, ForeignKeyReference, FromItem,
    Identifier, JoinType, PostgresType, SelectExpression, SelectStatement, SimpleSelect, Table,
    TableName, TableReference,
    table::{self, DatabaseColumn},
};
use hashql_core::symbol::sym;

use super::Parameters;

#[cfg(test)]
mod tests;

/// Output columns of the direct-type aggregation lateral.
enum EntityTypeIds {
    /// The entity's direct type IDs as a JSONB array.
    Value,
}

impl DatabaseColumn<'_> for EntityTypeIds {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Value => "entity_type_ids".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Value => PostgresType::JsonB,
        }
    }
}

/// The relation exposing the aggregated direct type IDs.
const ENTITY_TYPE_IDS: Correlation<EntityTypeIds> = Correlation::new("entity_edition_cache");

/// Lazy join planner for entity-backed SQL queries.
///
/// Accessors like [`Self::entity_editions`] register that a table is needed and return a
/// reference to it. The actual `FROM` tree is built once at the end via [`Self::build_from`].
#[derive(Debug, Clone)]
pub(crate) struct Projections {
    index: usize,

    /// Always present as the base table; everything joins through it.
    pub base_alias: Alias,

    pub entity_editions: Option<Alias>,
    pub entity_ids: Option<Alias>,
    pub entity_type_ids: Option<Alias>,
    pub left: Option<Alias>,
    pub right: Option<Alias>,
}

impl Projections {
    pub(crate) const fn new() -> Self {
        let mut index = 0;
        let base_alias = Self::next_alias(&mut index);

        Self {
            index,
            base_alias,
            entity_editions: None,
            entity_ids: None,
            entity_type_ids: None,
            left: None,
            right: None,
        }
    }

    const fn next_alias(index: &mut usize) -> Alias {
        let alias = Alias {
            condition_index: 0,
            chain_depth: 0,
            number: *index,
        };

        *index += 1;

        alias
    }

    pub(crate) fn entity_editions(&mut self) -> TableReference<'static> {
        let alias = *self
            .entity_editions
            .get_or_insert_with(|| Self::next_alias(&mut self.index));

        Table::EntityEditions.aliased(alias)
    }

    /// Returns the base table reference, which is always present (no lazy join).
    pub(crate) fn temporal_metadata(&self) -> TableReference<'static> {
        Table::EntityTemporalMetadata.aliased(self.base_alias)
    }

    pub(crate) fn entity_ids(&mut self) -> TableReference<'static> {
        let alias = *self
            .entity_ids
            .get_or_insert_with(|| Self::next_alias(&mut self.index));

        Table::EntityIds.aliased(alias)
    }

    /// Registers the direct-type aggregation lateral and returns its JSONB column expression.
    pub(crate) fn entity_type_ids(&mut self) -> query::Expression {
        let alias = *self
            .entity_type_ids
            .get_or_insert_with(|| Self::next_alias(&mut self.index));

        ENTITY_TYPE_IDS.at(alias).column(&EntityTypeIds::Value)
    }

    pub(crate) fn left_entity(&mut self) -> TableReference<'static> {
        let alias = *self
            .left
            .get_or_insert_with(|| Self::next_alias(&mut self.index));

        Table::EntityHasLeftEntity.aliased(alias)
    }

    pub(crate) fn right_entity(&mut self) -> TableReference<'static> {
        let alias = *self
            .right
            .get_or_insert_with(|| Self::next_alias(&mut self.index));

        Table::EntityHasRightEntity.aliased(alias)
    }

    /// Builds the FROM clause with all joins that were requested during compilation.
    ///
    /// `entity_temporal_metadata` is always the base table. Other tables are joined
    /// conditionally based on which paths the filter body and provides set touched.
    /// CROSS JOIN LATERALs for continuation subqueries are appended last.
    pub(crate) fn build_from(
        &self,
        parameters: &mut Parameters<'_, impl Allocator>,
        laterals: Vec<FromItem<'static>, impl Allocator>,
    ) -> FromItem<'static> {
        let base = FromItem::table(Table::EntityTemporalMetadata)
            .alias(Table::EntityTemporalMetadata.aliased_name(self.base_alias))
            .build();

        let mut from = base;

        // entity_ids ON (web_id, entity_uuid) (INNER)
        if let Some(alias) = self.entity_ids {
            from = self.build_entity_ids(from, alias);
        }

        // entity_type_ids: self-contained LATERAL that joins entity_edition_cache
        // internally, unnests the parallel arrays, and aggregates into a JSONB array. The
        // cache arrays cover all inheritance depths with the direct types as prefix, so the
        // ordinality predicate restricts the output to the entity's direct types.
        //
        // LEFT JOIN LATERAL (
        //     SELECT jsonb_agg(jsonb_build_object($base_url, u."b", $version, u."v"))
        //            AS "entity_type_ids"
        //     FROM "entity_edition_cache" AS "eec"
        //       CROSS JOIN LATERAL UNNEST("eec"."base_urls", "eec"."versions"::text[])
        //            WITH ORDINALITY AS "u"("b", "v", "ordinality")
        //     WHERE "eec"."entity_edition_id" = "base"."entity_edition_id"
        //       AND "u"."ordinality" <= "eec"."direct_types"
        // ) AS <alias> ON TRUE
        if let Some(alias) = self.entity_type_ids {
            from = self.build_entity_type_ids(parameters, from, alias);
        }

        // entity_has_left_entity ON (web_id, entity_uuid) (LEFT OUTER)
        if let Some(alias) = self.left {
            from = self.build_entity_has_left_entity(from, alias);
        }

        // entity_has_right_entity ON (web_id, entity_uuid) (LEFT OUTER)
        if let Some(alias) = self.right {
            from = self.build_entity_has_right_entity(from, alias);
        }

        // CROSS JOIN LATERAL entity_editions ON edition_id (INNER)
        if let Some(alias) = self.entity_editions {
            from = self.build_entity_editions(from, alias);
        }

        // CROSS JOIN LATERALs for continuation subqueries (must come after
        // all regular joins since they may reference any of the joined tables)
        for lateral in laterals {
            from = from.cross_join(lateral);
        }

        from
    }

    /// Builds `entity_editions` as a LATERAL subquery with explicit column projections.
    ///
    /// ```sql
    /// CROSS JOIN LATERAL (
    ///     SELECT ee.<col> AS <col>, ...
    ///     FROM entity_editions AS ee
    ///     WHERE ee.edition_id = base.edition_id
    /// ) AS <alias>
    /// ```
    ///
    /// The explicit projections let the authorization graft locate and replace
    /// individual column expressions (e.g. applying a property mask to `properties`).
    pub(crate) fn build_entity_editions<'item>(
        &self,
        from: FromItem<'item>,
        alias: Alias,
    ) -> FromItem<'item> {
        let inner_ref = TableReference {
            schema: None,
            name: TableName::from("ee"),
        };

        // entity_editions AS ee
        let inner_from = FromItem::table(Table::EntityEditions)
            .alias(inner_ref.name.clone())
            .build();

        // ee.edition_id = base.edition_id
        let correlation = query::Expression::equal(
            query::Expression::ColumnReference(ColumnReference {
                correlation: Some(inner_ref.clone()),
                name: Column::EntityEditions(table::EntityEditions::EditionId).into(),
            }),
            query::Expression::ColumnReference(ColumnReference {
                correlation: Some(self.temporal_metadata()),
                name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EditionId)
                    .into(),
            }),
        );

        // Project every column, `ee.[property] AS [property]`, this mirrors `*`, but makes each
        // column available by name.
        let selects = table::EntityEditions::ALL
            .into_iter()
            .map(|column| SelectExpression::Expression {
                expression: query::Expression::ColumnReference(ColumnReference {
                    correlation: Some(inner_ref.clone()),
                    name: Column::EntityEditions(column).into(),
                }),
                output_name: Some(column.name().into_identifier()),
            })
            .collect();

        // SELECT
        //  ee.[property] AS [property],
        //  ...
        // FROM entity_editions as ee
        // WHERE ee.edition_id = base.edition_id
        let select = SimpleSelect::builder()
            .selects(selects)
            .from(inner_from)
            .where_clause(correlation)
            .build();

        let subquery = SelectStatement::builder().select_clause(select).build();

        // LATERAL (subquery) AS [alias]
        let lateral = FromItem::Subquery {
            lateral: true,
            statement: Box::new(subquery),
            alias: Some(Table::EntityEditions.aliased_name(alias)),
            column_aliases: vec![],
        };

        // CROSS JOIN LATERAL (...)
        from.cross_join(lateral)
    }

    pub(crate) fn build_entity_ids<'item>(
        &self,
        from: FromItem<'item>,
        alias: Alias,
    ) -> FromItem<'item> {
        let fk = ForeignKeyReference::Double {
            on: [
                Column::EntityTemporalMetadata(table::EntityTemporalMetadata::WebId),
                Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EntityUuid),
            ],
            join: [
                Column::EntityIds(table::EntityIds::WebId),
                Column::EntityIds(table::EntityIds::EntityUuid),
            ],
            join_type: JoinType::Inner,
        };

        from.join(
            JoinType::Inner,
            FromItem::table(Table::EntityIds).alias(Table::EntityIds.aliased_name(alias)),
        )
        .on(fk.conditions(self.base_alias, alias))
        .build()
    }

    fn build_entity_type_ids<'item>(
        &self,
        parameters: &mut Parameters<'_, impl Allocator>,
        from: FromItem<'item>,
        alias: Alias,
    ) -> FromItem<'item> {
        let eec_ref = TableReference {
            schema: None,
            name: TableName::from(Identifier::from("eec")),
        };
        let unnest_ref = TableReference {
            schema: None,
            name: TableName::from(Identifier::from("u")),
        };

        let inner_from = FromItem::table(Table::EntityEditionCache)
            .alias(eec_ref.name.clone())
            .build()
            .cross_join(FromItem::Function {
                lateral: true,
                function: query::Function::Unnest(vec![
                    query::Expression::ColumnReference(ColumnReference {
                        correlation: Some(eec_ref.clone()),
                        name: Column::EntityEditionCache(table::EntityEditionCache::BaseUrls)
                            .into(),
                    }),
                    query::Expression::ColumnReference(ColumnReference {
                        correlation: Some(eec_ref.clone()),
                        name: Column::EntityEditionCache(table::EntityEditionCache::Versions)
                            .into(),
                    })
                    .cast(PostgresType::Array(Box::new(PostgresType::Text))),
                ]),
                with_ordinality: true,
                alias: Some(unnest_ref.name.clone()),
                column_aliases: vec![
                    ColumnName::from(Identifier::from("b")),
                    ColumnName::from(Identifier::from("v")),
                    ColumnName::from(Identifier::from("ordinality")),
                ],
            });

        // WHERE "eec"."entity_edition_id" = "base"."entity_edition_id"
        let correlation = query::Expression::equal(
            query::Expression::ColumnReference(ColumnReference {
                correlation: Some(eec_ref.clone()),
                name: Column::EntityEditionCache(table::EntityEditionCache::EntityEditionId).into(),
            }),
            query::Expression::ColumnReference(ColumnReference {
                correlation: Some(self.temporal_metadata()),
                name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EditionId)
                    .into(),
            }),
        );
        // AND "u"."ordinality" <= "eec"."direct_types": the cache arrays cover all inheritance
        // depths with the direct types as prefix; `entity_type_ids` only exposes direct types.
        let direct_prefix = query::Expression::less_or_equal(
            query::Expression::ColumnReference(ColumnReference {
                correlation: Some(unnest_ref),
                name: ColumnName::from(Identifier::from("ordinality")),
            }),
            query::Expression::ColumnReference(ColumnReference {
                correlation: Some(eec_ref),
                name: Column::EntityEditionCache(table::EntityEditionCache::DirectTypes).into(),
            }),
        );

        let subquery = SimpleSelect::builder()
            .selects(vec![SelectExpression::Expression {
                expression: query::Expression::Function(query::Function::JsonAgg(Box::new(
                    query::Expression::Function(query::Function::JsonBuildObject(vec![
                        (
                            parameters.symbol(sym::base_url).to_expr(),
                            query::Expression::ColumnReference(ColumnReference {
                                correlation: None,
                                name: ColumnName::from(Identifier::from("b")),
                            }),
                        ),
                        (
                            parameters.symbol(sym::version).to_expr(),
                            query::Expression::ColumnReference(ColumnReference {
                                correlation: None,
                                name: ColumnName::from(Identifier::from("v")),
                            }),
                        ),
                    ])),
                ))),
                output_name: Some(EntityTypeIds::Value.name().into_identifier()),
            }])
            .from(inner_from)
            .where_clause(query::Expression::all(vec![correlation, direct_prefix]))
            .build();

        let lateral = query::FromItem::Subquery {
            lateral: true,
            statement: Box::new(subquery.into()),
            alias: Some(ENTITY_TYPE_IDS.at(alias).into()),
            column_aliases: vec![],
        };

        from.join(JoinType::LeftOuter, lateral)
            .on(vec![query::Expression::Constant(query::Constant::Boolean(
                true,
            ))])
            .build()
    }

    fn build_entity_has_right_entity<'item>(
        &self,
        from: FromItem<'item>,
        alias: Alias,
    ) -> FromItem<'item> {
        let fk = ForeignKeyReference::Double {
            on: [
                Column::EntityTemporalMetadata(table::EntityTemporalMetadata::WebId),
                Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EntityUuid),
            ],
            join: [
                Column::EntityHasRightEntity(table::EntityHasRightEntity::WebId),
                Column::EntityHasRightEntity(table::EntityHasRightEntity::EntityUuid),
            ],
            join_type: JoinType::LeftOuter,
        };

        from.join(
            JoinType::LeftOuter,
            FromItem::table(Table::EntityHasRightEntity)
                .alias(Table::EntityHasRightEntity.aliased_name(alias)),
        )
        .on(fk.conditions(self.base_alias, alias))
        .build()
    }

    fn build_entity_has_left_entity<'item>(
        &self,
        from: FromItem<'item>,
        alias: Alias,
    ) -> FromItem<'item> {
        let fk = ForeignKeyReference::Double {
            on: [
                Column::EntityTemporalMetadata(table::EntityTemporalMetadata::WebId),
                Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EntityUuid),
            ],
            join: [
                Column::EntityHasLeftEntity(table::EntityHasLeftEntity::WebId),
                Column::EntityHasLeftEntity(table::EntityHasLeftEntity::EntityUuid),
            ],
            join_type: JoinType::LeftOuter,
        };

        from.join(
            JoinType::LeftOuter,
            FromItem::table(Table::EntityHasLeftEntity)
                .alias(Table::EntityHasLeftEntity.aliased_name(alias)),
        )
        .on(fk.conditions(self.base_alias, alias))
        .build()
    }
}
