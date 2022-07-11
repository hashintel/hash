use serde::Serialize;
use stateful::field::PackageId;

use crate::package::simulation::{PackageName, PackageType};

/// Initialization message for language runners
/// These can be sent out for experiment and simulation
/// level initialization
#[derive(Clone, Debug, Serialize)]
pub struct PackageInitMsgForWorker {
    pub name: PackageName,
    pub r#type: PackageType,
    pub id: PackageId,
    pub payload: serde_json::Value,
    // TODO: pub owned_fields: Vec<String>,
}
