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
//! Link entities hydrate through the same rules plus two type
//! columns: the link's entity-type title and icon, taken from its
//! first direct type in canonical order (the type icon follows the
//! display-field rule above, so it inherits through `allOf`).
//!
//! Locate hydrates one more node column: the entity's SIMPLE-VALUED
//! properties (the Q5 ruling) - strings, numbers, booleans, and
//! explicit nulls; nested objects and arrays never ship. An
//! over-cap entity drops properties reverse-lexicographically by
//! base URL with its LABEL property - the base URL whose value
//! provides the display label, resolved through the same canonical
//! type order the label cache uses - protected to the very end, so
//! the label survives every cap that admits at least one property.
//! Survivors emit ascending by name, the wire's map-key order. A
//! number ships as an integer when the store renders it integral
//! and it fits `i64`, as a double otherwise.
//!
//! An id that resolves to no visible entity - deleted since publish,
//! archived, drafted - reads `null` in every column, mirroring the
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

/// The link hydration query: the detail query's columns plus the
/// first direct type's title, input order preserved through the
/// ordinality column, absent entities simply missing from the
/// result.
const LINK_DETAIL_QUERY: &str = "
    SELECT
        ids.index,
        cache.labels[1] AS label,
        CASE
            WHEN jsonb_typeof(edition.properties -> $3::text) = 'string'
                THEN edition.properties ->> $3::text
        END AS own_icon,
        type_icon.icon AS type_icon,
        type_label.title AS type_label
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
    LEFT JOIN LATERAL (
        SELECT entity_types.closed_schema ->> 'title' AS title
        FROM unnest(cache.versioned_urls[1:cache.direct_types])
            WITH ORDINALITY AS direct (url, position)
        JOIN ontology_ids
          ON ontology_ids.base_url || 'v/' || ontology_ids.version = direct.url
        JOIN entity_types
          ON entity_types.ontology_id = ontology_ids.ontology_id
        ORDER BY direct.position
        LIMIT 1
    ) AS type_label ON TRUE
";

/// The locate hydration query: the detail query's columns plus the
/// entity's simple-valued properties and the base URL providing its
/// display label, input order preserved through the ordinality
/// column, absent entities simply missing from the result.
///
/// The `simple` column aggregates only simple-typed values - the Q5
/// filter runs in the store, so nested values never cross the
/// connection. The `label_property` lateral mirrors the
/// `entity_edition_cache` label derivation (migration V51): the
/// first `allOf` `labelProperty` path that resolves non-null, in
/// canonical direct-type order, is the path behind `labels[1]`.
const LOCATE_DETAIL_QUERY: &str = "
    SELECT
        ids.index,
        cache.labels[1] AS label,
        CASE
            WHEN jsonb_typeof(edition.properties -> $3::text) = 'string'
                THEN edition.properties ->> $3::text
        END AS own_icon,
        type_icon.icon AS type_icon,
        props.simple::text AS simple,
        label_property.path AS label_property
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
    LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(prop.key, prop.value) AS simple
        FROM jsonb_each(edition.properties) AS prop (key, value)
        WHERE jsonb_typeof(prop.value) IN ('string', 'number', 'boolean', 'null')
    ) AS props ON TRUE
    LEFT JOIN LATERAL (
        SELECT label_path.path
        FROM unnest(cache.versioned_urls[1:cache.direct_types])
            WITH ORDINALITY AS direct (url, position)
        JOIN ontology_ids
          ON ontology_ids.base_url || 'v/' || ontology_ids.version = direct.url
        JOIN entity_types
          ON entity_types.ontology_id = ontology_ids.ontology_id
        CROSS JOIN LATERAL jsonb_array_elements_text(
            jsonb_path_query_array(entity_types.closed_schema, '$.allOf[*].labelProperty')
        ) WITH ORDINALITY AS label_path (path, ordinality)
        WHERE jsonb_extract_path(edition.properties, label_path.path) IS NOT NULL
        ORDER BY direct.position, label_path.ordinality
        LIMIT 1
    ) AS label_property ON TRUE
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

/// One simple property value: the only shapes locate's properties
/// ship (the Q5 ruling; nested objects and arrays are filtered in
/// the store and never cross the connection).
#[derive(Debug, Clone, PartialEq)]
pub enum SimpleValue {
    /// A text scalar.
    Text(String),
    /// A number the store renders integral, within `i64`.
    Integer(i64),
    /// Any other number; store scalars are doubles on the wire.
    Float(f64),
    /// A boolean scalar.
    Boolean(bool),
    /// An explicit null the entity carries.
    Null,
}

