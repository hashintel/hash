//! The actor identity in the authority token's byte layout.
//!
//! [`ActorId`] has no fixed enum representation. [`ArchivedActorId`] supplies a fixed token
//! representation: a validated kind discriminant beside the actor's 16 UUID bytes.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::ops::Deref;

use type_system::principal::actor::{ActorEntityUuid, ActorId, AiId, MachineId, UserId};
use uuid::Uuid;

/// The byte-level form of an [`ActorEntityUuid`].
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
pub(crate) struct ArchivedActorEntityUuid([u8; 16]);

impl From<ActorEntityUuid> for ArchivedActorEntityUuid {
    #[inline]
    fn from(actor: ActorEntityUuid) -> Self {
        Self(Uuid::from(actor).into_bytes())
    }
}

impl Deref for ArchivedActorEntityUuid {
    type Target = ActorEntityUuid;

    #[inline]
    fn deref(&self) -> &Self::Target {
        const {
            assert!(size_of::<Self>() == size_of::<ActorEntityUuid>());
            assert!(align_of::<Self>() == align_of::<ActorEntityUuid>());
        }

        let ptr = &raw const *self;

        // SAFETY: Transparent structs preserve their field's layout. `Self` and the target chain
        // `ActorEntityUuid(EntityUuid)`, `EntityUuid(Uuid)`, `Uuid([u8; 16])` are transparent over
        // the same initialized bytes, and these types admit every 16-byte pattern. The pointer
        // comes from `&self`, remains aligned for the target and retains that shared borrow's
        // lifetime without mutation. Therefore it is sound to borrow these bytes as
        // `ActorEntityUuid`.
        unsafe { &*ptr.cast::<ActorEntityUuid>() }
    }
}

/// The principal kind of an [`ArchivedActorId`].
///
/// Decoding refuses a discriminant outside this enum. Every UUID byte pattern is structurally
/// valid. Authentication establishes integrity separately: changing a kind to another valid
/// discriminant still produces a structurally valid identity.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::TryFromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(u8)]
pub(crate) enum ArchivedActorType {
    /// A human principal, decoding to [`ActorId::User`].
    User,
    /// A machine principal, decoding to [`ActorId::Machine`].
    Machine,
    /// An AI principal, decoding to [`ActorId::Ai`].
    Ai,
}

/// The byte-level form of an [`ActorId`].
///
/// The [`ActorId`] kinds share one UUID domain. The archived form preserves the kind and UUID and
/// reconstructs the variant on conversion. Equality compares both: the same UUID under a different
/// kind is a different principal.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::TryFromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct ArchivedActorId {
    /// Which principal kind [`id`](Self::id) names.
    pub r#type: ArchivedActorType,
    /// The principal's UUID, in the shared actor identity domain.
    pub id: ArchivedActorEntityUuid,
}

impl From<ActorId> for ArchivedActorId {
    fn from(value: ActorId) -> Self {
        match value {
            ActorId::User(uuid) => Self {
                r#type: ArchivedActorType::User,
                id: ArchivedActorEntityUuid::from(ActorEntityUuid::new(uuid)),
            },
            ActorId::Machine(uuid) => Self {
                r#type: ArchivedActorType::Machine,
                id: ArchivedActorEntityUuid::from(ActorEntityUuid::new(uuid)),
            },
            ActorId::Ai(uuid) => Self {
                r#type: ArchivedActorType::Ai,
                id: ArchivedActorEntityUuid::from(ActorEntityUuid::new(uuid)),
            },
        }
    }
}

impl From<ArchivedActorId> for ActorId {
    fn from(value: ArchivedActorId) -> Self {
        match value.r#type {
            ArchivedActorType::User => Self::User(UserId::new(*value.id)),
            ArchivedActorType::Machine => Self::Machine(MachineId::new(*value.id)),
            ArchivedActorType::Ai => Self::Ai(AiId::new(*value.id)),
        }
    }
}
