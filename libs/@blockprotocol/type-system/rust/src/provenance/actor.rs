use core::fmt;

use uuid::Uuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
pub enum ActorType {
    Human,
    #[serde(rename = "ai")]
    AI,
    Machine,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct ActorId(
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Brand<string, \"ActorId\">"))] Uuid,
);

impl ActorId {
    #[must_use]
    pub const fn new(actor_id: Uuid) -> Self {
        Self(actor_id)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

impl fmt::Display for ActorId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
    }
}

macro_rules! define_provenance_id {
    ($name:tt) => {
        impl $name {
            #[must_use]
            pub const fn new(actor_id: ActorId) -> Self {
                Self(actor_id)
            }

            #[must_use]
            pub const fn as_actor_id(&self) -> &ActorId {
                &self.0
            }

            #[must_use]
            pub const fn into_actor_id(self) -> ActorId {
                self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(fmt, "{}", &self.0)
            }
        }
    };
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct CreatedById(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorId, \"CreatedById\">")
    )]
    ActorId,
);
define_provenance_id!(CreatedById);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct EditionArchivedById(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorId, \"EditionArchivedById\">")
    )]
    ActorId,
);
define_provenance_id!(EditionArchivedById);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct EditionCreatedById(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorId, \"EditionCreatedById\">")
    )]
    ActorId,
);
define_provenance_id!(EditionCreatedById);
