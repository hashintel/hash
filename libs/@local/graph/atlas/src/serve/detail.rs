//! Detail hydration: live store reads for delivered points and edges.
//!
//! Detail hydrates at request time from Postgres, inline in the trailer - no published label
//! columns. Reads are live (`now()`, not the snapshot's decision time): text edited after publish
//! shows on snapshot geometry. Hydration queries only post-intersection ids, so it opens no new
//! auth surface.
//!
//! The tile trailer's per-point rules mirror the client's own display logic:
//!
//! - Label: `entity_edition_cache.labels[1]`, the entity's display label; `null` when the entity
//!   has none.
//! - Icon: the entity's own `icon` property when it is a string, else the graph's display-field
//!   rule (the SDK's `getDisplayFieldsForClosedEntityType`): every direct type's
//!   `closed_schema.allOf` carries per-ancestor display metadata, and the first non-null icon by
//!   inheritance depth wins - a type inherits its ancestors' icons, nearest first. `null` when no
//!   chain carries one - the client owns the fallback glyph.
//!
//! The locate and edges surfaces ship type REFERENCES instead of rendered display: each entity's
//! direct types read from `entity_edition_cache.versioned_urls`, and the client resolves labels
//! and icons through its own type metadata - one owner per display concern.
//!
//! Properties ship as simple values only - strings, numbers, booleans, and explicit nulls; nested
//! objects and arrays never survive the store-side filter. An over-cap entity drops properties
//! reverse-lexicographically by base URL with its label property - the base URL whose value
//! provides the display label, resolved through the same canonical type order the label cache
//! uses - protected to the very end, so the label survives every cap that admits at least one
//! property. Survivors emit ascending by name, the wire's map-key order. A number ships as an
//! integer when the store renders it integral and it fits `i64`, as a double otherwise. Each
//! hydration also counts the entity's WHOLE property set, so completeness - nothing filtered,
//! nothing capped - is attested per entity, never guessed.
//!
//! An id that resolves to no visible entity - deleted since publish, archived, drafted - reads
//! `null` in every column and `false` in every completeness flag, mirroring the zero-mask rule
//! for unresolvable type ids.

use tokio_postgres::Client;
use zerocopy::IntoBytes as _;

use crate::dataset::ArchivedEntityId;

/// The base URL of the system `icon` property an entity may carry.
const ICON_PROPERTY: &str = "https://hash.ai/@h/types/property-type/icon/";

/// The tile hydration query.
///
/// One batched lookup, input order preserved through the ordinality column, absent entities simply
/// missing from the result.
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

/// The locate node hydration query.
///
/// Labels and direct-type URLs for every delivered node, plus - gated to the first input, the
/// source - the simple-valued properties, the whole-set property count, and the base URL
/// providing the display label. Input order preserved through the ordinality column, absent
/// entities simply missing from the result.
///
/// The `simple` column aggregates only simple-typed values - the filter runs in the store, so
/// nested values never cross the connection - while `total` counts the unfiltered set, the
/// completeness flag's ground truth. The `label_property` lateral mirrors the
/// `entity_edition_cache` label derivation (migration V51): the first `allOf` `labelProperty` path
/// that resolves non-null, in canonical direct-type order, is the path behind `labels[1]`.
const LOCATE_DETAIL_QUERY: &str = "
    SELECT
        ids.index,
        cache.labels[1] AS label,
        cache.versioned_urls[1:cache.direct_types] AS type_urls,
        props.simple::text AS simple,
        props.total AS total,
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
        SELECT
            jsonb_object_agg(prop.key, prop.value) FILTER (
                WHERE jsonb_typeof(prop.value) IN ('string', 'number', 'boolean', 'null')
            ) AS simple,
            count(*)::int4 AS total
        FROM jsonb_each(edition.properties) AS prop (key, value)
    ) AS props ON ids.index = 1
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
    ) AS label_property ON ids.index = 1
";

/// The locate link hydration query.
///
/// The locate node query's columns for every delivered link entity, ungated: every edge in a
/// locate response carries its label, direct-type URLs, capped properties, and completeness
/// flags.
const LOCATE_LINK_QUERY: &str = "
    SELECT
        ids.index,
        cache.labels[1] AS label,
        cache.versioned_urls[1:cache.direct_types] AS type_urls,
        props.simple::text AS simple,
        props.total AS total,
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
        SELECT
            jsonb_object_agg(prop.key, prop.value) FILTER (
                WHERE jsonb_typeof(prop.value) IN ('string', 'number', 'boolean', 'null')
            ) AS simple,
            count(*)::int4 AS total
        FROM jsonb_each(edition.properties) AS prop (key, value)
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

