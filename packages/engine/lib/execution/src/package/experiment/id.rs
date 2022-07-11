use std::{fmt, str::FromStr};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ExperimentId {
    id: Uuid,
}

impl ExperimentId {
    pub fn generate() -> Self {
        Self { id: Uuid::new_v4() }
    }

    pub fn as_bytes(&self) -> &[u8; core::mem::size_of::<u128>()] {
        self.id.as_bytes()
    }

    pub fn as_uuid(self) -> Uuid {
        self.id
    }
}

impl fmt::Display for ExperimentId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl FromStr for ExperimentId {
    type Err = uuid::Error;

    fn from_str(uuid_str: &str) -> Result<Self, Self::Err> {
        Ok(Self {
            id: Uuid::from_str(uuid_str)?,
        })
    }
}
