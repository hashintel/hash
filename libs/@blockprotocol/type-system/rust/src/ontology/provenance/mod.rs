use time::OffsetDateTime;

use crate::web::OwnedById;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum OntologyOwnership {
    #[serde(rename_all = "camelCase")]
    Local { owned_by_id: OwnedById },
    #[serde(rename_all = "camelCase")]
    Remote {
        #[serde(with = "hash_codec::serde::time")]
        fetched_at: OffsetDateTime,
    },
}
