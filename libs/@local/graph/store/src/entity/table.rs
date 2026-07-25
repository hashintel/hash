//! Types for the dedicated entities-table query.
//!
//! The table endpoint serves the entities table views: flat rows built from
//! materialized columns instead of a subgraph, with the summary and the page
//! read in one transaction. Follow-up pages are pinned to the first page's
//! database state through the [`EntityTableCursor`].
//!
//! Draft entities are never rows. Excluding them keeps every hydration join —
//! including the ones reaching a link row's endpoints — matched to at most one
//! edition per key, which is what lets the table read its rows in one pass.

use std::collections::HashMap;

use base64::Engine as _;
use hash_codec::numeric::Real;
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use serde::{Deserialize, Serialize, de, ser};
use type_system::{
    knowledge::{
        entity::id::{EntityEditionId, EntityId},
        property::{PropertyObject, metadata::PropertyObjectMetadata},
    },
    ontology::{VersionedUrl, id::BaseUrl},
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};
#[cfg(feature = "utoipa")]
use utoipa::{ToSchema, openapi};

use crate::{
    entity::{ClosedMultiEntityTypeMap, EntityQueryCursor, QueryConversion},
    entity_type::{EntityTypeResolveDefinitions, IncludeEntityTypeOption},
    query::Ordering,
};

/// Sort key of the entities table, closed over the materialized, indexable
/// columns. Extending the table's sortable columns means adding a variant
/// here, never a free-form path.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum EntityTableSortKey {
    /// When the entity was first created, in decision time.
    CreatedAtDecisionTime,
    /// When the current edition became effective — the "last edited" column.
    EditionCreatedAtDecisionTime,
    /// The entity's display label.
    Label,
    /// The title of the entity's first direct type.
    TypeTitle,
    /// Whether the entity is archived.
    Archived,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTableSorting {
    pub key: EntityTableSortKey,
    pub ordering: Ordering,
}

impl Default for EntityTableSorting {
    fn default() -> Self {
        Self {
            key: EntityTableSortKey::CreatedAtDecisionTime,
            ordering: Ordering::Descending,
        }
    }
}

/// A property value a table filter compares against.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum EntityTablePropertyValue {
    Number(Real),
    String(String),
}

/// A filter on one of the table's property columns, mirroring the operators the table's filter
/// UI offers.
///
/// The `type` tag selects the operator, `property` names the column, and each operator carries
/// exactly the value fields it needs, so a value-less operator with a value (or the reverse) is
/// unrepresentable.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EntityTablePropertyFilter {
    HasAnyValue {
        property: BaseUrl,
    },
    IsEmpty {
        property: BaseUrl,
    },
    IsTrue {
        property: BaseUrl,
    },
    IsFalse {
        property: BaseUrl,
    },
    Equals {
        property: BaseUrl,
        value: EntityTablePropertyValue,
    },
    NotEquals {
        property: BaseUrl,
        value: EntityTablePropertyValue,
    },
    GreaterThan {
        property: BaseUrl,
        value: Real,
    },
    GreaterThanOrEqual {
        property: BaseUrl,
        value: Real,
    },
    LessThan {
        property: BaseUrl,
        value: Real,
    },
    LessThanOrEqual {
        property: BaseUrl,
        value: Real,
    },
    /// Matches anywhere inside the property's text.
    ContainsSegment {
        property: BaseUrl,
        value: String,
    },
    StartsWith {
        property: BaseUrl,
        value: String,
    },
    EndsWith {
        property: BaseUrl,
        value: String,
    },
}

impl EntityTablePropertyFilter {
    /// The property column the filter applies to.
    #[must_use]
    pub const fn property(&self) -> &BaseUrl {
        match self {
            Self::HasAnyValue { property }
            | Self::IsEmpty { property }
            | Self::IsTrue { property }
            | Self::IsFalse { property }
            | Self::Equals { property, .. }
            | Self::NotEquals { property, .. }
            | Self::GreaterThan { property, .. }
            | Self::GreaterThanOrEqual { property, .. }
            | Self::LessThan { property, .. }
            | Self::LessThanOrEqual { property, .. }
            | Self::ContainsSegment { property, .. }
            | Self::StartsWith { property, .. }
            | Self::EndsWith { property, .. } => property,
        }
    }
}

