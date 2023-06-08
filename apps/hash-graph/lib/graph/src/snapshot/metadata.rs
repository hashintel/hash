use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMetadata {
    pub block_protocol_module_versions: BlockProtocolModuleVersions,
    #[serde(default, skip_serializing_if = "CustomGlobalMetadata::is_empty")]
    pub custom: CustomGlobalMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockProtocolModuleVersions {
    pub graph: semver::Version,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomGlobalMetadata;

impl CustomGlobalMetadata {
    #[must_use]
    #[expect(clippy::unused_self)]
    const fn is_empty(&self) -> bool {
        true
    }
}
