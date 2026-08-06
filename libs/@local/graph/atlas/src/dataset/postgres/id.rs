use core::ops::Deref;

use type_system::{
    knowledge::entity::id::EntityUuid,
    ontology::{VersionedUrl, id::OntologyTypeUuid},
    principal::actor_group::WebId,
};

use crate::{
    dataset::{
        auxiliary::{Icon, Label},
        ontology::OntologyIdentity,
    },
    file::identity::{Key, KeyKind},
};

/// The byte-level form of an [`EntityUuid`].
///
/// The derived order is uuid-byte order.
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
    pub(crate) const fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(bytes)
    }

    /// Returns the raw uuid bytes.
    pub(crate) const fn to_bytes(self) -> [u8; 16] {
        self.0
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

/// The byte-level form of a [`WebId`].
///
/// The derived order is uuid-byte order.
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
    pub(crate) const fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(bytes)
    }

    /// Returns the raw uuid bytes.
    pub(crate) const fn to_bytes(self) -> [u8; 16] {
        self.0
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

/// The byte-level form of a non-draft entity identity.
///
/// Drafts never enter a dataset's scope, so the identity is the web and entity components alone.
///
/// The derived order is identity-byte order: web id bytes, then entity uuid bytes.
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

impl Key for ArchivedEntityId {
    type Payload = Label;

    const KIND: KeyKind = KeyKind::EntityId;
}

/// The byte-level form of an [`OntologyTypeUuid`].
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

impl ArchivedOntologyTypeUuid {
    /// Derives the identity of the versioned type `url` names.
    ///
    /// Any [`VersionedUrl`] spelling the same versioned type derives the same identity, so
    /// equality on the result is equality of the named type.
    #[inline]
    pub(crate) fn from_url(url: &VersionedUrl) -> Self {
        Self::from(OntologyTypeUuid::from_url(url).into_uuid())
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
