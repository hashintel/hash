//! Lazy join planner for entity-backed SQL queries.
//!
//! See [`Projections`] for the main entry point.

use core::alloc::Allocator;

use hash_graph_postgres_store::store::postgres::query::{
    self, Alias, Column, ColumnName, ColumnReference, ForeignKeyReference, FromItem, Identifier,
    JoinType, SelectExpression, SelectStatement, Table, TableName, TableReference, table,
};
use hashql_core::symbol::sym;

use super::Parameters;

/// Computed columns not directly backed by a single table column.
enum ComputedColumn {
    /// Aggregated JSONB array of entity type IDs, produced by a `LEFT JOIN LATERAL` subquery.
    EntityTypeIds,
}

impl From<ComputedColumn> for ColumnName<'_> {
    fn from(value: ComputedColumn) -> Self {
        match value {
            ComputedColumn::EntityTypeIds => ColumnName::from(Identifier::from("entity_type_ids")),
        }
    }
}

/// Lazy join planner for entity-backed SQL queries.
///
/// Accessors like [`Self::entity_editions`] register that a table is needed and return a
/// reference to it. The actual `FROM` tree is built once at the end via [`Self::build_from`].
pub(crate) struct Projections {
    index: usize,

    /// Always present as the base table; everything joins through it.
    base_alias: Alias,

    entity_editions: Option<Alias>,
    entity_ids: Option<Alias>,
    entity_type_ids: Option<Alias>,
    left: Option<Alias>,
    right: Option<Alias>,
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

