use crate::simulation::packages::PackageType;

use super::id::PackageId;

/// Initialization message for language runners
#[derive(Clone, Debug)]
pub struct PackageInitMsgForWorker {
    pub name: String,
    pub r#type: PackageType,
    pub id: PackageId,
    pub payload: serde_json::Value,
}