/// Hydrated per-point locate details, aligned to the delivered
/// order: the node details plus each entity's capped properties.
#[derive(Debug, Clone, PartialEq)]
pub struct LocateNodeDetails {
    /// The display label per delivered point.
    labels: Vec<Option<String>>,
    /// The icon per delivered point.
    icons: Vec<Option<String>>,
    /// The surviving properties per delivered point, ascending by
    /// base URL - the wire's map-key order. `None` marks an entity
    /// the store no longer serves; a resolved entity without simple
    /// properties reads an empty list.
    properties: Vec<Option<Vec<(String, SimpleValue)>>>,
}

impl LocateNodeDetails {
    /// All-`null` details covering `count` points: the honest answer
    /// when no id can resolve.
    #[must_use]
    pub(super) fn empty(count: usize) -> Self {
        Self {
            labels: vec![None; count],
            icons: vec![None; count],
            properties: vec![None; count],
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

    /// Views the properties column, delivered order.
    #[inline]
    pub(super) const fn properties(&self) -> &[Option<Vec<(String, SimpleValue)>>] {
        &self.properties
    }
}

/// Hydrated per-link details, aligned to the delivered edge order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkDetails {
    /// The link entity's display label per delivered edge.
    labels: Vec<Option<String>>,
    /// The link entity's icon per delivered edge.
    icons: Vec<Option<String>>,
    /// The link's entity-type title per delivered edge.
    type_labels: Vec<Option<String>>,
    /// The link's entity-type icon per delivered edge.
    type_icons: Vec<Option<String>>,
}

impl LinkDetails {
    /// All-`null` details covering `count` edges: the honest answer
    /// when no id can resolve.
    #[must_use]
    pub(super) fn empty(count: usize) -> Self {
        Self {
            labels: vec![None; count],
            icons: vec![None; count],
            type_labels: vec![None; count],
            type_icons: vec![None; count],
        }
    }

    /// Views the link label column, delivered order.
    #[inline]
    pub(super) const fn labels(&self) -> &[Option<String>] {
        &self.labels
    }

    /// Views the link icon column, delivered order.
    #[inline]
    pub(super) const fn icons(&self) -> &[Option<String>] {
        &self.icons
    }

    /// Views the link-type label column, delivered order.
    #[inline]
    pub(super) const fn type_labels(&self) -> &[Option<String>] {
        &self.type_labels
    }

    /// Views the link-type icon column, delivered order.
    #[inline]
    pub(super) const fn type_icons(&self) -> &[Option<String>] {
        &self.type_icons
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
        if entities.ids.is_empty() {
            return Ok(NodeDetails::empty(0));
        }

        let (web_ids, entity_uuids) = uuid_arrays(&entities.ids);
        let rows = self
            .client
            .query(DETAIL_QUERY, &[&web_ids, &entity_uuids, &ICON_PROPERTY])
            .await
            .map_err(DetailError)?;

        let mut details = NodeDetails::empty(entities.count());
        for row in rows {
            let index = domain_index(&row);
            let label: Option<String> = row.get(1);
            let own_icon: Option<String> = row.get(2);
            let type_icon: Option<String> = row.get(3);

            details.labels[index] = label;
            details.icons[index] = own_icon.or(type_icon);
        }

        Ok(details)
    }

    /// Hydrates labels, icons, and capped simple-valued properties
    /// for the delivered entities, aligned to the delivered order;
    /// entities the store no longer serves read `null` in every
    /// column. `properties` is the per-entity cap (Q5): an over-cap
    /// entity drops properties reverse-lexicographically by base URL
    /// with its label property protected to the very end.
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
    pub async fn locate_details(
        &self,
        entities: &DeliveredEntities,
        properties: u32,
    ) -> Result<LocateNodeDetails, DetailError> {
        if entities.ids.is_empty() {
            return Ok(LocateNodeDetails::empty(0));
        }

        let (web_ids, entity_uuids) = uuid_arrays(&entities.ids);
        let rows = self
            .client
            .query(
                LOCATE_DETAIL_QUERY,
                &[&web_ids, &entity_uuids, &ICON_PROPERTY],
            )
            .await
            .map_err(DetailError)?;

        let mut details = LocateNodeDetails::empty(entities.count());
        for row in rows {
            let index = domain_index(&row);
            let label: Option<String> = row.get(1);
            let own_icon: Option<String> = row.get(2);
            let type_icon: Option<String> = row.get(3);
            let simple: Option<String> = row.get(4);
            let label_property: Option<String> = row.get(5);

            let entries = simple.map_or_else(Vec::new, |json| simple_properties(&json));
            details.labels[index] = label;
            details.icons[index] = own_icon.or(type_icon);
            details.properties[index] = Some(select_properties(
                entries,
                label_property.as_deref(),
                properties as usize,
            ));
        }

        Ok(details)
    }

