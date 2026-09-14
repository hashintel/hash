//! Fixed-size store identities for dataset records and mapped identity tables.
//!
//! These identities have byte alignment and compare and hash by their stored bytes. UUID components
//! retain the byte order of [`uuid::Uuid::as_bytes`], independent of the host's endianness.
//!
//! [`ArchivedEntityId`] combines a web ID and an entity UUID to identify a non-draft entity.
//! [`ArchivedOntologyTypeUuid`] identifies a versioned ontology type by its URL-derived UUID. Both
//! implement [`Key`] for storage in identity tables.

use core::ops::Deref;

use type_system::{
    knowledge::entity::{EntityId, id::EntityUuid},
    ontology::{VersionedUrl, id::OntologyTypeUuid},
    principal::actor_group::WebId,
};

use crate::{
    dataset::{
        auxiliary::{Icon, Legend},
        ontology::OntologyIdentity,
    },
    file::identity::{Key, KeyKind},
};

/// An entity UUID stored as 16 bytes.
///
/// Conversion to and from [`EntityUuid`] preserves all UUID bytes. Ordering is lexicographic in
/// [`uuid::Uuid::as_bytes`] order.
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
pub(crate) struct ArchivedEntityUuid([u8; 16]);

impl ArchivedEntityUuid {
    /// Wraps raw uuid bytes.
    #[cfg(test)] // The serve and delta tests build archived identities from seed bytes.
    pub(crate) const fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(bytes)
    }

    /// Returns the UUID bytes in their stored order.
    pub(crate) const fn to_bytes(self) -> [u8; 16] {
        self.0
    }
}

impl From<EntityUuid> for ArchivedEntityUuid {
    #[inline]
    fn from(id: EntityUuid) -> Self {
        Self(uuid::Uuid::from(id).into_bytes())
    }
}

impl From<ArchivedEntityUuid> for EntityUuid {
    #[inline]
    fn from(id: ArchivedEntityUuid) -> Self {
        Self::new(uuid::Uuid::from_bytes(id.0))
    }
}

impl From<uuid::Uuid> for ArchivedEntityUuid {
    #[inline]
    fn from(id: uuid::Uuid) -> Self {
        Self(id.into_bytes())
    }
}

impl Deref for ArchivedEntityUuid {
    type Target = EntityUuid;

    #[inline]
    fn deref(&self) -> &Self::Target {
        const {
            assert!(size_of::<Self>() == size_of::<EntityUuid>());
            assert!(align_of::<Self>() == align_of::<EntityUuid>());
        }

        let ptr = &raw const *self;
        // SAFETY: `Self` is `repr(transparent)` over `[u8; 16]`, and the target chain
        // `EntityUuid(Uuid)`, `Uuid([u8; 16])`, is `repr(transparent)` at every link.
        unsafe { &*ptr.cast::<EntityUuid>() }
    }
}

/// A web ID stored as 16 UUID bytes.
///
/// Conversion to and from [`WebId`] preserves all UUID bytes. Ordering is lexicographic in
/// [`uuid::Uuid::as_bytes`] order.
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
pub(crate) struct ArchivedWebId([u8; 16]);

impl ArchivedWebId {
    /// Wraps raw uuid bytes.
    #[cfg(test)] // The serve and delta tests build archived identities from seed bytes.
    pub(crate) const fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(bytes)
    }

    /// Returns the UUID bytes in their stored order.
    pub(crate) const fn to_bytes(self) -> [u8; 16] {
        self.0
    }
}

impl From<WebId> for ArchivedWebId {
    #[inline]
    fn from(id: WebId) -> Self {
        Self(uuid::Uuid::from(id).into_bytes())
    }
}

impl From<ArchivedWebId> for WebId {
    #[inline]
    fn from(id: ArchivedWebId) -> Self {
        Self::new(uuid::Uuid::from_bytes(id.0))
    }
}

impl From<uuid::Uuid> for ArchivedWebId {
    #[inline]
    fn from(id: uuid::Uuid) -> Self {
        Self(id.into_bytes())
    }
}

impl Deref for ArchivedWebId {
    type Target = WebId;

