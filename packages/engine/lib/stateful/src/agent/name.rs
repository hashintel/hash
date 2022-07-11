use core::ops::Deref;

use serde::{Deserialize, Serialize};
use serde_aux::prelude::deserialize_string_from_number;

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
pub struct AgentName(#[serde(deserialize_with = "deserialize_string_from_number")] pub String);

impl Deref for AgentName {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