/// The edges link hydration query.
///
/// The bulk surface's lean columns: the link's label and its first direct type URL, input order
/// preserved through the ordinality column, absent entities simply missing from the result.
const EDGES_LINK_QUERY: &str = "
    SELECT
        ids.index,
        cache.labels[1] AS label,
        cache.versioned_urls[1] AS first_type_url
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
";

/// The entity identities behind one delivered set, in delivered order.
///
/// The hydration request's subject.
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

/// Hydrated per-point tile details, aligned to the delivered order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeDetails {
    /// The display label per delivered point.
    labels: Vec<Option<String>>,
    /// The icon per delivered point.
    icons: Vec<Option<String>>,
}

impl NodeDetails {
    /// All-`null` details covering `count` points: the honest answer when no id can resolve.
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

/// One simple property value: the only shape hydrated properties ship.
///
/// Nested objects and arrays are filtered in the store and never cross the connection.
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

/// Hydrated per-point locate node details, aligned to the delivered order.
///
/// Labels and direct types for every delivered node; properties and their completeness for the
/// source alone - neighbour detail is one locate away.
#[derive(Debug, Clone, PartialEq)]
pub struct LocateNodeDetails {
    /// The display label per delivered point.
    labels: Vec<Option<String>>,
    /// The direct-type versioned URLs per delivered point, canonical order.
    ///
    /// Empty when the store no longer serves the entity or records no types for it.
    type_urls: Vec<Vec<String>>,
    /// The source's surviving properties, ascending by base URL.
    ///
    /// `None` marks a source the store no longer serves; a resolved source without simple
    /// properties reads an empty list.
    source_properties: Option<Vec<(String, SimpleValue)>>,
    /// Whether the source's surviving properties are the entity's whole set.
    ///
    /// `false` when the simple-value filter or the cap dropped anything, and when the store no
    /// longer serves the source.
    source_properties_complete: bool,
}

impl LocateNodeDetails {
    /// All-`null` details covering `count` points: the honest answer when no id can resolve.
    #[must_use]
    pub(super) fn empty(count: usize) -> Self {
        Self {
            labels: vec![None; count],
            type_urls: vec![Vec::new(); count],
            source_properties: None,
            source_properties_complete: false,
        }
    }

    /// Views the label column, delivered order.
    #[inline]
    pub(super) const fn labels(&self) -> &[Option<String>] {
        &self.labels
    }

    /// Views the direct-type URL column, delivered order.
    #[inline]
    pub(super) const fn type_urls(&self) -> &[Vec<String>] {
        &self.type_urls
    }

    /// Views the source's surviving properties; `None` marks a store-absent source.
    #[inline]
    pub(super) const fn source_properties(&self) -> Option<&Vec<(String, SimpleValue)>> {
        self.source_properties.as_ref()
    }

    /// Returns whether the source's surviving properties are the entity's whole set.
    #[inline]
    pub(super) const fn source_properties_complete(&self) -> bool {
        self.source_properties_complete
    }
}

/// Hydrated per-link locate details, aligned to the delivered edge order.
///
/// The detail view's full link story: label, capped direct types, capped properties, and both
/// completeness flags per edge.
#[derive(Debug, Clone, PartialEq)]
pub struct LocateLinkDetails {
    /// The link entity's display label per delivered edge.
    labels: Vec<Option<String>>,
    /// The link's direct-type versioned URLs per delivered edge, canonical order, capped.
    ///
    /// Empty when the store no longer serves the link or records no types for it.
    type_urls: Vec<Vec<String>>,
    /// Whether each edge's type list is the link's whole direct set.
    ///
    /// `false` when the cap truncated it and when the store no longer serves the link.
    type_urls_complete: Vec<bool>,
    /// The link's surviving properties per delivered edge, ascending by base URL.
    ///
    /// `None` marks a link the store no longer serves.
    properties: Vec<Option<Vec<(String, SimpleValue)>>>,
    /// Whether each edge's surviving properties are the link entity's whole set.
    properties_complete: Vec<bool>,
}

impl LocateLinkDetails {
    /// All-`null` details covering `count` edges: the honest answer when no id can resolve.
    #[must_use]
    pub(super) fn empty(count: usize) -> Self {
        Self {
            labels: vec![None; count],
            type_urls: vec![Vec::new(); count],
            type_urls_complete: vec![false; count],
            properties: vec![None; count],
            properties_complete: vec![false; count],
        }
    }

