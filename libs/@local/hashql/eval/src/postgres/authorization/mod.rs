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
use core::alloc::Allocator;

use hash_graph_postgres_store::store::postgres::query::{
    Alias, Column, ForeignKeyReference, FromItem, JoinType, Table, TableName, TableReference, table,
};
use postgres_types::ToSql;

use super::projections::Projections;

mod policy;

/// Tracks joins that authorization conditions need.
///
/// Accessors reuse joins from the base [`Projections`] when available, falling
/// back to fresh joins compiled by [`build_joins`](Self::build_joins).
struct AuthorizationProjections<'base> {
    index: usize,
    base: &'base Projections,

    entity_ids: Option<Alias>,
    entity_editions: Option<Alias>,
    entity_is_of_type_ids: Option<Alias>,
}

impl<'base> AuthorizationProjections<'base> {
    const fn new(base: &'base Projections) -> Self {
        Self {
            index: base.index,
            base,
            entity_ids: None,
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

    /// Entity-level provenance, joined on `(web_id, entity_uuid)`.
    fn entity_ids(&mut self) -> TableReference<'static> {
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

    /// Entity edition data, joined on `edition_id`.
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

    /// Entity type assignments, joined on `entity_edition_id`.
    ///
    /// Always allocates a fresh join; the base projections' type aggregate
    /// is a scoped LATERAL subquery and cannot be reused.
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

    /// Appends joins for tables not already present in the base projections.
    fn build_joins(&self, mut from: FromItem<'static>) -> FromItem<'static> {
        if let Some(alias) = self.entity_ids {
            from = self.base.build_entity_ids(from, alias);
        }

        if let Some(alias) = self.entity_editions {
            from = self.base.build_entity_editions(from, alias);
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

/// Runtime parameter values for authorization conditions, indexed after
/// the compiled parameters (`$K+1..`).
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
