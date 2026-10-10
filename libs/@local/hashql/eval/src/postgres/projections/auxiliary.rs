use core::mem;

use hash_graph_postgres_store::store::postgres::query::{
    Alias, Column, ForeignKeyReference, FromItem, JoinType, Table, TableName, TableReference, table,
};

use super::Projections;

/// Tracks joins that authorization conditions need.
///
/// Accessors reuse joins from the base [`Projections`] when available, falling
/// back to fresh joins compiled by [`build_joins`](Self::build_joins).
#[derive(Debug)]
pub struct AuxiliaryProjections {
    index: usize,
    base: Projections,

    pub entity_ids: Option<Alias>,
    pub entity_edition_cache: Option<Alias>,
}

impl AuxiliaryProjections {
    pub(crate) const fn new(base: &Projections) -> Self {
        Self {
            index: base.index,
            base: base.snapshot(),
            entity_ids: None,
            entity_edition_cache: None,
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

    /// Requests entity-wide metadata joined on `(web_id, entity_uuid)`.
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
            name: Table::EntityIds.aliased_name(alias),
        }
    }

    /// Requests the cached type assignments for an entity edition.
    ///
    /// Registers a separate join from the base projections' type-ID aggregate, which does not
    /// expose the cache columns.
    pub(crate) fn entity_edition_cache(&mut self) -> TableReference<'static> {
        let alias = if let Some(alias) = self.entity_edition_cache {
            alias
        } else {
            let alias = self.next_alias();
            self.entity_edition_cache = Some(alias);
            alias
        };

        TableReference {
            schema: None,
            name: Table::EntityEditionCache.aliased_name(alias),
        }
    }

    /// Appends authorization joins before the LATERAL subqueries.
    ///
    /// The compiled FROM tree ends with a chain of `CROSS JOIN LATERAL` nodes
    /// (`entity_editions`, then continuations). Authorization joins must appear
    /// before these so that the LATERAL subqueries can reference them.
    pub(crate) fn build_joins(&self, mut from: FromItem<'static>) -> FromItem<'static> {
        // a constant placeholder lets us move the insertion subtree into the join builders without
        // cloning it. The joined subtree replaces it before return.
        const SENTINEL: FromItem<'static> = FromItem::Table {
            only: true,
            table: TableReference {
                schema: None,
                name: TableName::from_table(table::Table::OntologyIds),
            },
            alias: None,
            column_aliases: Vec::new(),
            tablesample: None,
        };

        if self.entity_ids.is_none() && self.entity_edition_cache.is_none() {
            return from;
        }

        // descend through the left children of CrossJoin nodes to the regular join tree underneath
        // the LATERAL chain.
        let mut inner = &mut from;
        while let FromItem::CrossJoin { left, right: _ } = inner {
            inner = left;
        }

        // Temporarily swap the core out so we can append joins to it.
        let mut core = mem::replace(inner, SENTINEL);

        if let Some(alias) = self.entity_ids {
            core = self.base.build_entity_ids(core, alias);
        }

        if let Some(alias) = self.entity_edition_cache {
            let fk = ForeignKeyReference::Single {
                on: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EditionId),
                join: Column::EntityEditionCache(table::EntityEditionCache::EntityEditionId),
                join_type: JoinType::Inner,
            };

            core = core
                .join(
                    JoinType::Inner,
                    FromItem::table(Table::EntityEditionCache)
                        .alias(Table::EntityEditionCache.aliased_name(alias)),
                )
                .on(fk.conditions(self.base.base_alias, alias))
                .build();
        }

        *inner = core;

        from
    }
}
