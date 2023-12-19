use const_fnv1a_hash::fnv1a_hash_str_64;

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ServiceId(u64);

impl ServiceId {
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn derive(value: &str) -> Self {
        Self(fnv1a_hash_str_64(value))
    }
}

pub trait ServiceSpecification: Send + Sync {
    type Procedures;

    const ID: ServiceId;
}
