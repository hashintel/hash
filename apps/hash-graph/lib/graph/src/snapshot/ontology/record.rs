use serde::{Deserialize, Serialize};

use crate::ontology::{OntologyElementMetadata, OntologyType, OntologyTypeWithMetadata};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound(
        serialize = "T::Representation: Serialize, <T::WithMetadata as \
                     OntologyTypeWithMetadata>::Metadata: Serialize",
        deserialize = "T::Representation: Deserialize<'de>, <T::WithMetadata as \
                       OntologyTypeWithMetadata>::Metadata: Deserialize<'de>"
    )
)]
pub struct OntologyTypeSnapshotRecord<T: OntologyType> {
    pub schema: T::Representation,
    pub metadata: OntologyElementMetadata,
}
