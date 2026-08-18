//! The display lookup over requested editions, under the serving-time regime.
//!
//! The statement executes on its caller's own connection and binds no temporal axes. An
//! edition id addresses one immutable row, so the answer is the same at any read. Every
//! requested edition answers exactly once, because every join is outer and the unnested
//! requests survive them. The representative cached type answers as a store uuid rather than a
//! generation ordinal, because an edition written after a fit can carry a type no generation
//! tabulated. Its nearest declared icon rides the same row, resolved through the
//! representative's current closed schema, so a register allocating a row for such a type has
//! the icon in hand at the allocation.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, ColumnName, Correlation, Expression, FromItem, Function,
    Placeholder, PostgresType, SelectList, SelectStatement, Table,
    table::{DatabaseColumn, EntityEditionCache, EntityTypes, OntologyIds},
};
use tokio_postgres::{Row, types::ToSql};
use type_system::knowledge::entity::id::EntityEditionId;
use uuid::Uuid;

use super::{
    id::ArchivedOntologyTypeUuid,
    sql::{NearestIcon, first_label, nearest_declared_icon, uuid_array},
};
use crate::dataset::{
    auxiliary::{OwnedIcon, OwnedLabel},
    postgres::PostgresDatasetError,
};

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
    /// The representative cached type's ontology uuid, SQL NULL when the cache resolves none.
    pub representative_type: usize,
    /// The representative type's nearest declared icon, SQL NULL when its chain declares none.
    pub icon: usize,
}

/// Builds the display lookup over the requested editions.
///
/// The statement answers every requested edition exactly once, because every join is outer,
/// each joins at most one row - the edition cache through its primary key, the representative
/// type through the unique `(base_url, version)` pair, its type row through the ontology id,
/// and the icon lateral through its own `LIMIT 1` - and the unnested requests survive them all.
/// The statement binds no temporal axes. An edition id addresses one immutable row, so the
/// answer is the same at any read.
///
/// # SQL
///
/// ```sql
/// SELECT request.entity_edition_id, (cache.labels)[1], representative_type.ontology_id,
///        icon.value
/// FROM unnest(<edition_ids>::uuid[]) AS request(entity_edition_id)
/// LEFT JOIN entity_edition_cache AS cache
///   ON cache.entity_edition_id = request.entity_edition_id
/// LEFT JOIN ontology_ids AS representative_type
///   ON representative_type.base_url = (cache.base_urls)[1]
///  AND representative_type.version = (cache.versions)[1]
/// LEFT JOIN entity_types AS types
///   ON types.ontology_id = representative_type.ontology_id
/// LEFT JOIN LATERAL (<the nearest declared icon>) AS icon ON TRUE
/// ```
pub(crate) fn edition_display_statement(
    edition_ids: &(impl ToSql + Sync),
) -> BoundStatement<'_, EditionDisplayColumns> {
    const CACHE: Aliased<EntityEditionCache> = Aliased::of(Table::EntityEditionCache, "cache");
    const REPRESENTATIVE_TYPE: Aliased<OntologyIds> =
        Aliased::of(Table::OntologyIds, "representative_type");
    const TYPES: Aliased<EntityTypes> = Aliased::of(Table::EntityTypes, "types");
    const ICON: Correlation<NearestIcon> = Correlation::new("icon");

    let mut binder = Binder::default();
    let edition_ids = binder.bind(edition_ids);

    // SELECT request.entity_edition_id, (cache.labels)[1], representative_type.ontology_id,
    //        icon.value
    let mut select = SelectList::default();
    let columns = EditionDisplayColumns {
        edition: select.output(EDITION_REQUEST.column(&EditionRequest::EntityEditionId)),
        label: select.output(first_label(CACHE)),
        representative_type: select.output(REPRESENTATIVE_TYPE.column(&OntologyIds::OntologyId)),
        icon: select.output(ICON.column(&NearestIcon::Value)),
    };

    let statement = SelectStatement::builder()
        .selects(select.into_selects())
        .from({
            // FROM unnest(<edition_ids>) AS request(entity_edition_id)
            // LEFT JOIN entity_edition_cache AS cache
            //   ON cache.entity_edition_id = request.entity_edition_id
            // LEFT JOIN ontology_ids AS representative_type
            //   ON representative_type.base_url = (cache.base_urls)[1]
            //  AND representative_type.version = (cache.versions)[1]
            // LEFT JOIN entity_types AS types
            //   ON types.ontology_id = representative_type.ontology_id
            // LEFT JOIN LATERAL (<the nearest declared icon>) AS icon ON TRUE
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
                    REPRESENTATIVE_TYPE.from_item(),
                    vec![
                        REPRESENTATIVE_TYPE
                            .column(&OntologyIds::BaseUrl)
                            .equal(CACHE.column(&EntityEditionCache::BaseUrls).array_element(1)),
                        REPRESENTATIVE_TYPE
                            .column(&OntologyIds::Version)
                            .equal(CACHE.column(&EntityEditionCache::Versions).array_element(1)),
                    ],
                )
                .left_join_on(
                    TYPES.from_item(),
                    vec![
                        TYPES
                            .column(&EntityTypes::OntologyId)
                            .equal(REPRESENTATIVE_TYPE.column(&OntologyIds::OntologyId)),
                    ],
                )
                .left_join_on(
                    FromItem::subquery(nearest_declared_icon(TYPES))
                        .alias(ICON)
                        .lateral(true),
                    Vec::<Expression>::new(),
                )
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// The display parts one edition's read resolves for a capture.
///
/// The label and icon feed the captured legend, and the representative type resolves into an
/// ontology row at the capture. An empty label is the value a label-less fitted legend
/// carries, and an empty icon is the display of a row that has none.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DisplayParts {
    /// The edition's cached label, empty when the cache holds none.
    pub label: OwnedLabel,
    /// The representative type's nearest declared icon, empty when its chain declares none.
    pub icon: OwnedIcon,
    /// The resolved representative cached type.
    pub representative: ArchivedOntologyTypeUuid,
}

/// Decodes one edition-display row.
///
/// A row without a resolved representative type decodes as [`None`], so the caller's next read
/// cycle retries it: the register turns the representative into its ontology row, and an absent
/// representative leaves nothing to resolve. A row whose cache holds no label carries the empty
/// label, and a representative whose chain declares no icon carries the empty icon.
pub(crate) fn decode_edition_display(
    row: &Row,
    columns: &EditionDisplayColumns,
) -> Result<(EntityEditionId, Option<DisplayParts>), PostgresDatasetError> {
    let edition: EntityEditionId = row.try_get(columns.edition)?;
    let label: Option<String> = row.try_get(columns.label)?;
    let representative: Option<Uuid> = row.try_get(columns.representative_type)?;
    let representative = representative.map(ArchivedOntologyTypeUuid::from);
    let icon: Option<String> = row.try_get(columns.icon)?;

    Ok((
        edition,
        representative.map(|representative| DisplayParts {
            label: OwnedLabel::from(label.unwrap_or_default()),
            icon: OwnedIcon::from(icon.unwrap_or_default()),
            representative,
        }),
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
    /// statement's own contract: every join is outer and joins at most one row, so every
    /// requested edition answers exactly once.
    #[test]
    fn statement_text() {
        let edition_ids = vec![Uuid::nil()];

        insta::assert_snapshot!(edition_display_statement(&edition_ids).sql);
    }
}