    /// Hydrates labels, icons, and type labels and icons for the
    /// delivered link entities, aligned to the delivered edge order;
    /// links the store no longer serves read `null`.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// Panics when the store answers rows outside the request domain
    /// or with the wrong column types - a query bug, never data.
    #[tracing::instrument(skip_all, fields(edges = entities.count()))]
    pub async fn link_details(
        &self,
        entities: &DeliveredEntities,
    ) -> Result<LinkDetails, DetailError> {
        if entities.ids.is_empty() {
            return Ok(LinkDetails::empty(0));
        }

        let (web_ids, entity_uuids) = uuid_arrays(&entities.ids);
        let rows = self
            .client
            .query(
                LINK_DETAIL_QUERY,
                &[&web_ids, &entity_uuids, &ICON_PROPERTY],
            )
            .await
            .map_err(DetailError)?;

        let mut details = LinkDetails::empty(entities.count());
        for row in rows {
            let index = domain_index(&row);
            let label: Option<String> = row.get(1);
            let own_icon: Option<String> = row.get(2);
            let type_icon: Option<String> = row.get(3);
            let type_label: Option<String> = row.get(4);

            details.labels[index] = label;
            details.icons[index] = own_icon.or_else(|| type_icon.clone());
            details.type_labels[index] = type_label;
            details.type_icons[index] = type_icon;
        }

        Ok(details)
    }
}

/// Parses one entity's simple-property object off the store's text
/// rendering.
///
/// # Panics
///
/// Panics when the text is not a JSON object of simple values - the
/// query filters in the store, so anything else is a query bug,
/// never data.
pub(super) fn simple_properties(json: &str) -> Vec<(String, SimpleValue)> {
    let object: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(json).expect("the store renders a JSON object");

    object
        .into_iter()
        .map(|(name, value)| {
            let value = match value {
                serde_json::Value::String(text) => SimpleValue::Text(text),
                serde_json::Value::Number(number) => number.as_i64().map_or_else(
                    || SimpleValue::Float(number.as_f64().expect("a JSON number reads as f64")),
                    SimpleValue::Integer,
                ),
                serde_json::Value::Bool(flag) => SimpleValue::Boolean(flag),
                serde_json::Value::Null => SimpleValue::Null,
                serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                    unreachable!("the query ships simple values only")
                }
            };

            (name, value)
        })
        .collect()
}

/// Selects the surviving properties under the per-entity cap: the
/// drop order is reverse-lexicographic by base URL (bytewise), the
/// label property drops very last (Q5), and survivors sort ascending
/// by name - the wire's map-key order.
pub(super) fn select_properties(
    mut entries: Vec<(String, SimpleValue)>,
    label_property: Option<&str>,
    cap: usize,
) -> Vec<(String, SimpleValue)> {
    if entries.len() > cap {
        // Ranking the label before every other name makes one
        // ascending sort the whole rule: the tail beyond the cap is
        // exactly the reverse-lexicographic drop set.
        entries.sort_by(|left, right| {
            let protected = |name: &str| Some(name) != label_property;
            protected(&left.0)
                .cmp(&protected(&right.0))
                .then_with(|| left.0.cmp(&right.0))
        });
        entries.truncate(cap);
    }

    entries.sort_by(|left, right| left.0.cmp(&right.0));
    entries
}

/// Splits archived identities into the query's two uuid arrays.
fn uuid_arrays(ids: &[ArchivedEntityId]) -> (Vec<uuid::Uuid>, Vec<uuid::Uuid>) {
    let uuid = |bytes: &[u8]| {
        uuid::Uuid::from_slice(bytes).expect("archived identities are 16-byte uuids")
    };
    let web_ids = ids.iter().map(|id| uuid(id.web_id.as_bytes())).collect();
    let entity_uuids = ids
        .iter()
        .map(|id| uuid(id.entity_uuid.as_bytes()))
        .collect();

    (web_ids, entity_uuids)
}

/// Reads a result row's request-domain index off the ordinality
/// column.
fn domain_index(row: &tokio_postgres::Row) -> usize {
    let index: i64 = row.get(0);
    // Ordinality is 1-based; an index outside the request domain
    // cannot arrive from the unnest.
    usize::try_from(index - 1).expect("ordinality covers the request domain")
}
