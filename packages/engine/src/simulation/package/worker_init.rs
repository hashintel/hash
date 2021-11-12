use crate::simulation::package::name::PackageName;
use crate::simulation::package::PackageType;

use super::id::PackageId;

/// Initialization message for language runners
/// These can be sent out for experiment and simulation
/// level initialization
#[derive(Clone, Debug)]
pub struct PackageInitMsgForWorker {
    pub name: PackageName,
    pub r#type: PackageType,
    pub id: PackageId,
    pub payload: serde_json::Value,
}
