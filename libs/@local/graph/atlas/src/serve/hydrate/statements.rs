//! The hydration statements, built through the store's query compiler.
//!
//! Every read builds through the store's own [`SelectCompiler`], so a statement carries the
//! read path's semantics by construction: the live temporal axes, the draft exclusion, and
//! the per-actor property masking. Each column set adds its selections to a caller's
//! compiler and decodes the rows the compiled statement answers, so a row position is known
//! to exactly the type that assigned it.
//!
//! # The masking contract
//!
//! A statement reads property values only through the compiler's scalar-properties
//! selection, which reads the properties column through the same column compilation every
//! entity read uses, so a configured masking reaches the delivered map and the count for
//! exactly the actor the caller names. The compiler's masking hook fires when a property
//! selection compiles, so masking configures before any selection is added, which
//! [`DetailColumns::select`] holds by taking the masking itself. Label attribution reads the
//! cache's per-edition `label_properties` column and no property value, so no masking
//! applies to it. The tests hold this module to zero hand-composed reads of the properties
//! column.

use hash_graph_postgres_store::store::postgres::query::SelectCompiler;
use hash_graph_store::{
    entity::EntityQueryPath,
    entity_type::EntityTypeQueryPath,
    filter::{Filter, FilterExpression, Parameter, protection::PropertyProtectionFilter},
    subgraph::edges::SharedEdgeKind,
};
use type_system::{
    knowledge::{
        Entity,
        entity::id::{EntityId, EntityUuid},
    },
    ontology::id::{BaseUrl, VersionedUrl},
    principal::actor_group::WebId,
};

use super::{
    columns::ScalarValue,
    select::{scalar_properties, select_properties},
};
use crate::dataset::postgres::id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedWebId};

/// Builds the filter naming exactly the requested identities, excluding archived editions.
///
/// Every identity is a non-draft entity id, so the membership set is a disjunction of the read
/// path's own per-entity filters.
pub(super) fn identity_filter<'params>(
    ids: impl IntoIterator<Item = EntityId>,
) -> Filter<'params, Entity> {
    Filter::All(vec![
        Filter::Any(
            ids.into_iter()
                .map(Filter::for_entity_by_entity_id)
                .collect(),
        ),
        Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::Archived,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Boolean(false),
                convert: None,
            },
        ),
    ])
}

/// The output columns of one type-URL read.
pub(super) struct TypeColumns {
    /// The web half of the entity's identity.
    web_id: usize,
    /// The entity half of the entity's identity.
    entity_uuid: usize,
    /// The cached versioned-URL array, direct types first.
    type_urls: usize,
    /// How many leading entries of the array are direct types.
    direct_types: usize,
}

impl TypeColumns {
    /// Adds the identity and type-URL selections to `compiler`.
    pub(super) fn select(compiler: &mut SelectCompiler<'_, '_, Entity>) -> Self {
        Self {
            web_id: compiler.add_selection_path(&EntityQueryPath::WebId),
            entity_uuid: compiler.add_selection_path(&EntityQueryPath::Uuid),
            type_urls: compiler.add_selection_path(&EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPath::VersionedUrl,
                inheritance_depth: None,
            }),
            direct_types: compiler.add_selection_path(&EntityQueryPath::DirectTypeCount),
        }
    }

    /// Reads one row's direct-type URLs: the cached array cut to its direct-type prefix.
    ///
    /// # Panics
    ///
    /// This panics when a column does not decode at its assigned position.
    pub(super) fn direct_type_urls(&self, row: &tokio_postgres::Row) -> Vec<VersionedUrl> {
        let direct: i32 = row.get(self.direct_types);
        let direct = usize::try_from(direct).expect("the store counts direct types non-negatively");

        let mut urls: Vec<VersionedUrl> = row.get(self.type_urls);
        urls.truncate(direct);
        urls
    }

    /// Reads one row's identity from the identity columns.
    ///
    /// # Panics
    ///
    /// This panics when a column does not decode at its assigned position.
    pub(super) fn entity_id(&self, row: &tokio_postgres::Row) -> ArchivedEntityId {
        let web_id: WebId = row.get(self.web_id);
        let entity_uuid: EntityUuid = row.get(self.entity_uuid);

        ArchivedEntityId {
            web_id: ArchivedWebId::from(web_id),
            entity_uuid: ArchivedEntityUuid::from(entity_uuid),
        }
    }
}

