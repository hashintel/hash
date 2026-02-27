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
    reason = "prefix required for flattened serde serialization into `InferredEntityProvenance`.
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
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct InferredEntityProvenance {
    pub created_by_id: ActorEntityUuid,
    pub created_at_transaction_time: Timestamp<TransactionTime>,
    pub created_at_decision_time: Timestamp<DecisionTime>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_transaction_time: Option<Timestamp<TransactionTime>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_decision_time: Option<Timestamp<DecisionTime>>,
    #[serde(default, flatten, skip_serializing_if = "Option::is_none")]
    pub deletion: Option<EntityDeletionProvenance>,
}

/// Manual [`ToSchema`] implementation because utoipa's derive macro cannot correctly represent
/// `#[serde(flatten)]` on `Option<EntityDeletionProvenance>`: it generates an `allOf` that makes
/// the deletion fields required. The correct schema lists them as optional properties.
#[cfg(feature = "utoipa")]
impl utoipa::ToSchema<'static> for InferredEntityProvenance {
    fn schema() -> (
        &'static str,
        utoipa::openapi::RefOr<utoipa::openapi::Schema>,
    ) {
        use utoipa::openapi::{ObjectBuilder, Ref, Schema};

        (
            "InferredEntityProvenance",
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
                    .build(),
            )
            .into(),
        )
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for InferredEntityProvenance {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for InferredEntityProvenance {
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
pub struct EntityProvenance {
    #[serde(flatten)]
    pub inferred: InferredEntityProvenance,
    pub edition: EntityEditionProvenance,
}

/// Override tsify's generated type for [`InferredEntityProvenance`].
///
/// The main struct's `derive(tsify::Tsify)` generates
/// `type InferredEntityProvenance = { ... } & (EntityDeletionProvenance | {})` because of
/// `#[serde(flatten)]` on `Option<EntityDeletionProvenance>`. That complex type alias cannot be
/// used with `extends` in [`EntityProvenance`]'s interface declaration.
///
/// This patch generates a clean interface with the deletion fields as individually optional
/// properties, which overrides the broken declaration in the wasm output.
#[cfg(target_arch = "wasm32")]
#[expect(dead_code, reason = "Used in the generated TypeScript types")]
mod inferred_entity_provenance_patch {
    use super::*;

    #[derive(tsify::Tsify)]
    #[serde(rename_all = "camelCase")]
    pub struct InferredEntityProvenance {
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
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;

    #[test]
    fn inferred_provenance_roundtrip_without_deletion() {
        let json = serde_json::json!({
            "createdById": Uuid::new_v4(),
            "createdAtTransactionTime": Timestamp::<TransactionTime>::now(),
            "createdAtDecisionTime": Timestamp::<DecisionTime>::now(),
        });
        let provenance: InferredEntityProvenance =
            serde_json::from_value(json.clone()).expect("deserialization failed");
        assert!(provenance.deletion.is_none());
        let roundtrip = serde_json::to_value(&provenance).expect("serialization failed");
        assert_eq!(roundtrip, json);
    }

    #[test]
    fn inferred_provenance_roundtrip_with_deletion() {
        let json = serde_json::json!({
            "createdById": Uuid::new_v4(),
            "createdAtTransactionTime": Timestamp::<TransactionTime>::now(),
            "createdAtDecisionTime": Timestamp::<DecisionTime>::now(),
            "deletedById": Uuid::new_v4(),
            "deletedAtTransactionTime": Timestamp::<TransactionTime>::now(),
            "deletedAtDecisionTime": Timestamp::<DecisionTime>::now(),
        });
        let provenance: InferredEntityProvenance =
            serde_json::from_value(json.clone()).expect("deserialization failed");
        assert!(provenance.deletion.is_some());
        let roundtrip = serde_json::to_value(&provenance).expect("serialization failed");
        assert_eq!(roundtrip, json);
    }
}
