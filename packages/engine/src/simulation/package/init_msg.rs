use super::{
    context::packages::ContextInitPayload, init::packages::InitInitPayload,
    initialized::PackageType, output::packages::OutputInitPayload,
    state::packages::StateInitPayload,
};
use crate::simulation::enum_dispatch::*;
use crate::types::PackageID;
use serde::{Deserialize, Serialize};

// TODO OS - This file isn't in the module tree, delete?

pub trait GetLanguageSpecificPayload {
    // TODO 3 methods for getting the payload message specific
    // for each language runner (Python, Rust and JavaScript)
}

#[enum_dispatch(GetLanguageSpecificPayload)]
#[derive(Clone, Serialize, Deserialize)]
pub enum PackageInitPayloadForWorker {
    // Package-specific info
    InitInitPayload,
    ContextInitPayload,
    StateInitPayload,
    OutputInitPayload,
}

/// Initialization message for language runners
#[derive(Clone)]
pub struct PackageInitMsgForWorker {
    pub name: String,
    pub r#type: PackageType,
    pub id: PackageID,
    pub owned_fields: Vec<String>, // Names of Arrow columns; TODO: Move into `payload`?
    pub payload: PackageInitPayloadForWorker,
}
// (Not every field must have an owner -- e.g. `agent_id` has no owner.)
