use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub enum CreateAgent {
    #[serde(rename = "create_agent")]
    Type,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub enum RemoveAgent {
    // one bad thing about serde is how we still have to retype literals
    #[serde(rename = "remove_agent")]
    Type,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub enum StopSim {
    #[serde(rename = "stop")]
    Type,
}
