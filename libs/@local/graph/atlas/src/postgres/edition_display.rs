//! The display lookup over requested editions, under the serving-time regime.
//!
//! The statement executes on its caller's own connection and binds no temporal axes. An
//! edition id addresses one immutable row, so the answer is the same at any read. Every
//! requested edition answers exactly once, because both joins are outer and the unnested
//! requests survive them. The first cached type answers as a store uuid rather than a
//! generation ordinal, because an edition written after a fit can carry a type no generation
//! tabulated.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, ColumnName, Correlation, Expression, FromItem, Function,
    Placeholder, PostgresType, SelectList, SelectStatement, Table,
    table::{DatabaseColumn, EntityEditionCache, OntologyIds},
};
use tokio_postgres::{Row, types::ToSql};
use type_system::knowledge::entity::id::EntityEditionId;
use uuid::Uuid;

use super::{
    id::ArchivedOntologyTypeUuid,
    sql::{first_label, uuid_array},
};
use crate::dataset::{auxiliary::OwnedLabel, postgres::PostgresDatasetError};

/// The display payload of one entity edition, as the store states it.
///
/// The label is the edition's cached display text, empty when the cache holds none. The first
/// type is the edition's first cached type as a store uuid rather than a generation ordinal,
/// because an edition written after a fit can carry a type no generation tabulated. Resolving
/// the uuid against a generation's type table is the holder's step, and a miss there means the
/// edition displays no icon under that generation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct EditionDisplay {
    /// The cached display text, empty when the edition carries none.
    pub label: OwnedLabel,
    /// The first cached type's ontology uuid, [`None`] when the cache resolves none.
    pub first_type: Option<ArchivedOntologyTypeUuid>,
}

impl EditionDisplay {
    /// Returns the display's retained heap in bytes: the label's text, exactly.
    pub(crate) fn heap_bytes(&self) -> usize {
        AsRef::<str>::as_ref(&*self.label).len()
    }
}

/// The column of the unnested edition requests, introduced by [`edition_requests`].
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum EditionRequest {
    /// The requested edition.
    EntityEditionId,
}

impl DatabaseColumn<'_> for EditionRequest {
    fn name(&self) -> ColumnName<'static> {
        "entity_edition_id".into()
    }

    fn postgres_type(&self) -> PostgresType {
        PostgresType::Uuid
    }
}

/// The alias the edition-display statement gives the unnested edition ids.
const EDITION_REQUEST: Correlation<EditionRequest> = Correlation::new("request");

/// Builds the `request` rows: the bound edition ids unnested one row per requested edition.
///
/// # SQL
///
/// ```sql
/// unnest(<edition_ids>::uuid[]) AS request(entity_edition_id)
/// ```
fn edition_requests(edition_ids: Placeholder) -> FromItem<'static> {
    FromItem::function(Function::Unnest(vec![
        Expression::from(edition_ids).cast(uuid_array()),
    ]))
    .alias(EDITION_REQUEST)
    .column_aliases(vec![EditionRequest::EntityEditionId.name()])
    .build()
}

/// The output columns of the edition-display statement.
pub(crate) struct EditionDisplayColumns {
    /// The requested edition.
    pub edition: usize,
    /// The display label, SQL NULL when the edition carries none.
    pub label: usize,
    /// The first cached type's ontology uuid, SQL NULL when the cache resolves none.
    pub first_type: usize,
}

/// Builds the display lookup over the requested editions.
///
/// The statement answers every requested edition exactly once, because both joins are outer and
/// the unnested requests survive them. The statement binds no temporal axes. An edition id
/// addresses one immutable row, so the answer is the same at any read.
///
/// # SQL
///
/// ```sql
/// SELECT request.entity_edition_id, (cache.labels)[1], first_type.ontology_id
/// FROM unnest(<edition_ids>::uuid[]) AS request(entity_edition_id)
/// LEFT JOIN entity_edition_cache AS cache
///   ON cache.entity_edition_id = request.entity_edition_id
/// LEFT JOIN ontology_ids AS first_type
///   ON first_type.base_url = (cache.base_urls)[1]
///  AND first_type.version = (cache.versions)[1]
/// ```
pub(crate) fn edition_display_statement(
    edition_ids: &(impl ToSql + Sync),
) -> BoundStatement<'_, EditionDisplayColumns> {
    const CACHE: Aliased<EntityEditionCache> = Aliased::of(Table::EntityEditionCache, "cache");
    const FIRST_TYPE: Aliased<OntologyIds> = Aliased::of(Table::OntologyIds, "first_type");

    let mut binder = Binder::default();
    let edition_ids = binder.bind(edition_ids);

    // SELECT request.entity_edition_id, (cache.labels)[1], first_type.ontology_id
    let mut select = SelectList::default();
    let columns = EditionDisplayColumns {
        edition: select.output(EDITION_REQUEST.column(&EditionRequest::EntityEditionId)),
        label: select.output(first_label(CACHE)),
        first_type: select.output(FIRST_TYPE.column(&OntologyIds::OntologyId)),
    };

    let statement = SelectStatement::builder()
        .selects(select.into_selects())
        .from({
            // FROM unnest(<edition_ids>) AS request(entity_edition_id)
            // LEFT JOIN entity_edition_cache AS cache
            //   ON cache.entity_edition_id = request.entity_edition_id
            // LEFT JOIN ontology_ids AS first_type
            //   ON first_type.base_url = (cache.base_urls)[1]
            //  AND first_type.version = (cache.versions)[1]
            edition_requests(edition_ids)
                .left_join_on(
                    CACHE.from_item(),
                    vec![
                        CACHE
                            .column(&EntityEditionCache::EntityEditionId)
                            .equal(EDITION_REQUEST.column(&EditionRequest::EntityEditionId)),
                    ],
                )
                .left_join_on(
                    FIRST_TYPE.from_item(),
                    vec![
                        FIRST_TYPE
                            .column(&OntologyIds::BaseUrl)
                            .equal(CACHE.column(&EntityEditionCache::BaseUrls).array_element(1)),
                        FIRST_TYPE
                            .column(&OntologyIds::Version)
                            .equal(CACHE.column(&EntityEditionCache::Versions).array_element(1)),
                    ],
                )
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Decodes one edition-display row.
///
/// An edition without a cache row, and one whose cache holds no label, both decode as the empty
/// label, the disposition a fitted row's legend shares.
pub(crate) fn decode_edition_display(
    row: &Row,
    columns: &EditionDisplayColumns,
) -> Result<(EntityEditionId, EditionDisplay), PostgresDatasetError> {
    let edition: Uuid = row.try_get(columns.edition)?;
    let label: Option<String> = row.try_get(columns.label)?;
    let first_type: Option<Uuid> = row.try_get(columns.first_type)?;

    Ok((
        EntityEditionId::new(edition),
        EditionDisplay {
            label: OwnedLabel::from(label.unwrap_or_default()),
            first_type: first_type.map(ArchivedOntologyTypeUuid::from),
        },
    ))
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{super::sql::assert_placeholders_dense, edition_display_statement};

    /// The statement cites exactly the parameters it binds.
    #[test]
    fn statement_cites_its_whole_bind_list() {
        let edition_ids = vec![Uuid::nil()];

        let statement = edition_display_statement(&edition_ids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The rendered statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store. Reviewing a diff, hold it to the
    /// statement's own contract: both joins are outer, so every requested edition answers
    /// exactly once.
    #[test]
    fn statement_renders_its_pinned_text() {
        let edition_ids = vec![Uuid::nil()];

        insta::assert_snapshot!(edition_display_statement(&edition_ids).sql);
    }
}