/// The output columns of one detail read.
pub(super) struct DetailColumns {
    /// The identity and type-URL positions.
    types: TypeColumns,
    /// The scalar property map position.
    scalars: usize,
    /// The whole property-count position.
    total: usize,
    /// The label-attribution position.
    label: usize,
}

impl DetailColumns {
    /// Configures `masking` and adds the detail selections to `compiler`.
    ///
    /// The masking configures first, so every property selection compiles against the masked
    /// column.
    pub(super) fn select<'params, 'query: 'params>(
        compiler: &mut SelectCompiler<'params, 'query, Entity>,
        masking: Option<&'params PropertyProtectionFilter<'params, 'query>>,
    ) -> Self {
        if let Some(protection) = masking {
            compiler.with_property_masking(protection);
        }

        let types = TypeColumns::select(compiler);
        let scalars = compiler.add_selection_path(&EntityQueryPath::ScalarProperties);
        let total = compiler.add_selection_path(&EntityQueryPath::PropertyCount);
        let label = compiler.add_selection_path(&EntityQueryPath::FirstLabelProperty);

        Self {
            types,
            scalars,
            total,
            label,
        }
    }

    /// Reads one row's identity from the identity columns.
    ///
    /// # Panics
    ///
    /// This panics when a column does not decode at its assigned position.
    pub(super) fn entity_id(&self, row: &tokio_postgres::Row) -> ArchivedEntityId {
        self.types.entity_id(row)
    }

    /// Reads one row's direct-type URLs: the cached array cut to its direct-type prefix.
    ///
    /// # Panics
    ///
    /// This panics when a column does not decode at its assigned position.
    pub(super) fn direct_type_urls(&self, row: &tokio_postgres::Row) -> Vec<VersionedUrl> {
        self.types.direct_type_urls(row)
    }

    /// Reads one row's capped properties and their completeness flag.
    ///
    /// Both property columns read the same masked object, so completeness attests the
    /// deliverable set: the survivors are that whole set exactly when the scalar-type filter
    /// dropped nothing and the cap holds everything. A property the masking withholds is in
    /// neither column and moves the flag not at all. The label property drops last under the
    /// cap.
    ///
    /// # Panics
    ///
    /// This panics when a column does not decode at its assigned position, and when a stored
    /// key does not parse as a base URL.
    pub(super) fn capped_properties(
        &self,
        row: &tokio_postgres::Row,
        cap: usize,
    ) -> (Vec<(BaseUrl, ScalarValue)>, bool) {
        let scalars: Option<serde_json::Value> = row.get(self.scalars);
        let total: i32 = row.get(self.total);
        let label: Option<BaseUrl> = row.get(self.label);

        let entries = scalars.map_or_else(Vec::new, scalar_properties);
        let total = usize::try_from(total).expect("the store counts properties non-negatively");
        let complete = entries.len() == total && entries.len() <= cap;

        (select_properties(entries, label.as_ref(), cap), complete)
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_postgres_store::store::postgres::query::SelectCompiler;
    use hash_graph_store::{
        filter::protection::PropertyProtectionFilterConfig,
        subgraph::temporal_axes::QueryTemporalAxesUnresolved,
    };
    use type_system::{
        knowledge::entity::id::{EntityId, EntityUuid},
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::{super::statement_fixtures, DetailColumns, TypeColumns, identity_filter};

    /// The identity filter over one nil identity, the fixture request.
    fn nil_filter() -> super::Filter<'static, super::Entity> {
        identity_filter([EntityId {
            web_id: WebId::new(Uuid::nil()),
            entity_uuid: EntityUuid::new(Uuid::nil()),
            draft_id: None,
        }])
    }

    /// The module's statements read the properties column only through the compiler.
    ///
    /// A hand-composed read of the properties column bypasses the compiler's masking hook,
    /// so this holds the module to zero such reads outside this test module.
    #[test]
    fn no_hand_composed_property_read() {
        let source = include_str!("statements.rs");
        let (module, _tests) = source
            .split_once("#[cfg(test)]")
            .expect("this module carries its test module");

        assert_eq!(
            module.matches("EntityEditions::Properties").count(),
            0,
            "a properties-column read exists outside the compiler's masked selection"
        );
    }

    /// The detail read masks its property columns exactly when the caller passes a masking.
    ///
    /// The masked spelling is the subtraction inside `jsonb_each(`, which is the compiler's
    /// column hook firing inside each property subquery. The count is over the masked object
    /// too: a whole-object count against a masked map would tell an actor how many properties
    /// were withheld, which is the enumeration signal the protection exists to close.
    #[test]
    fn detail_read_masks_both_property_subqueries() {
        let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();
        let filter = nil_filter();

        let config = PropertyProtectionFilterConfig::hash_default();
        let protection = config.to_property_protection_filter(None);

        let mut masked = SelectCompiler::new(Some(&temporal_axes), false);
        masked
            .add_filter(&filter)
            .expect("the identity filter compiles against the entity query paths");
        DetailColumns::select(&mut masked, Some(&protection));
        let (masked_sql, _) = masked.compile();
        assert_eq!(
            masked_sql
                .matches(r#"jsonb_each(("entity_editions_1_1_0"."properties" - (CASE"#)
                .count(),
            2,
            "the protected detail read does not mask both property subqueries: {masked_sql}"
        );

        let mut bare = SelectCompiler::new(Some(&temporal_axes), false);
        bare.add_filter(&filter)
            .expect("the identity filter compiles against the entity query paths");
        DetailColumns::select(&mut bare, None);
        let (bare_sql, _) = bare.compile();
        assert_eq!(
            bare_sql
                .matches(r#"jsonb_each("entity_editions_1_1_0"."properties")"#)
                .count(),
            2,
            "the unprotected detail read does not read the bare object: {bare_sql}"
        );
    }

    /// Every statement renders exactly its pinned fixture.
    ///
    /// The fixtures hold the store-received text, so a rendering change - a statement edit
    /// here, or a change in the compiler or the statement AST upstream - lands as a fixture
    /// diff in review instead of a silent swap of what runs against the store.
    #[test]
    fn statements_render_their_fixtures() {
        let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();
        let filter = nil_filter();

        let mut types = SelectCompiler::new(Some(&temporal_axes), false);
        types
            .add_filter(&filter)
            .expect("the identity filter compiles against the entity query paths");
        TypeColumns::select(&mut types);
        let (types_sql, _) = types.compile();
        assert_eq!(
            types_sql,
            statement_fixtures::TYPES,
            "the type-URL read moved off its pinned rendering"
        );

        let config = PropertyProtectionFilterConfig::hash_default();
        let protection = config.to_property_protection_filter(None);
        let mut detail = SelectCompiler::new(Some(&temporal_axes), false);
        detail
            .add_filter(&filter)
            .expect("the identity filter compiles against the entity query paths");
        DetailColumns::select(&mut detail, Some(&protection));
        let (detail_sql, _) = detail.compile();
        assert_eq!(
            detail_sql,
            statement_fixtures::DETAIL,
            "the masked detail read moved off its pinned rendering"
        );
    }
}

#[cfg(test)]
mod prepare_probe {
    use hash_graph_postgres_store::store::postgres::query::SelectCompiler;
    use hash_graph_store::{
        filter::protection::PropertyProtectionFilterConfig,
        subgraph::temporal_axes::QueryTemporalAxesUnresolved,
    };
    use tokio_postgres::NoTls;
    use type_system::{
        knowledge::entity::id::{EntityId, EntityUuid},
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::{DetailColumns, TypeColumns, identity_filter};

    #[tokio::test]
    async fn statements_prepare_against_the_live_store() {
        let (client, connection) = tokio_postgres::connect(
            "host=localhost user=postgres password=postgres dbname=graph",
            NoTls,
        )
        .await
        .expect("the graph store is reachable");
        tokio::spawn(connection);

        let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();
        let filter = identity_filter([EntityId {
            web_id: WebId::new(Uuid::nil()),
            entity_uuid: EntityUuid::new(Uuid::nil()),
            draft_id: None,
        }]);
        let config = PropertyProtectionFilterConfig::hash_default();
        let protection = config.to_property_protection_filter(None);

        let mut types = SelectCompiler::new(Some(&temporal_axes), false);
        types
            .add_filter(&filter)
            .expect("the identity filter compiles against the entity query paths");
        TypeColumns::select(&mut types);

        let mut masked = SelectCompiler::new(Some(&temporal_axes), false);
        masked
            .add_filter(&filter)
            .expect("the identity filter compiles against the entity query paths");
        DetailColumns::select(&mut masked, Some(&protection));

        let mut bare = SelectCompiler::new(Some(&temporal_axes), false);
        bare.add_filter(&filter)
            .expect("the identity filter compiles against the entity query paths");
        DetailColumns::select(&mut bare, None);

        for (name, sql) in [
            ("types", types.compile().0),
            ("masked detail", masked.compile().0),
            ("bare detail", bare.compile().0),
        ] {
            if let Err(error) = client.prepare(&sql).await {
                panic!("{name}: {error}");
            }
        }
    }
}
