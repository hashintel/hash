use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};
use harpc_wire_protocol::request::{procedure::ProcedureDescriptor, service::ServiceDescriptor};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct Descriptor {
    pub(crate) service: ServiceDescriptor,
    pub(crate) procedure: ProcedureDescriptor,
}

impl Default for Descriptor {
    fn default() -> Self {
        Self {
            service: ServiceDescriptor {
                id: ServiceId::new(0x00),
                version: Version { major: 1, minor: 1 },
            },
            procedure: ProcedureDescriptor {
                id: ProcedureId::new(0x00),
            },
        }
    }
}