    /// Views the link label column, delivered order.
    #[inline]
    pub(super) const fn labels(&self) -> &[Option<String>] {
        &self.labels
    }

    /// Views the capped direct-type URL column, delivered order.
    #[inline]
    pub(super) const fn type_urls(&self) -> &[Vec<String>] {
        &self.type_urls
    }

    /// Views the per-edge type completeness flags, delivered order.
    #[inline]
    pub(super) const fn type_urls_complete(&self) -> &[bool] {
        &self.type_urls_complete
    }

    /// Views the per-edge property column, delivered order.
    #[inline]
    pub(super) const fn properties(&self) -> &[Option<Vec<(String, SimpleValue)>>] {
        &self.properties
    }

    /// Views the per-edge property completeness flags, delivered order.
    #[inline]
    pub(super) const fn properties_complete(&self) -> &[bool] {
        &self.properties_complete
    }
}

/// Hydrated per-link edges details, aligned to the delivered edge order.
///
/// The bulk surface's lean columns: one label and one first-type reference per edge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EdgeLinkDetails {
    /// The link entity's display label per delivered edge.
    labels: Vec<Option<String>>,
    /// The link's first direct type's versioned URL per delivered edge.
    first_type_urls: Vec<Option<String>>,
}

impl EdgeLinkDetails {
    /// All-`null` details covering `count` edges: the honest answer when no id can resolve.
    #[must_use]
    pub(super) fn empty(count: usize) -> Self {
        Self {
            labels: vec![None; count],
            first_type_urls: vec![None; count],
        }
    }

    /// Views the link label column, delivered order.
    #[inline]
    pub(super) const fn labels(&self) -> &[Option<String>] {
        &self.labels
    }

    /// Views the first direct-type URL column, delivered order.
    #[inline]
    pub(super) const fn first_type_urls(&self) -> &[Option<String>] {
        &self.first_type_urls
    }
}

/// A detail hydration failed against the store.
#[derive(Debug)]
pub struct DetailError(tokio_postgres::Error);

impl core::fmt::Display for DetailError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(fmt, "the detail hydration failed: {}", self.0)
    }
}

impl core::error::Error for DetailError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        Some(&self.0)
    }
}

/// Live detail reads over one store connection.
///
/// The connection is dialed by the transport layer - the same `HASH_GRAPH_PG_*` configuration the
/// graph binary speaks - and the hydration path issues one batched query per request.
#[derive(Debug)]
pub struct GraphDatabaseClient {
    postgres: Client,
}

impl GraphDatabaseClient {
    /// Wraps an established store connection.
    #[must_use]
    pub const fn new(postgres: Client) -> Self {
        Self { postgres }
    }

    /// Hydrates labels and icons for the delivered entities, aligned to the delivered order.
    ///
    /// Entities the store no longer serves read `null`.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// Panics when the store answers rows outside the request domain or with the wrong column
    /// types: a query bug, never data.
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
            .postgres
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

    /// Hydrates the locate response's node columns, aligned to the delivered order.
    ///
    /// Labels and direct-type URLs for every delivered node; the source - the first delivered
    /// entity - additionally hydrates its capped simple-valued properties and their completeness.
    /// Entities the store no longer serves read `null` columns and `false` flags.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// Panics when the store answers rows outside the request domain or with the wrong column
    /// types: a query bug, never data.
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
            .postgres
            .query(LOCATE_DETAIL_QUERY, &[&web_ids, &entity_uuids])
            .await
            .map_err(DetailError)?;

        let mut details = LocateNodeDetails::empty(entities.count());
        for row in rows {
            let index = domain_index(&row);
            details.labels[index] = row.get(1);
            let type_urls: Option<Vec<String>> = row.get(2);
            details.type_urls[index] = type_urls.unwrap_or_default();

            if index == 0 {
                let (survivors, complete) = capped_properties(&row, properties as usize);
                details.source_properties = Some(survivors);
                details.source_properties_complete = complete;
            }
        }

