//! Typed source identifiers of the in-memory dataset.
//!
//! All three id domains are plain little-endian integers under a newtype each, so every domain
//! declares its own [`Key::Payload`] even though all three persist under one [`KeyKind`].

use type_system::ontology::VersionedUrl;
use zerocopy::{LE, U64};

use crate::{
    dataset::{
        auxiliary::{Icon, Legend},
        ontology::OntologyIdentity,
    },
    file::identity::{Key, KeyKind},
};

/// The source identifier of an in-memory node.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialOrd,
    Ord,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct MemoryNodeId(U64<LE>);

impl MemoryNodeId {
    /// Creates the id carrying `id`.
    pub(crate) const fn new(id: u64) -> Self {
        Self(U64::new(id))
    }

    /// Returns the integer value.
    pub(crate) const fn get(self) -> u64 {
        self.0.get()
    }
}

impl Key for MemoryNodeId {
    type Payload = Legend;

    const KIND: KeyKind = KeyKind::U64Le;
}

/// The source identifier of an in-memory edge.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialOrd,
    Ord,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct MemoryEdgeId(U64<LE>);

impl MemoryEdgeId {
    /// Creates the id carrying `id`.
    pub(crate) const fn new(id: u64) -> Self {
        Self(U64::new(id))
    }

    /// Returns the integer value.
    pub(crate) const fn get(self) -> u64 {
        self.0.get()
    }
}

impl Key for MemoryEdgeId {
    type Payload = Legend;

    const KIND: KeyKind = KeyKind::U64Le;
}

/// The source identifier of an in-memory ontology type.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialOrd,
    Ord,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct MemoryOntologyId(U64<LE>);

impl MemoryOntologyId {
    /// Creates the id carrying `id`.
    pub(crate) const fn new(id: u64) -> Self {
        Self(U64::new(id))
    }

    /// Returns the integer value.
    pub(crate) const fn get(self) -> u64 {
        self.0.get()
    }
}

impl Key for MemoryOntologyId {
    type Payload = Icon;

    const KIND: KeyKind = KeyKind::U64Le;
}

impl OntologyIdentity for MemoryOntologyId {
    fn from_versioned_url(url: &VersionedUrl) -> Option<Self> {
        let url = url.base_url.to_url();
        if url.scheme() != "memory" || url.path() != "/" {
            return None;
        }
        url.host_str()?.parse().ok().map(Self::new)
    }
}
