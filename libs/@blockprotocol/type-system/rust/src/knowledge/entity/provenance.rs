#[cfg(feature = "postgres")]
use core::error::Error;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};

use crate::{
    principal::actor::{ActorEntityUuid, ActorType},
    provenance::{OriginProvenance, SourceProvenance},
};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityEditionProvenance {
    pub created_by_id: ActorEntityUuid,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by_id: Option<ActorEntityUuid>,
    #[serde(flatten)]
    pub provided: ProvidedEntityEditionProvenance,
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for EntityEditionProvenance {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for EntityEditionProvenance {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        Json(self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as ToSql>::accepts(ty)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProvidedEntityEditionProvenance {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<SourceProvenance>,
    pub actor_type: ActorType,
    pub origin: OriginProvenance,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[allow(
    clippy::struct_field_names,
    clippy::allow_attributes,
    reason = "prefix required for flattened serde serialization into `EntityProvenance`.
             `#[expect]` does not work here because serde's derive macro interferes with lint \
              expectation fulfillment (https://github.com/rust-lang/rust-clippy/issues/12035)"
)]
pub struct EntityDeletionProvenance {
    pub deleted_by_id: ActorEntityUuid,
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Timestamp"))]
    pub deleted_at_transaction_time: Timestamp<TransactionTime>,
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Timestamp"))]
    pub deleted_at_decision_time: Timestamp<DecisionTime>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
// `deny_unknown_fields` is intentionally absent: serde does not support it together with
// `#[serde(flatten)]` (https://serde.rs/container-attrs.html#deny_unknown_fields).
#[serde(rename_all = "camelCase")]
pub struct EntityProvenance {
    pub created_by_id: ActorEntityUuid,
    pub created_at_transaction_time: Timestamp<TransactionTime>,
    pub created_at_decision_time: Timestamp<DecisionTime>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_transaction_time: Option<Timestamp<TransactionTime>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_decision_time: Option<Timestamp<DecisionTime>>,
    #[serde(default, flatten, skip_serializing_if = "Option::is_none")]
    pub deletion: Option<EntityDeletionProvenance>,
    pub edition: EntityEditionProvenance,
}

/// Manual [`ToSchema`] implementation because utoipa's derive macro cannot correctly represent
/// `#[serde(flatten)]` on `Option<EntityDeletionProvenance>`: it generates an `allOf` that makes
/// the deletion fields required. The correct schema lists them as optional properties.
///
/// [`ToSchema`]: utoipa::ToSchema
#[cfg(feature = "utoipa")]
impl utoipa::ToSchema<'static> for EntityProvenance {
    fn schema() -> (
        &'static str,
        utoipa::openapi::RefOr<utoipa::openapi::Schema>,
    ) {
        use utoipa::openapi::{ObjectBuilder, Ref, Schema};

        (
            "EntityProvenance",
            Schema::Object(
                ObjectBuilder::new()
                    .property("createdById", Ref::from_schema_name("ActorEntityUuid"))
                    .required("createdById")
                    .property(
                        "createdAtTransactionTime",
                        Ref::from_schema_name("Timestamp"),
                    )
                    .required("createdAtTransactionTime")
                    .property("createdAtDecisionTime", Ref::from_schema_name("Timestamp"))
                    .required("createdAtDecisionTime")
                    .property(
                        "firstNonDraftCreatedAtTransactionTime",
                        Ref::from_schema_name("Timestamp"),
                    )
                    .property(
                        "firstNonDraftCreatedAtDecisionTime",
                        Ref::from_schema_name("Timestamp"),
                    )
                    .property("deletedById", Ref::from_schema_name("ActorEntityUuid"))
                    .property(
                        "deletedAtTransactionTime",
                        Ref::from_schema_name("Timestamp"),
                    )
                    .property("deletedAtDecisionTime", Ref::from_schema_name("Timestamp"))
                    .property("edition", Ref::from_schema_name("EntityEditionProvenance"))
                    .required("edition")
                    .build(),
            )
            .into(),
        )
    }
}

/// Generates the TypeScript type for [`EntityProvenance`].
///
/// Deriving `tsify::Tsify` on the main struct would generate
/// `type EntityProvenance = { ... } & (EntityDeletionProvenance | {})` because of
/// `#[serde(flatten)]` on `Option<EntityDeletionProvenance>`. This patch generates a clean
/// interface with the deletion fields as individually optional properties instead.
#[cfg(target_arch = "wasm32")]
#[expect(dead_code, reason = "Used in the generated TypeScript types")]
mod entity_provenance_patch {
    use super::*;

    #[derive(tsify::Tsify)]
    #[serde(rename_all = "camelCase")]
    pub struct EntityProvenance {
        pub created_by_id: ActorEntityUuid,
        #[tsify(type = "Timestamp")]
        pub created_at_transaction_time: Timestamp<TransactionTime>,
        #[tsify(type = "Timestamp")]
        pub created_at_decision_time: Timestamp<DecisionTime>,
        #[tsify(type = "Timestamp")]
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub first_non_draft_created_at_transaction_time: Option<Timestamp<TransactionTime>>,
        #[tsify(type = "Timestamp")]
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub first_non_draft_created_at_decision_time: Option<Timestamp<DecisionTime>>,
        // Flattened from `Option<EntityDeletionProvenance>` — represented as individual optional
        // fields instead of `& (EntityDeletionProvenance | {})`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub deleted_by_id: Option<ActorEntityUuid>,
        #[tsify(type = "Timestamp")]
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub deleted_at_transaction_time: Option<Timestamp<TransactionTime>>,
        #[tsify(type = "Timestamp")]
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub deleted_at_decision_time: Option<Timestamp<DecisionTime>>,
        pub edition: EntityEditionProvenance,
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;

    #[test]
    fn entity_provenance_roundtrip_without_deletion() {
        let json = serde_json::json!({
            "createdById": Uuid::new_v4(),
            "createdAtTransactionTime": Timestamp::<TransactionTime>::now(),
            "createdAtDecisionTime": Timestamp::<DecisionTime>::now(),
            "edition": {
                "createdById": Uuid::new_v4(),
                "actorType": "user",
                "origin": { "type": "api" },
            },
        });
        let provenance: EntityProvenance =
            serde_json::from_value(json.clone()).expect("deserialization failed");
        assert!(provenance.deletion.is_none());
        let roundtrip = serde_json::to_value(&provenance).expect("serialization failed");
        assert_eq!(roundtrip, json);
    }

    /// The manual [`utoipa::ToSchema`] impl has no compile-time tie to the struct, so a new field
    /// silently goes stale in the OpenAPI schema. Comparing the serialized key set of a fully
    /// populated value against the schema's property set turns that drift into a test failure.
    #[cfg(feature = "utoipa")]
    #[test]
    fn entity_provenance_schema_matches_serialization() {
        use alloc::collections::BTreeSet;

        let json = serde_json::json!({
            "createdById": Uuid::new_v4(),
            "createdAtTransactionTime": Timestamp::<TransactionTime>::now(),
            "createdAtDecisionTime": Timestamp::<DecisionTime>::now(),
            "firstNonDraftCreatedAtTransactionTime": Timestamp::<TransactionTime>::now(),
            "firstNonDraftCreatedAtDecisionTime": Timestamp::<DecisionTime>::now(),
            "deletedById": Uuid::new_v4(),
            "deletedAtTransactionTime": Timestamp::<TransactionTime>::now(),
            "deletedAtDecisionTime": Timestamp::<DecisionTime>::now(),
            "edition": {
                "createdById": Uuid::new_v4(),
                "actorType": "user",
                "origin": { "type": "api" },
            },
        });
        let provenance: EntityProvenance =
            serde_json::from_value(json).expect("deserialization failed");
        let serialized = serde_json::to_value(&provenance).expect("serialization failed");
        let serialized_keys = serialized
            .as_object()
            .expect("should serialize to an object")
            .keys()
            .cloned()
            .collect::<BTreeSet<_>>();

        let (_, schema) = <EntityProvenance as utoipa::ToSchema>::schema();
        let utoipa::openapi::RefOr::T(utoipa::openapi::Schema::Object(object)) = schema else {
            panic!("schema should be a plain object");
        };
        let schema_keys = object.properties.keys().cloned().collect::<BTreeSet<_>>();

        assert_eq!(serialized_keys, schema_keys);
    }

    #[test]
    fn entity_provenance_roundtrip_with_deletion() {
        let json = serde_json::json!({
            "createdById": Uuid::new_v4(),
            "createdAtTransactionTime": Timestamp::<TransactionTime>::now(),
            "createdAtDecisionTime": Timestamp::<DecisionTime>::now(),
            "deletedById": Uuid::new_v4(),
            "deletedAtTransactionTime": Timestamp::<TransactionTime>::now(),
            "deletedAtDecisionTime": Timestamp::<DecisionTime>::now(),
            "edition": {
                "createdById": Uuid::new_v4(),
                "actorType": "user",
                "origin": { "type": "api" },
            },
        });
        let provenance: EntityProvenance =
            serde_json::from_value(json.clone()).expect("deserialization failed");
        assert!(provenance.deletion.is_some());
        let roundtrip = serde_json::to_value(&provenance).expect("serialization failed");
        assert_eq!(roundtrip, json);
    }
}
