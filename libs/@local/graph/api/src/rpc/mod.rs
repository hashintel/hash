pub mod account;
pub mod auth;
pub mod echo;
mod session;

use harpc_system::SubsystemIdentifier;
use harpc_types::subsystem::SubsystemId;

#[derive(Debug, Copy, Clone)]
pub enum GraphSubsystemId {
    Echo,
    Authentication,
    Account,
}

impl SubsystemIdentifier for GraphSubsystemId {
    fn from_id(id: SubsystemId) -> Option<Self>
    where
        Self: Sized,
    {
        match id.value() {
            0x00 => Some(Self::Echo),
            0x01 => Some(Self::Authentication),
            0x02 => Some(Self::Account),
            _ => None,
        }
    }

    fn into_id(self) -> SubsystemId {
        match self {
            Self::Echo => SubsystemId::new(0x00),
            Self::Authentication => SubsystemId::new(0x01),
            Self::Account => SubsystemId::new(0x02),
        }
    }
}