/// Which webs the table draws rows from.
///
/// The default is [`Exclude`] with an empty list: every web the actor may
/// see.
///
/// [`Exclude`]: Self::Exclude
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EntityTableWebScope {
    /// Only the listed webs, where an empty list matches no rows at all.
    Include { webs: Vec<WebId> },
    /// Every web the actor may see except the listed ones.
    Exclude { webs: Vec<WebId> },
}

impl Default for EntityTableWebScope {
    fn default() -> Self {
        Self::Exclude { webs: Vec::new() }
    }
}

/// The scope of the entities table.
#[derive(Debug, Default, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTableFilter {
    #[serde(default)]
    pub webs: EntityTableWebScope,
    /// The types the rows are narrowed to, as the versioned selections a
    /// filter UI works with.
    ///
    /// Left out for no narrowing at all, where the table spans every type its
    /// scope holds. An empty list narrows to nothing and matches no rows.
    #[serde(default)]
    pub entity_type_ids: Option<Vec<VersionedUrl>>,
    /// Types the table never shows, whatever
    /// [`entity_type_ids`](Self::entity_type_ids) selects.
    ///
    /// Entities carrying one of these types are left out entirely — of the
    /// rows, the count, and the type summary alike — so a selection cannot
    /// bring them back. Base URLs rather than versioned ids on purpose: an
    /// exclusion is meant to hide a type regardless of which version an
    /// entity carries, and it covers inherited types as well as direct ones.
    #[serde(default)]
    pub excluded_type_base_urls: Vec<BaseUrl>,
    #[serde(default)]
    pub include_archived: bool,
    /// Conditions on property columns, all of which a row has to satisfy.
    #[serde(default)]
    pub property_filters: Vec<EntityTablePropertyFilter>,
}

/// Continuation of an entities-table page sequence.
///
/// It carries everything that determines the keyset's shape and the page
/// sequence's database state — the snapshot instants, the type universe, the
/// sort, and the keyset position. A continuation reads all of these from the
/// token and ignores the request's own sort, so a re-sent request cannot
/// drift from the sequence the token was handed out for. On the wire it is a
/// Base64-encoded token the client treats as opaque.
///
/// The snapshot is two bare instants rather than temporal axes: the table
/// only ever reads a current-instant snapshot, and a timestamp cannot express
/// the interval axes that would break its one-row-per-entity shape.
#[derive(Debug, Clone)]
pub struct EntityTableCursor {
    /// The transaction-time instant the sequence's snapshot is pinned at.
    pub transaction_time: Timestamp<TransactionTime>,
    /// The decision-time instant the sequence reads at.
    pub decision_time: Timestamp<DecisionTime>,
    /// The type universe derived from the first page's summary, pinned for the
    /// rest of the sequence.
    ///
    /// [`None`] means no universe is pinned — the sequence runs on a type
    /// selection the client re-sends, or its universe exceeded
    /// [`TYPE_UNIVERSE_LIMIT`]. Either way the following pages take it as it
    /// stands rather than deriving one of their own.
    pub type_universe: Option<Vec<VersionedUrl>>,
    pub sort: EntityTableSorting,
    pub position: EntityQueryCursor<'static>,
}

/// How many types the derived universe may carry before it is dropped.
///
/// The universe is a planner aid — the scope filter alone decides which rows
/// match — so dropping it past a limit only costs the include clause's
/// estimability. Keeping it unbounded would grow both the cursor token and the
/// page statement's parameter list with every type a web accumulates.
pub const TYPE_UNIVERSE_LIMIT: usize = 512;

impl Serialize for EntityTableCursor {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: ser::Serializer,
    {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Payload<'a> {
            transaction_time: Timestamp<TransactionTime>,
            decision_time: Timestamp<DecisionTime>,
            type_universe: &'a Option<Vec<VersionedUrl>>,
            sort: &'a EntityTableSorting,
            position: &'a EntityQueryCursor<'static>,
        }

