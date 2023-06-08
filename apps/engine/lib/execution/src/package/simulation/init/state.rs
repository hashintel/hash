use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[allow(clippy::enum_variant_names)]
pub enum InitialStateName {
    InitJson,
    InitPy,
    InitJs,
    InitTs,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct InitialState {
    pub name: InitialStateName,
    pub src: String,
}