        TableReference {
            schema: None,
            name: TableName::from(Table::EntityEditions),
            alias: Some(alias),
        }
    }

    /// Returns the base table reference, which is always present (no lazy join).
    pub(crate) fn temporal_metadata(&self) -> TableReference<'static> {
        TableReference {
            schema: None,
            name: TableName::from(Table::EntityTemporalMetadata),
            alias: Some(self.base_alias),
        }
    }

    pub(crate) fn entity_ids(&mut self) -> TableReference<'static> {
        let alias = *self
            .entity_ids
            .get_or_insert_with(|| Self::next_alias(&mut self.index));

        TableReference {
            schema: None,
            name: TableName::from(Table::EntityIds),
            alias: Some(alias),
        }
    }

    /// Unlike other accessors this returns a [`ColumnReference`]: entity type IDs are a computed
    /// column produced by a `LEFT JOIN LATERAL` subquery, not a direct table column.
    pub(crate) fn entity_type_ids(&mut self) -> ColumnReference<'static> {
        let alias = *self
            .entity_type_ids
            .get_or_insert_with(|| Self::next_alias(&mut self.index));

        ColumnReference {
            correlation: Some(TableReference {
                schema: None,
                name: TableName::from(Table::EntityIsOfTypeIds),
                alias: Some(alias),
            }),
            name: ComputedColumn::EntityTypeIds.into(),
        }
    }

    pub(crate) fn left_entity(&mut self) -> TableReference<'static> {
        let alias = *self
            .left
            .get_or_insert_with(|| Self::next_alias(&mut self.index));

        TableReference {
            schema: None,
            name: TableName::from(Table::EntityHasLeftEntity),
            alias: Some(alias),
        }
    }

    pub(crate) fn right_entity(&mut self) -> TableReference<'static> {
        let alias = *self
            .right
            .get_or_insert_with(|| Self::next_alias(&mut self.index));

        TableReference {
            schema: None,
            name: TableName::from(Table::EntityHasRightEntity),
            alias: Some(alias),
        }
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
            .alias(TableReference {
                schema: None,
                name: TableName::from(Table::EntityTemporalMetadata),
                alias: Some(self.base_alias),
            })
            .build();

        let mut from = base;

        // entity_editions ON edition_id (INNER)
        if let Some(alias) = self.entity_editions {
            from = self.build_entity_editions(from, alias);
        }

        // entity_ids ON (web_id, entity_uuid) (INNER)
        if let Some(alias) = self.entity_ids {
            from = self.build_entity_ids(from, alias);
        }

        // entity_type_ids: self-contained LATERAL that joins entity_is_of_type_ids
        // internally, unnests the parallel arrays, and aggregates into a JSONB array.
        //
        // LEFT JOIN LATERAL (
        //     SELECT jsonb_agg(jsonb_build_object($base_url, u."b", $version, u."v"))
        //            AS "entity_type_ids"
        //     FROM "entity_is_of_type_ids" AS "eit"
        //       CROSS JOIN LATERAL UNNEST("eit"."base_urls", "eit"."versions") AS "u"("b", "v")
        //     WHERE "eit"."entity_edition_id" = "base"."entity_edition_id"
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

        // CROSS JOIN LATERALs for continuation subqueries (must come after
        // all regular joins since they may reference any of the joined tables)
        for lateral in laterals {
            from = from.cross_join(lateral);
        }

        from
    }

    fn build_entity_editions<'item>(&self, from: FromItem<'item>, alias: Alias) -> FromItem<'item> {
        let fk = ForeignKeyReference::Single {
            on: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EditionId),
            join: Column::EntityEditions(table::EntityEditions::EditionId),
            join_type: JoinType::Inner,
        };

        from.join(
            JoinType::Inner,
            FromItem::table(Table::EntityEditions).alias(Table::EntityEditions.aliased(alias)),
        )
        .on(fk.conditions(self.base_alias, alias))
        .build()
    }

    fn build_entity_ids<'item>(&self, from: FromItem<'item>, alias: Alias) -> FromItem<'item> {
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
            FromItem::table(Table::EntityIds).alias(Table::EntityIds.aliased(alias)),
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
        let eit_ref = TableReference {
            schema: None,
            name: TableName::from(Identifier::from("eit")),
            alias: None,
        };

        let inner_from = FromItem::table(Table::EntityIsOfTypeIds)
            .alias(TableReference {
                schema: None,
                name: TableName::from(Identifier::from("eit")),
                alias: None,
            })
            .build()
            .cross_join(FromItem::Function {
                lateral: false,
                function: query::Function::Unnest(vec![
                    query::Expression::ColumnReference(ColumnReference {
                        correlation: Some(eit_ref.clone()),
                        name: Column::EntityIsOfTypeIds(table::EntityIsOfTypeIds::BaseUrls).into(),
                    }),
                    query::Expression::ColumnReference(ColumnReference {
                        correlation: Some(eit_ref),
                        name: Column::EntityIsOfTypeIds(table::EntityIsOfTypeIds::Versions).into(),
                    }),
                ]),
                with_ordinality: false,
                alias: Some(TableReference {
                    schema: None,
                    name: TableName::from(Identifier::from("u")),
                    alias: None,
                }),
                column_alias: vec![
                    ColumnName::from(Identifier::from("b")),
                    ColumnName::from(Identifier::from("v")),
                ],
            });

        // WHERE "eit"."entity_edition_id" = "base"."entity_edition_id"
        let correlation = query::Expression::equal(
            query::Expression::ColumnReference(ColumnReference {
                correlation: Some(TableReference {
                    schema: None,
                    name: TableName::from(Identifier::from("eit")),
                    alias: None,
                }),
                name: Column::EntityIsOfType(table::EntityIsOfType::EntityEditionId, None).into(),
            }),
            query::Expression::ColumnReference(ColumnReference {
                correlation: Some(self.temporal_metadata()),
                name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EditionId)
                    .into(),
            }),
        );

        let subquery = SelectStatement::builder()
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
                alias: Some(Identifier::from("entity_type_ids")),
            }])
            .from(inner_from)
            .where_expression({
                let mut w = query::WhereExpression::default();
                w.add_condition(correlation);
                w
            })
            .build();

        let lateral = query::FromItem::Subquery {
            lateral: true,
            statement: Box::new(subquery),
            alias: Some(TableReference {
                schema: None,
                name: TableName::from(Table::EntityIsOfTypeIds),
                alias: Some(alias),
            }),
            column_alias: vec![],
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
                .alias(Table::EntityHasRightEntity.aliased(alias)),
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
                .alias(Table::EntityHasLeftEntity.aliased(alias)),
        )
        .on(fk.conditions(self.base_alias, alias))
        .build()
    }
}