        let Self {
            transaction_time,
            decision_time,
            type_universe,
            sort,
            position,
        } = self;

        let bytes = serde_json::to_vec(&Payload {
            transaction_time: *transaction_time,
            decision_time: *decision_time,
            type_universe,
            sort,
            position,
        })
        .map_err(ser::Error::custom)?;

        serializer.serialize_str(&base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
    }
}

impl<'de> Deserialize<'de> for EntityTableCursor {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: de::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct EntityTableCursorPayload<'a> {
            transaction_time: Timestamp<TransactionTime>,
            decision_time: Timestamp<DecisionTime>,
            type_universe: Option<Vec<VersionedUrl>>,
            sort: EntityTableSorting,
            #[serde(borrow)]
            position: EntityQueryCursor<'a>,
        }

        let token = String::deserialize(deserializer)?;
        let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(&token)
            .map_err(de::Error::custom)?;
        let EntityTableCursorPayload {
            transaction_time,
            decision_time,
            type_universe,
            sort,
            position,
        } = serde_json::from_slice(&bytes).map_err(de::Error::custom)?;

        // The keyset's sort key plus the uuid tiebreaker — a position of any
        // other arity would compile into a silently weakened keyset, where
        // `EntityQuerySorting::compile` zips the two and truncates.
        if position.values.len() != 2 {
            return Err(de::Error::custom(
                "the cursor position should carry the sort key and the uuid tiebreaker",
            ));
        }

        Ok(Self {
            transaction_time,
            decision_time,
            type_universe,
            sort,
            position: position.into_owned(),
        })
    }
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for EntityTableCursor {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "EntityTableCursor",
            openapi::Schema::Object(
                openapi::schema::ObjectBuilder::new()
                    .schema_type(openapi::SchemaType::String)
                    .description(Some("An opaque continuation token for the entities table"))
                    .build(),
            )
            .into(),
        )
    }
}

/// Parameters for [`EntityStore::query_entities_table`].
///
/// [`EntityStore::query_entities_table`]: crate::entity::EntityStore::query_entities_table
#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueryEntitiesTableParams {
    pub filter: EntityTableFilter,
    /// Continuation from a previous page. Left out on the first page, which
    /// reads a fresh snapshot at the current instant. The sort and draft
    /// visibility of a continuation come from the token, not from the
    /// request.
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub cursor: Option<EntityTableCursor>,
    pub limit: usize,
    #[serde(default)]
    pub sort: EntityTableSorting,
    /// Converts the rows' property values at each conversion's path into its
    /// target data type, mirroring [`QueryEntitiesParams::conversions`].
    ///
    /// [`QueryEntitiesParams::conversions`]: crate::entity::QueryEntitiesParams::conversions
    #[serde(default)]
    pub conversions: Vec<QueryConversion<'static>>,
    #[serde(default)]
    pub include_summary: bool,
    /// Resolves the closed schemas of the rows' types into
    /// [`closed_multi_entity_types`] and [`definitions`] alongside the page.
    ///
    /// [`closed_multi_entity_types`]: QueryEntitiesTableResponse::closed_multi_entity_types
    /// [`definitions`]: QueryEntitiesTableResponse::definitions
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub include_entity_types: Option<IncludeEntityTypeOption>,
}

/// One endpoint of a link row: its identity, display label, and direct types.
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityTableLinkEndpoint {
    pub entity_id: EntityId,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub label: Option<String>,
    /// The endpoint's direct types.
    pub entity_type_ids: Vec<VersionedUrl>,
}

