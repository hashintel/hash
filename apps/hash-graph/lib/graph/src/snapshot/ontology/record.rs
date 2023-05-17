use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::{
    identifier::{
        ontology::OntologyTypeRecordId,
        time::{LeftClosedTemporalInterval, TransactionTime},
    },
    ontology::OntologyType,
    provenance::{OwnedById, ProvenanceMetadata},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTemporalMetadata {
    pub transaction_time: Option<LeftClosedTemporalInterval<TransactionTime>>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomOntologyMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<ProvenanceMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temporal_versioning: Option<OntologyTemporalMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owned_by_id: Option<OwnedById>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "time::serde::iso8601::option"
    )]
    pub fetched_at: Option<OffsetDateTime>,
}

impl CustomOntologyMetadata {
    #[must_use]
    const fn is_empty(&self) -> bool {
        self.provenance.is_none()
            && self.temporal_versioning.is_none()
            && self.owned_by_id.is_none()
            && self.fetched_at.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    #[serde(default, skip_serializing_if = "CustomOntologyMetadata::is_empty")]
    pub custom: CustomOntologyMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound(
        serialize = "T::Representation: Serialize",
        deserialize = "T::Representation: Deserialize<'de>"
    )
)]
pub struct OntologyTypeSnapshotRecord<T: OntologyType> {
    pub schema: T::Representation,
    pub metadata: OntologyTypeMetadata,
}
