//! The display lookup over requested link identities, under the serving-time regime.
//!
//! The statement executes on its caller's own connection at axes taken at the call, resolving
//! each identity to its current edition and answering that edition's cached label and first
//! cached type as a versioned URL, read from the cache's own canonical projection, so no
//! generation's type table mediates the value. Result identity keys each answer, and the
//! caller counts the answers against its requests.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, FromItem, SelectList, SelectStatement, Table, WithExpression,
    table::EntityEditionCache,
};
use tokio_postgres::{Row, types::ToSql};
use type_system::ontology::id::VersionedUrl;
use uuid::Uuid;

use super::{
    id::ArchivedEntityId,
    requests::requests,
    sql::{Axes, first_label},
    vocabulary::{CorpusTable, Requests},
};
use crate::dataset::{TemporalAxes, auxiliary::OwnedLabel, postgres::PostgresDatasetError};

/// The display payload of one live link identity, as the store states it.
///
/// The label is the current edition's cached display text, empty when the cache holds none. The
/// first type is the same edition's first cached type as its versioned URL, read from the
/// cache's own canonical projection, so no generation's type table mediates the value. Both
/// follow the identity's current edition at the read's axes rather than any fit-time capture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LinkDisplay {
    /// The cached display text, empty when the edition carries none.
    pub label: OwnedLabel,
    /// The first cached type's versioned URL, [`None`] when the cache resolves none.
    pub first_type: Option<VersionedUrl>,
}

impl LinkDisplay {
    /// The payload of an identity the store does not resolve: the empty label and no type.
    #[must_use]
    pub(crate) fn empty() -> Self {
        Self {
            label: OwnedLabel::from(String::new()),
            first_type: None,
        }
    }
}

/// The output columns of the link-display statement.
pub(crate) struct LinkDisplayColumns {
    /// The web the entity belongs to.
    pub web_id: usize,
    /// The entity's identity within its web.
    pub entity_uuid: usize,
    /// The display label, SQL NULL when the edition carries none.
    pub label: usize,
    /// The first cached type's versioned URL, SQL NULL when the cache resolves none.
    pub first_type: usize,
}

/// Builds the display lookup over the requested link identities.
///
/// The statement resolves each identity to its current edition at the bound axes and answers
/// that edition's cached label and first cached type as a versioned URL. The cache join is
/// outer, so a resolved identity without a cache row still answers, with both display columns
/// SQL NULL. The caller counts the answers against its requests. A missing row is an identity
/// that is draft-only, archived, or absent at the axes.
///
/// # SQL
///
/// ```sql
/// WITH requests AS (<requests>)
/// SELECT requests.web_id, requests.entity_uuid,
///     (cache.labels)[1], (cache.versioned_urls)[1]
/// FROM requests
/// LEFT JOIN entity_edition_cache AS cache
///   ON cache.entity_edition_id = requests.entity_edition_id
/// ```
pub(crate) fn link_display_statement<'params>(
    axes: &'params TemporalAxes,
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, LinkDisplayColumns> {
    const CACHE: Aliased<EntityEditionCache> = Aliased::of(Table::EntityEditionCache, "cache");

    let mut binder = Binder::default();
    let axes_points = Axes::bind(&mut binder, axes);
    let web_ids = binder.bind(web_ids);
    let entity_uuids = binder.bind(entity_uuids);

    // SELECT
    //     requests.web_id,
    //     requests.entity_uuid,
    //     (cache.labels)[1],
    //     (cache.versioned_urls)[1]
    let mut select = SelectList::default();
    let columns = LinkDisplayColumns {
        web_id: select.output(CorpusTable::Requests.column(Requests::WebId)),
        entity_uuid: select.output(CorpusTable::Requests.column(Requests::EntityUuid)),
        label: select.output(first_label(CACHE)),
        first_type: select.output(
            CACHE
                .column(&EntityEditionCache::VersionedUrls)
                .array_element(1),
        ),
    };

    let statement = SelectStatement::builder()
        .with({
            // WITH requests AS (<requests>)
            WithExpression::default().with_statement(
                CorpusTable::Requests,
                requests(axes_points, web_ids, entity_uuids),
            )
        })
        .selects(select.into_selects())
        .from({
            // FROM requests
            // LEFT JOIN entity_edition_cache AS cache
            //   ON cache.entity_edition_id = requests.entity_edition_id
            FromItem::table(CorpusTable::Requests).build().left_join_on(
                CACHE.from_item(),
                vec![
                    CACHE
                        .column(&EntityEditionCache::EntityEditionId)
                        .equal(CorpusTable::Requests.column(Requests::EntityEditionId)),
                ],
            )
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Decodes one link-display row.
///
/// An identity whose current edition has no cache row, and one whose cache holds no label, both
/// decode as the empty label, the disposition a fitted row's legend shares.
pub(crate) fn decode_link_display(
    row: &Row,
    columns: &LinkDisplayColumns,
) -> Result<(ArchivedEntityId, LinkDisplay), PostgresDatasetError> {
    let web_id: Uuid = row.try_get(columns.web_id)?;
    let entity_uuid: Uuid = row.try_get(columns.entity_uuid)?;
    let label: Option<String> = row.try_get(columns.label)?;
    let first_type: Option<VersionedUrl> = row.try_get(columns.first_type)?;

    Ok((
        ArchivedEntityId {
            web_id: web_id.into(),
            entity_uuid: entity_uuid.into(),
        },
        LinkDisplay {
            label: OwnedLabel::from(label.unwrap_or_default()),
            first_type,
        },
    ))
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{super::sql::assert_placeholders_dense, link_display_statement};
    use crate::dataset::TemporalAxes;

    /// The statement cites exactly the parameters it binds.
    #[test]
    fn statement_cites_its_whole_bind_list() {
        let axes = TemporalAxes::now();
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        let statement = link_display_statement(&axes, &web_ids, &entity_uuids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The rendered statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store. Reviewing a diff, hold it to the
    /// statement's own contract: the edition cache joins outer, so a resolved identity
    /// without a cache row still answers with the display the caller defaults.
    #[test]
    fn statement_text() {
        let axes = TemporalAxes::now();
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        let statement = link_display_statement(&axes, &web_ids, &entity_uuids);
        insta::assert_snapshot!(statement.sql);
    }
}
