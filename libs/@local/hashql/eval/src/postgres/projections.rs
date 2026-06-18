//! Lazy join planner for entity-backed SQL queries.
//!
//! See [`Projections`] for the main entry point.

use core::{alloc::Allocator, mem};

use hash_graph_postgres_store::store::postgres::query::{
    self, Alias, Column, ColumnName, ColumnReference, ForeignKeyReference, FromItem, Identifier,
    JoinType, PostgresType, SelectExpression, SelectStatement, Table, TableName, TableReference,
    table::{self, DatabaseColumn as _},
};
use hashql_core::symbol::sym;

use super::Parameters;

/// Computed columns not directly backed by a single table column.
enum ComputedColumn {
    /// Aggregated JSONB array of entity type IDs, produced by a `LEFT JOIN LATERAL` subquery.
    EntityTypeIds,
}

impl From<ComputedColumn> for ColumnName<'_> {
    #[inline]
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

    pub(crate) const fn snapshot(&self) -> Self {
        Self { ..*self }
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
                name: TableName::from(Table::EntityEditionCache),
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
            alias: None,
        };

        // entity_editions AS ee
        let inner_from = FromItem::table(Table::EntityEditions)
            .alias(inner_ref.clone())
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
                alias: Some(column.as_str().into()),
            })
            .collect();

        // WHERE ee.edition_id = base.edition_id
        let r#where = query::WhereExpression {
            conditions: vec![correlation],
            cursor: Vec::new(),
        };

        // SELECT
        //  ee.[property] AS [property],
        //  ...
        // FROM entity_editions as ee
        // WHERE ee.edition_id = base.edition_id
        let subquery = SelectStatement::builder()
            .selects(selects)
            .from(inner_from)
            .where_expression(r#where)
            .build();

        // LATERAL (subquery) AS [alias]
        let lateral = FromItem::Subquery {
            lateral: true,
            statement: Box::new(subquery),
            alias: Some(TableReference {
                schema: None,
                name: TableName::from(Table::EntityEditions),
                alias: Some(alias),
            }),
            column_alias: vec![],
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
            FromItem::table(Table::EntityIds).alias(Table::EntityIds.aliased(alias)),
        )
        .on(fk.conditions(self.base_alias, alias))
        .build()
    }

    #[expect(clippy::too_many_lines)]
    fn build_entity_type_ids<'item>(
        &self,
        parameters: &mut Parameters<'_, impl Allocator>,
        from: FromItem<'item>,
        alias: Alias,
    ) -> FromItem<'item> {
        let eec_ref = TableReference {
            schema: None,
            name: TableName::from(Identifier::from("eec")),
            alias: None,
        };
        let unnest_ref = TableReference {
            schema: None,
            name: TableName::from(Identifier::from("u")),
            alias: None,
        };

        let inner_from = FromItem::table(Table::EntityEditionCache)
            .alias(eec_ref.clone())
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
                alias: Some(unnest_ref.clone()),
                column_alias: vec![
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
                w.add_condition(direct_prefix);
                w
            })
            .build();

        let lateral = query::FromItem::Subquery {
            lateral: true,
            statement: Box::new(subquery),
            alias: Some(TableReference {
                schema: None,
                name: TableName::from(Table::EntityEditionCache),
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

/// Tracks joins that authorization conditions need.
///
/// Accessors reuse joins from the base [`Projections`] when available, falling
/// back to fresh joins compiled by [`build_joins`](Self::build_joins).
#[derive(Debug)]
pub struct AuxiliaryProjections {
    index: usize,
    base: Projections,

    pub entity_ids: Option<Alias>,
    pub entity_is_of_type_ids: Option<Alias>,
}

impl AuxiliaryProjections {
    pub(crate) const fn new(base: &Projections) -> Self {
        Self {
            index: base.index,
            base: base.snapshot(),
            entity_ids: None,
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

    pub(crate) const fn snapshot(&self) -> Self {
        Self {
            base: self.base.snapshot(),
            ..*self
        }
    }

    pub(crate) fn temporal_metadata(&self) -> TableReference<'static> {
        self.base.temporal_metadata()
    }

    /// Entity-level provenance, joined on `(web_id, entity_uuid)`.
    pub(crate) fn entity_ids(&mut self) -> TableReference<'static> {
        let alias = if let Some(base_alias) = self.base.entity_ids {
            base_alias
        } else if let Some(alias) = self.entity_ids {
            alias
        } else {
            let alias = self.next_alias();
            self.entity_ids = Some(alias);
            alias
        };

        TableReference {
            schema: None,
            name: TableName::from(Table::EntityIds),
            alias: Some(alias),
        }
    }

    pub(crate) const fn entity_edition_alias(&self) -> Option<Alias> {
        self.base.entity_editions
    }

    /// Entity type assignments, joined on `entity_edition_id`.
    ///
    /// Always allocates a fresh join; the base projections' type aggregate
    /// is a scoped LATERAL subquery and cannot be reused.
    pub(crate) fn entity_is_of_type_ids(&mut self) -> TableReference<'static> {
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

    /// Appends authorization joins before the LATERAL subqueries.
    ///
    /// The compiled FROM tree ends with a chain of `CROSS JOIN LATERAL` nodes
    /// (`entity_editions`, then continuations). Authorization joins must appear
    /// before these so that the LATERAL subqueries can reference them.
    ///
    /// This traverses the right spine of `CrossJoin` nodes to find the
    /// insertion point (the innermost non-LATERAL join tree), appends
    /// authorization joins there, and reassembles the LATERAL chain on top.
    pub(crate) fn build_joins(&self, mut from: FromItem<'static>) -> FromItem<'static> {
        // This value has no semantic purpose, but is simply a value that we can construct in a
        // constant environment and which is cheap. The value will never end up inside of the from
        // clause, only when it panics, but all bets are off then anyway.
        const SENTINEL: FromItem<'static> = FromItem::Table {
            only: true,
            table: TableReference {
                schema: None,
                name: TableName::from_table(table::Table::OntologyIds),
                alias: None,
            },
            alias: None,
            column_alias: Vec::new(),
            tablesample: None,
        };

        if self.entity_ids.is_none() && self.entity_is_of_type_ids.is_none() {
            return from;
        }

        // Walk down the left spine of CrossJoin nodes to find the
        // regular join tree underneath the LATERAL chain.
        let mut inner = &mut from;
        while let FromItem::CrossJoin { left, right: _ } = inner {
            inner = left;
        }

        // Temporarily swap the core out so we can append joins to it.
        let mut core = mem::replace(inner, SENTINEL);

        if let Some(alias) = self.entity_ids {
            core = self.base.build_entity_ids(core, alias);
        }

        if let Some(alias) = self.entity_is_of_type_ids {
            let fk = ForeignKeyReference::Single {
                on: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EditionId),
                join: Column::EntityIsOfTypeIds(table::EntityIsOfTypeIds::EntityEditionId),
                join_type: JoinType::Inner,
            };

            core = core
                .join(
                    JoinType::Inner,
                    FromItem::table(Table::EntityIsOfTypeIds)
                        .alias(Table::EntityIsOfTypeIds.aliased(alias)),
                )
                .on(fk.conditions(self.base.base_alias, alias))
                .build();
        }

        // Put the augmented core back; the LATERAL chain above is untouched.
        *inner = core;

        from
    }
}

#[cfg(test)]
mod tests {
    use alloc::alloc::Global;
    use std::path::PathBuf;

    use hash_graph_postgres_store::store::postgres::query::{
        FromItem, SelectStatement, Table, TableName, TableReference, Transpile as _,
    };
    use insta::{Settings, assert_snapshot};

    use super::{AuxiliaryProjections, Projections};
    use crate::postgres::Parameters;

    fn snapshot_settings() -> Settings {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let mut settings = Settings::clone_current();
        settings
            .set_snapshot_path(manifest_dir.join("tests/ui/postgres/authorization/projections"));
        settings.set_prepend_module_to_snapshot(false);
        settings
    }

    fn make_lateral(name: &'static str) -> FromItem<'static> {
        FromItem::Subquery {
            lateral: true,
            statement: Box::new(
                SelectStatement::builder()
                    .selects(vec![])
                    .from(
                        FromItem::table(Table::EntityTemporalMetadata)
                            .alias(TableReference {
                                schema: None,
                                name: TableName::from(name),
                                alias: None,
                            })
                            .build(),
                    )
                    .build(),
            ),
            alias: Some(TableReference {
                schema: None,
                name: TableName::from(name),
                alias: None,
            }),
            column_alias: vec![],
        }
    }

    #[test]
    fn build_from_base_only() {
        let projections = Projections::new();
        let mut parameters = Parameters::new_in(Global);
        let from = projections.build_from(&mut parameters, Vec::new());

        let mut settings = snapshot_settings();
        settings.set_description(format!("{projections:?}"));
        let _guard = settings.bind_to_scope();
        assert_snapshot!("build_from_base_only", from.transpile_to_string());
    }

    #[test]
    fn build_from_with_entity_editions() {
        let mut projections = Projections::new();
        projections.entity_editions();
        let mut parameters = Parameters::new_in(Global);
        let from = projections.build_from(&mut parameters, Vec::new());

        let mut settings = snapshot_settings();
        settings.set_description(format!("{projections:?}"));
        let _guard = settings.bind_to_scope();
        assert_snapshot!(
            "build_from_with_entity_editions",
            from.transpile_to_string()
        );
    }

    #[test]
    fn build_from_with_entity_ids_and_editions() {
        let mut projections = Projections::new();
        projections.entity_ids();
        projections.entity_editions();
        let mut parameters = Parameters::new_in(Global);
        let from = projections.build_from(&mut parameters, Vec::new());

        let mut settings = snapshot_settings();
        settings.set_description(format!("{projections:?}"));
        let _guard = settings.bind_to_scope();
        assert_snapshot!(
            "build_from_with_entity_ids_and_editions",
            from.transpile_to_string(),
        );
    }

    #[test]
    fn build_from_editions_before_continuations() {
        let mut projections = Projections::new();
        projections.entity_editions();
        let mut parameters = Parameters::new_in(Global);

        let lateral = make_lateral("continuation_1");
        let from = projections.build_from(&mut parameters, vec![lateral]);

        let mut settings = snapshot_settings();
        settings.set_description(format!("{projections:?}, 1 continuation lateral"));
        let _guard = settings.bind_to_scope();
        assert_snapshot!(
            "build_from_editions_before_continuations",
            from.transpile_to_string(),
        );
    }

    #[test]
    fn build_joins_no_laterals_no_auth() {
        let base = Projections::new();
        let aux = AuxiliaryProjections::new(&base);

        let from = FromItem::table(Table::EntityTemporalMetadata)
            .alias(TableReference {
                schema: None,
                name: TableName::from(Table::EntityTemporalMetadata),
                alias: Some(base.base_alias),
            })
            .build();

        let result = aux.build_joins(from.clone());
        assert_eq!(
            result.transpile_to_string(),
            from.transpile_to_string(),
            "no auth joins requested means FROM is unchanged",
        );
    }

    #[test]
    fn build_joins_inserts_before_laterals() {
        let base = Projections::new();
        let mut aux = AuxiliaryProjections::new(&base);
        aux.entity_is_of_type_ids();

        let core = FromItem::table(Table::EntityTemporalMetadata)
            .alias(TableReference {
                schema: None,
                name: TableName::from(Table::EntityTemporalMetadata),
                alias: Some(base.base_alias),
            })
            .build();

        let lateral_1 = make_lateral("continuation_1");
        let lateral_2 = make_lateral("continuation_2");
        let from = core.cross_join(lateral_1).cross_join(lateral_2);

        let result = aux.build_joins(from);

        let mut settings = snapshot_settings();
        settings.set_description(format!("{aux:?}, 2 continuation laterals"));
        let _guard = settings.bind_to_scope();
        assert_snapshot!(
            "build_joins_inserts_before_laterals",
            result.transpile_to_string(),
        );
    }

    #[test]
    fn build_joins_no_laterals_with_auth() {
        let base = Projections::new();
        let mut aux = AuxiliaryProjections::new(&base);
        aux.entity_ids();
        aux.entity_is_of_type_ids();

        let from = FromItem::table(Table::EntityTemporalMetadata)
            .alias(TableReference {
                schema: None,
                name: TableName::from(Table::EntityTemporalMetadata),
                alias: Some(base.base_alias),
            })
            .build();

        let result = aux.build_joins(from);

        let mut settings = snapshot_settings();
        settings.set_description(format!("{aux:?}"));
        let _guard = settings.bind_to_scope();
        assert_snapshot!(
            "build_joins_no_laterals_with_auth",
            result.transpile_to_string(),
        );
    }
}
