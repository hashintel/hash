#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSnapshotRecord {
    pub name: String,
    pub parents: Vec<String>,
}