        Ok(details)
    }

    /// Hydrates the locate response's link columns, aligned to the delivered edge order.
    ///
    /// Every delivered edge hydrates its label, its capped direct-type URLs, and its capped
    /// simple-valued properties, each cap paired with a completeness flag. Links the store no
    /// longer serves read `null` columns and `false` flags.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// Panics when the store answers rows outside the request domain or with the wrong column
    /// types: a query bug, never data.
    #[tracing::instrument(skip_all, fields(edges = entities.count()))]
    pub async fn locate_link_details(
        &self,
        entities: &DeliveredEntities,
        type_ids: u32,
        properties: u32,
    ) -> Result<LocateLinkDetails, DetailError> {
        if entities.ids.is_empty() {
            return Ok(LocateLinkDetails::empty(0));
        }

        let (web_ids, entity_uuids) = uuid_arrays(&entities.ids);
        let rows = self
            .postgres
            .query(LOCATE_LINK_QUERY, &[&web_ids, &entity_uuids])
            .await
            .map_err(DetailError)?;

        let mut details = LocateLinkDetails::empty(entities.count());
        for row in rows {
            let index = domain_index(&row);
            details.labels[index] = row.get(1);

            let type_urls: Option<Vec<String>> = row.get(2);
            let mut type_urls = type_urls.unwrap_or_default();
            details.type_urls_complete[index] = type_urls.len() <= type_ids as usize;
            type_urls.truncate(type_ids as usize);
            details.type_urls[index] = type_urls;

            let (survivors, complete) = capped_properties(&row, properties as usize);
            details.properties[index] = Some(survivors);
            details.properties_complete[index] = complete;
        }

        Ok(details)
    }

    /// Hydrates the edges response's link columns, aligned to the delivered edge order.
    ///
    /// Labels and first direct-type URLs; links the store no longer serves read `null`.
    ///
    /// # Errors
    ///
    /// Returns [`DetailError`] when the store rejects the query.
    ///
    /// # Panics
    ///
    /// Panics when the store answers rows outside the request domain or with the wrong column
    /// types: a query bug, never data.
    #[tracing::instrument(skip_all, fields(edges = entities.count()))]
    pub async fn link_details(
        &self,
        entities: &DeliveredEntities,
    ) -> Result<EdgeLinkDetails, DetailError> {
        if entities.ids.is_empty() {
            return Ok(EdgeLinkDetails::empty(0));
        }

        let (web_ids, entity_uuids) = uuid_arrays(&entities.ids);
        let rows = self
            .postgres
            .query(EDGES_LINK_QUERY, &[&web_ids, &entity_uuids])
            .await
            .map_err(DetailError)?;

        let mut details = EdgeLinkDetails::empty(entities.count());
        for row in rows {
            let index = domain_index(&row);
            details.labels[index] = row.get(1);
            details.first_type_urls[index] = row.get(2);
        }

        Ok(details)
    }
}

/// Reads one resolved row's capped properties and their completeness flag.
///
/// The row carries the property columns at fixed positions: `simple` (3), `total` (4), and
/// `label_property` (5). Completeness reads BEFORE the cap: the survivors are the whole set iff
/// nothing was filtered as non-simple and nothing exceeds the cap.
fn capped_properties(row: &tokio_postgres::Row, cap: usize) -> (Vec<(String, SimpleValue)>, bool) {
    let simple: Option<String> = row.get(3);
    let total: Option<i32> = row.get(4);
    let label_property: Option<String> = row.get(5);

    let entries = simple.map_or_else(Vec::new, |json| simple_properties(&json));
    let total = usize::try_from(total.expect("a resolved row aggregates its property count"))
        .expect("property counts are non-negative");
    let complete = entries.len() == total && entries.len() <= cap;

    (
        select_properties(entries, label_property.as_deref(), cap),
        complete,
    )
}

/// Parses one entity's simple-property object off the store's text rendering.
///
/// # Panics
///
/// Panics when the text is not a JSON object of simple values - the query filters in the store, so
/// anything else is a query bug, never data.
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

/// Selects the surviving properties under the per-entity cap.
///
/// The drop order is reverse-lexicographic by base URL (bytewise), the label property drops very
/// last, and survivors sort ascending by name - the wire's map-key order.
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

/// Reads a result row's request-domain index off the ordinality column.
fn domain_index(row: &tokio_postgres::Row) -> usize {
    let index: i64 = row.get(0);
    // Ordinality is 1-based; an index outside the request domain
    // cannot arrive from the unnest.
    usize::try_from(index - 1).expect("ordinality covers the request domain")
}
