//! Detail hydration: live label and icon reads for delivered points.
//!
//! The Q3 ruling pins the source: detail hydrates AT REQUEST TIME
//! from Postgres, inline in the trailer - no published label
//! columns. Reads are LIVE (`now()`, not the snapshot's decision
//! time): text edited after publish shows on snapshot geometry,
//! divergence accepted and usually wanted. Hydration queries only
//! post-intersection ids, so it opens no new auth surface.
//!
//! The per-point rules mirror the client's own display logic:
//!
//! - Label: `entity_edition_cache.labels[1]`, the entity's display label; `null` when the entity
//!   has none.
//! - Icon: the entity's own `icon` property when it is a string, else the graph's display-field
//!   rule (the SDK's `getDisplayFieldsForClosedEntityType`): every direct type's
//!   `closed_schema.allOf` carries per-ancestor display metadata, and the first non-null icon by
//!   inheritance depth wins - a type inherits its ancestors' icons, nearest first. `null` when no
//!   chain carries one - the client owns the fallback glyph.
//!
//! An id that resolves to no visible entity - deleted since publish,
//! archived, drafted - reads `null` in both columns, mirroring the
//! zero-mask rule for unresolvable type ids.

use tokio_postgres::Client;
use zerocopy::IntoBytes as _;

use crate::dataset::ArchivedEntityId;

/// The base URL of the system `icon` property an entity may carry.
const ICON_PROPERTY: &str = "https://hash.ai/@h/types/property-type/icon/";

/// The hydration query: one batched lookup, input order preserved
/// through the ordinality column, absent entities simply missing
/// from the result.
const DETAIL_QUERY: &str = "
    SELECT
        ids.index,
        cache.labels[1] AS label,
        CASE
            WHEN jsonb_typeof(edition.properties -> $3::text) = 'string'
                THEN edition.properties ->> $3::text
        END AS own_icon,
        type_icon.icon AS type_icon
    FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS ids (web_id, entity_uuid, index)
    JOIN entity_temporal_metadata AS meta
      ON meta.web_id = ids.web_id
     AND meta.entity_uuid = ids.entity_uuid
     AND meta.draft_id IS NULL
     AND meta.transaction_time @> now()
     AND meta.decision_time @> now()
    JOIN entity_editions AS edition
      ON edition.entity_edition_id = meta.entity_edition_id
     AND NOT edition.archived
    LEFT JOIN entity_edition_cache AS cache
      ON cache.entity_edition_id = meta.entity_edition_id
    LEFT JOIN LATERAL (
        SELECT display.value ->> 'icon' AS icon
        FROM unnest(cache.versioned_urls[1:cache.direct_types])
            WITH ORDINALITY AS direct (url, position)
        JOIN ontology_ids
          ON ontology_ids.base_url || 'v/' || ontology_ids.version = direct.url
        JOIN entity_types
          ON entity_types.ontology_id = ontology_ids.ontology_id
        CROSS JOIN LATERAL jsonb_array_elements(
            entity_types.closed_schema -> 'allOf'
        ) AS display (value)
        WHERE display.value ->> 'icon' IS NOT NULL
        ORDER BY (display.value ->> 'depth')::int, direct.position
        LIMIT 1
    ) AS type_icon ON TRUE
";

/// The entity identities behind one delivered set, in delivered
/// order; the hydration request's subject.
#[derive(Debug)]
pub struct DeliveredEntities {
    /// One entry per delivered point.
    ids: Vec<ArchivedEntityId>,
}

impl DeliveredEntities {
    /// Wraps one delivered set's gathered identities.
    pub(super) const fn new(ids: Vec<ArchivedEntityId>) -> Self {
        Self { ids }
    }

    /// Returns the delivered count the details must cover.
    #[inline]
    #[must_use]
    pub const fn count(&self) -> usize {
        self.ids.len()
    }
}

/// Hydrated per-point details, aligned to the delivered order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeDetails {
    /// The display label per delivered point.
    labels: Vec<Option<String>>,
    /// The icon per delivered point.
    icons: Vec<Option<String>>,
}

impl NodeDetails {
    /// All-`null` details covering `count` points: the honest answer
    /// when no id can resolve.
    #[must_use]
    pub(super) fn empty(count: usize) -> Self {
        Self {
            labels: vec![None; count],
            icons: vec![None; count],
        }
    }

    /// Views the label column, delivered order.
    #[inline]
    pub(super) const fn labels(&self) -> &[Option<String>] {
        &self.labels
    }

    /// Views the icon column, delivered order.
    #[inline]
    pub(super) const fn icons(&self) -> &[Option<String>] {
        &self.icons
    }
}

/// A detail hydration failed against the store.
#[derive(Debug)]
pub struct DetailError(tokio_postgres::Error);

impl core::fmt::Display for DetailError {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(formatter, "the detail hydration failed: {}", self.0)
    }
}

impl core::error::Error for DetailError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        Some(&self.0)
    }
}

/// Live detail reads over one store connection.
///
/// The connection is dialed by the transport layer - the same
/// `HASH_GRAPH_PG_*` configuration the graph binary speaks - and the
/// hydration path issues one batched query per request.
#[derive(Debug)]
pub struct PostgresDetails {
    client: Client,
}

impl PostgresDetails {
    /// Wraps an established store connection.
    #[must_use]
    pub const fn new(client: Client) -> Self {
        Self { client }
    }

    /// Hydrates labels and icons for the delivered entities, aligned
    /// to the delivered order; entities the store no longer serves
    /// read `null`.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// Panics when the store answers rows outside the request domain
    /// or with the wrong column types - a query bug, never data.
    #[tracing::instrument(skip_all, fields(points = entities.count()))]
    pub async fn labels_and_icons(
        &self,
        entities: &DeliveredEntities,
    ) -> Result<NodeDetails, DetailError> {
        let ids = &entities.ids;
        if ids.is_empty() {
            return Ok(NodeDetails::empty(0));
        }

        let uuid = |bytes: &[u8]| {
            uuid::Uuid::from_slice(bytes).expect("archived identities are 16-byte uuids")
        };
        let web_ids: Vec<uuid::Uuid> = ids.iter().map(|id| uuid(id.web_id.as_bytes())).collect();
        let entity_uuids: Vec<uuid::Uuid> = ids
            .iter()
            .map(|id| uuid(id.entity_uuid.as_bytes()))
            .collect();

        let rows = self
            .client
            .query(DETAIL_QUERY, &[&web_ids, &entity_uuids, &ICON_PROPERTY])
            .await
            .map_err(DetailError)?;

        let mut details = NodeDetails::empty(entities.count());
        for row in rows {
            let index: i64 = row.get(0);
            // Ordinality is 1-based; an index outside the request
            // domain cannot arrive from the unnest.
            let index = usize::try_from(index - 1).expect("ordinality covers the request domain");
            let label: Option<String> = row.get(1);
            let own_icon: Option<String> = row.get(2);
            let type_icon: Option<String> = row.get(3);

            details.labels[index] = label;
            details.icons[index] = own_icon.or(type_icon);
        }

        Ok(details)
    }
}
