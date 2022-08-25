use std::fmt;

use serde::{Deserialize, Serialize};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SimulationId {
    id: u32,
}

impl SimulationId {
    pub fn new(id: u32) -> Self {
        SimulationId { id }
    }

    pub fn as_u32(self) -> u32 {
        self.id
    }

    pub fn as_f64(self) -> f64 {
        self.id as f64
    }
}

impl fmt::Display for SimulationId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.id, fmt)
    }
}
