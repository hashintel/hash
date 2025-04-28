use type_system::ontology::BaseUrl;
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

use crate::Embedding;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityEmbedding<'e> {
    // TODO: Stop allocating everywhere in type-system package
    //   see https://linear.app/hash/issue/BP-57
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub property: Option<BaseUrl>,
    pub embedding: Embedding<'e>,
}