    #[inline]
    fn deref(&self) -> &Self::Target {
        const {
            assert!(size_of::<Self>() == size_of::<WebId>());
            assert!(align_of::<Self>() == align_of::<WebId>());
        }

        let ptr = &raw const *self;
        // SAFETY: as for `ArchivedEntityUuid`; the chain here is `WebId(ActorGroupEntityUuid)`,
        // `ActorGroupEntityUuid(EntityUuid)`, `EntityUuid(Uuid)`, `Uuid([u8; 16])`, transparent at
        // every link.
        unsafe { &*ptr.cast::<WebId>() }
    }
}

/// A non-draft entity identity stored as a web ID followed by an entity UUID.
///
/// The representation is 32 bytes with no padding. Ordering compares web ID bytes first, then
/// entity UUID bytes. Serialization uses [`EntityId`]'s `web_id~entity_uuid` string form.
///
/// # Warning
///
/// Conversion from [`EntityId`] discards any draft ID. Conversion back always sets `draft_id` to
/// [`None`]. Only non-draft entity identities round-trip without loss.
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
#[repr(C)]
pub(crate) struct ArchivedEntityId {
    /// The web the entity belongs to.
    pub web_id: ArchivedWebId,
    /// The entity's identity within its web.
    pub entity_uuid: ArchivedEntityUuid,
}

// UUID components are byte arrays with no host-endian integer fields.
crate::dataset::offline::portable::self_archived!(ArchivedEntityId);

impl From<EntityId> for ArchivedEntityId {
    fn from(id: EntityId) -> Self {
        Self {
            web_id: id.web_id.into(),
            entity_uuid: id.entity_uuid.into(),
        }
    }
}

impl From<ArchivedEntityId> for EntityId {
    fn from(id: ArchivedEntityId) -> Self {
        Self {
            web_id: id.web_id.into(),
            entity_uuid: id.entity_uuid.into(),
            draft_id: None,
        }
    }
}

impl Key for ArchivedEntityId {
    type Payload = Legend;

    const KIND: KeyKind = KeyKind::EntityId;
}

/// A versioned ontology type's identity stored as 16 UUID bytes.
///
/// Construct it from a [`uuid::Uuid`] or derive it from a [`VersionedUrl`] with
/// [`from_url`](Self::from_url). The bytes represent the same identity as [`OntologyTypeUuid`].
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct ArchivedOntologyTypeUuid([u8; 16]);

// the UUID is a byte array with no host-endian integer fields.
crate::dataset::offline::portable::self_archived!(ArchivedOntologyTypeUuid);

impl ArchivedOntologyTypeUuid {
    /// Derives a UUID v5 from the versioned type URL.
    ///
    /// The derivation uses the URL namespace and the UTF-8 bytes of `url`'s string form, matching
    /// [`OntologyTypeUuid::from_url`].
    #[inline]
    pub(crate) fn from_url(url: &VersionedUrl) -> Self {
        Self::from(OntologyTypeUuid::from_url(url).into_uuid())
    }

    /// Views archived uuids through the store's uuid type, without copying.
    pub(crate) const fn into_slice(slice: &[Self]) -> &[OntologyTypeUuid] {
        // SAFETY: the inverse of `from_slice`'s cast, sound by the same transparent layout
        // chain down to the shared 16-byte array on both sides.
        unsafe {
            core::slice::from_raw_parts(slice.as_ptr().cast::<OntologyTypeUuid>(), slice.len())
        }
    }
}

impl From<uuid::Uuid> for ArchivedOntologyTypeUuid {
    #[inline]
    fn from(id: uuid::Uuid) -> Self {
        Self(id.into_bytes())
    }
}

impl Key for ArchivedOntologyTypeUuid {
    type Payload = Icon;

    const KIND: KeyKind = KeyKind::OntologyTypeUuid;
}

impl OntologyIdentity for ArchivedOntologyTypeUuid {
    #[inline]
    fn from_versioned_url(url: &VersionedUrl) -> Option<Self> {
        Some(Self::from_url(url))
    }
}

impl Deref for ArchivedOntologyTypeUuid {
    type Target = OntologyTypeUuid;

    #[inline]
    fn deref(&self) -> &Self::Target {
        const {
            assert!(size_of::<Self>() == size_of::<OntologyTypeUuid>());
            assert!(align_of::<Self>() == align_of::<OntologyTypeUuid>());
        }

        let ptr = &raw const *self;
        // SAFETY: as for `ArchivedEntityUuid`; the chain here is `OntologyTypeUuid(Uuid)`,
        // `Uuid([u8; 16])`, transparent at every link.
        unsafe { &*ptr.cast::<OntologyTypeUuid>() }
    }
}