/// One row of the entities table, built entirely from materialized columns
/// plus the raw property object.
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityTableRow {
    pub entity_id: EntityId,
    pub entity_edition_id: EntityEditionId,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub label: Option<String>,
    /// The entity's direct types, parallel to
    /// [`entity_type_titles`](Self::entity_type_titles).
    pub entity_type_ids: Vec<VersionedUrl>,
    pub entity_type_titles: Vec<String>,
    pub created_at_transaction_time: Timestamp<TransactionTime>,
    pub created_at_decision_time: Timestamp<DecisionTime>,
    /// When the current edition became effective — the "last edited" column.
    pub edition_created_at_decision_time: Timestamp<DecisionTime>,
    pub created_by: ActorEntityUuid,
    pub last_edited_by: ActorEntityUuid,
    pub archived: bool,
    pub properties: PropertyObject,
    /// The value-level metadata of [`properties`](Self::properties), including
    /// each value's resolved data type id.
    pub properties_metadata: PropertyObjectMetadata,
    /// The link's source, set on link rows only.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub source_entity: Option<EntityTableLinkEndpoint>,
    /// The link's target, set on link rows only.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub target_entity: Option<EntityTableLinkEndpoint>,
}

/// The summary of the entities table.
///
/// The two halves have different scopes on purpose: [`count`] reflects the
/// page's full filters, where the type maps span the whole scope so a filter
/// UI can widen a narrowed selection.
///
/// [`count`]: Self::count
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityTableSummary {
    /// How many entities match the page's full filters.
    pub count: usize,
    /// How many entities in the scope carry each (direct) type.
    pub entity_type_ids: HashMap<VersionedUrl, usize>,
    /// The display titles of the types in [`entity_type_ids`].
    ///
    /// [`entity_type_ids`]: Self::entity_type_ids
    pub entity_type_titles: HashMap<VersionedUrl, String>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct QueryEntitiesTableResponse {
    pub rows: Vec<EntityTableRow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub closed_multi_entity_types: Option<HashMap<VersionedUrl, ClosedMultiEntityTypeMap>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub definitions: Option<EntityTypeResolveDefinitions>,
    /// Continuation for the next page. `None` means this page was known to be
    /// the last, where a page that exactly fills the limit still hands one out
    /// and the follow-up page comes back empty.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub cursor: Option<EntityTableCursor>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub summary: Option<EntityTableSummary>,
}

#[cfg(test)]
mod tests {
    use core::str::FromStr as _;

    use serde_json::json;
    use type_system::knowledge::entity::id::{EntityEditionId, EntityUuid};
    use uuid::Uuid;

    use super::*;
    use crate::query::CursorField;

    fn sample_cursor() -> EntityTableCursor {
        EntityTableCursor {
            transaction_time: serde_json::from_value(json!("2025-01-01T00:00:00Z"))
                .expect("the timestamp should deserialize"),
            decision_time: serde_json::from_value(json!("2025-01-01T00:00:00Z"))
                .expect("the timestamp should deserialize"),
            type_universe: Some(vec![
                VersionedUrl::from_str("https://example.com/types/entity-type/person/v/1")
                    .expect("the URL should be a valid versioned URL"),
            ]),
            sort: EntityTableSorting::default(),
            position: EntityQueryCursor {
                values: vec![
                    CursorField::String("position".into()),
                    CursorField::Uuid(Uuid::nil()),
                ],
            },
        }
    }

    #[test]
    fn a_cursor_position_of_the_wrong_arity_is_rejected() {
        let token = |values: Vec<CursorField<'static>>| {
            let mut payload = serde_json::to_value(sample_cursor())
                .and_then(|token| {
                    serde_json::from_slice::<serde_json::Value>(
                        &base64::engine::general_purpose::URL_SAFE_NO_PAD
                            .decode(token.as_str().expect("the token should be a string"))
                            .expect("the token should be base64"),
                    )
                })
                .expect("the cursor should round-trip");
            payload["position"] = serde_json::to_value(EntityQueryCursor { values })
                .expect("the position should serialize");
            json!(
                base64::engine::general_purpose::URL_SAFE_NO_PAD
                    .encode(serde_json::to_vec(&payload).expect("the payload should serialize"),)
            )
        };

        for (values, case) in [
            (vec![], "an empty position leaves no keyset condition"),
            (
                vec![CursorField::String("position".into())],
                "a short position drops the uuid tiebreaker",
            ),
            (
                vec![
                    CursorField::String("position".into()),
                    CursorField::Uuid(Uuid::nil()),
                    CursorField::Uuid(Uuid::nil()),
                ],
                "a long position carries a column the sort does not",
            ),
        ] {
            assert!(
                serde_json::from_value::<EntityTableCursor>(token(values)).is_err(),
                "{case} must be rejected at the serde boundary",
            );
        }
    }

    #[test]
    fn garbage_cursor_tokens_are_rejected() {
        for (token, case) in [
            (json!("not base64 !!!"), "invalid base64"),
            (
                json!(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b"not json")),
                "valid base64, invalid payload",
            ),
            (
                json!(
                    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(br#"{"stray": true}"#)
                ),
                "valid json, unknown payload shape",
            ),
        ] {
            assert!(
                serde_json::from_value::<EntityTableCursor>(token).is_err(),
                "{case} must be rejected at the serde boundary",
            );
        }
    }

    fn params_json() -> serde_json::Value {
        json!({
            "filter": {},
            "limit": 500,
        })
    }

    #[test]
    fn params_first_page_deserializes_with_defaults() {
        let params: QueryEntitiesTableParams =
            serde_json::from_value(params_json()).expect("the params should deserialize");

        assert!(params.cursor.is_none());
        assert_eq!(params.limit, 500);
        assert_eq!(params.sort, EntityTableSorting::default());
        assert!(!params.include_summary);
        assert_eq!(params.filter.webs, EntityTableWebScope::default());
        assert_eq!(params.filter.entity_type_ids, None);
        assert!(!params.filter.include_archived);
        assert!(params.filter.excluded_type_base_urls.is_empty());
    }

    #[test]
    fn the_web_scope_deserializes_from_its_tag() {
        let mut json = params_json();
        json["filter"] = json!({
            "webs": {
                "type": "exclude",
                "webs": ["00000000-0000-0000-0000-000000000000"],
            },
        });

        let params: QueryEntitiesTableParams =
            serde_json::from_value(json).expect("the params should deserialize");

        assert!(matches!(
            params.filter.webs,
            EntityTableWebScope::Exclude { webs } if webs.len() == 1,
        ));
    }

    #[test]
    fn a_type_selection_is_told_apart_from_no_selection() {
        let selection = |value: serde_json::Value| {
            let mut json = params_json();
            json["filter"] = json!({ "entityTypeIds": value });
            serde_json::from_value::<QueryEntitiesTableParams>(json)
                .expect("the params should deserialize")
                .filter
                .entity_type_ids
        };

        assert_eq!(
            selection(json!(null)),
            None,
            "an absent selection should narrow to nothing at all",
        );
        assert_eq!(
            selection(json!([])),
            Some(Vec::new()),
            "an empty selection should stay distinct from an absent one",
        );
        assert_eq!(
            selection(json!(["https://example.com/types/entity-type/person/v/1"])).as_deref(),
            Some(
                [
                    VersionedUrl::from_str("https://example.com/types/entity-type/person/v/1")
                        .expect("the URL should be a valid versioned URL"),
                ]
                .as_slice()
            ),
        );
    }

    #[test]
    fn a_selection_keeps_the_exclusions() {
        let mut json = params_json();
        json["filter"] = json!({
            "entityTypeIds": ["https://example.com/types/entity-type/person/v/1"],
            "excludedTypeBaseUrls": ["https://example.com/types/entity-type/noise/"],
        });

        let params: QueryEntitiesTableParams =
            serde_json::from_value(json).expect("the params should deserialize");

        assert!(params.filter.entity_type_ids.is_some());
        assert_eq!(
            params.filter.excluded_type_base_urls.len(),
            1,
            "a selection should not drop the exclusions",
        );
    }

    #[test]
    fn params_continuation_deserializes() {
        let token = serde_json::to_value(sample_cursor()).expect("the cursor should serialize");

        let mut json = params_json();
        json["cursor"] = token;

        let params: QueryEntitiesTableParams =
            serde_json::from_value(json).expect("the params should deserialize");

        let cursor = params.cursor.expect("the params should carry the cursor");
        assert_eq!(
            cursor.type_universe,
            sample_cursor().type_universe,
            "the cursor round-trips through the params",
        );
    }

    #[test]
    fn property_filters_deserialize() {
        let mut json = params_json();
        json["filter"] = json!({
            "propertyFilters": [
                {
                    "type": "equals",
                    "property": "https://example.com/types/property-type/name/",
                    "value": "Alice",
                },
                {
                    "type": "greaterThan",
                    "property": "https://example.com/types/property-type/age/",
                    "value": 30,
                },
                {
                    "type": "hasAnyValue",
                    "property": "https://example.com/types/property-type/hobby/",
                },
            ],
        });

        let params: QueryEntitiesTableParams =
            serde_json::from_value(json).expect("the params should deserialize");

        assert_eq!(params.filter.property_filters.len(), 3);
        assert!(matches!(
            &params.filter.property_filters[0],
            EntityTablePropertyFilter::Equals {
                value: EntityTablePropertyValue::String(value),
                ..
            } if value == "Alice",
        ));
        assert!(matches!(
            &params.filter.property_filters[1],
            EntityTablePropertyFilter::GreaterThan { .. },
        ));
        assert!(matches!(
            &params.filter.property_filters[2],
            EntityTablePropertyFilter::HasAnyValue { .. },
        ));
    }

    #[test]
    fn params_reject_unknown_fields() {
        let mut json = params_json();
        json["page"] = json!({ "temporalAxes": {} });
        assert!(
            serde_json::from_value::<QueryEntitiesTableParams>(json).is_err(),
            "an unknown field must be rejected",
        );
    }

    #[test]
    fn response_wire_shape() {
        fn timestamp<A>(value: &str) -> Timestamp<A>
        where
            for<'de> Timestamp<A>: Deserialize<'de>,
        {
            serde_json::from_value(json!(value)).expect("the timestamp should deserialize")
        }

        let response = QueryEntitiesTableResponse {
            rows: vec![EntityTableRow {
                entity_id: EntityId {
                    web_id: WebId::new(Uuid::nil()),
                    entity_uuid: EntityUuid::new(Uuid::nil()),
                    draft_id: None,
                },
                entity_edition_id: EntityEditionId::new(Uuid::nil()),
                label: None,
                entity_type_ids: vec![
                    VersionedUrl::from_str("https://example.com/types/entity-type/person/v/1")
                        .expect("the URL should be a valid versioned URL"),
                ],
                entity_type_titles: vec!["Person".to_owned()],
                created_at_transaction_time: timestamp("2025-01-01T00:00:00Z"),
                created_at_decision_time: timestamp("2025-01-01T00:00:00Z"),
                edition_created_at_decision_time: timestamp("2025-01-02T00:00:00Z"),
                created_by: ActorEntityUuid::new(Uuid::nil()),
                last_edited_by: ActorEntityUuid::new(Uuid::nil()),
                archived: false,
                properties: serde_json::from_value(json!({}))
                    .expect("the empty object should be a valid property object"),
                properties_metadata: PropertyObjectMetadata::default(),
                source_entity: None,
                target_entity: None,
            }],
            closed_multi_entity_types: None,
            definitions: None,
            cursor: Some(sample_cursor()),
            summary: None,
        };

        let json = serde_json::to_value(&response).expect("the response should serialize");

        assert!(
            json["cursor"].is_string(),
            "the cursor serializes as an opaque token",
        );
        assert!(
            json.get("summary").is_none(),
            "an unrequested summary is omitted",
        );

        let row = &json["rows"][0];
        for key in [
            "entityId",
            "entityEditionId",
            "entityTypeIds",
            "entityTypeTitles",
            "createdAtTransactionTime",
            "createdAtDecisionTime",
            "editionCreatedAtDecisionTime",
            "createdBy",
            "lastEditedBy",
            "archived",
            "properties",
        ] {
            assert!(row.get(key).is_some(), "row is missing the `{key}` key");
        }
        assert!(
            row.get("label").is_none(),
            "a missing label is omitted from the row",
        );
    }
}
