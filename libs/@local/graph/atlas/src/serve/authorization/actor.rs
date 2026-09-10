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

        // SAFETY: `Self` is `repr(transparent)` over `[u8; 16]`, and the target chain
        // `ActorEntityUuid(EntityUuid)`, `EntityUuid(Uuid)`, `Uuid([u8; 16])` is
        // `repr(transparent)` at every link.
        unsafe { &*ptr.cast::<ActorEntityUuid>() }
    }
}

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
    User,
    Machine,
    Ai,
}

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
    pub r#type: ArchivedActorType,
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
