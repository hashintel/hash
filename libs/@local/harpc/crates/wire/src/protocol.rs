#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ProtocolVersion(u8);

impl ProtocolVersion {
    pub const V1: Self = Self(1);
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Protocol {
    pub version: ProtocolVersion,
}
