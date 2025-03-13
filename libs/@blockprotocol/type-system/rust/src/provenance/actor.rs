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

macro_rules! define_provenance_id {
    ($name:tt) => {
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
        #[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
        #[cfg_attr(
            feature = "postgres",
            derive(postgres_types::ToSql, postgres_types::FromSql),
            postgres(transparent)
        )]
        #[repr(transparent)]
        pub struct $name(Uuid);

        impl $name {
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

        impl fmt::Display for $name {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(fmt, "{}", &self.0)
            }
        }
    };
}

define_provenance_id!(CreatedById);
define_provenance_id!(EditionArchivedById);
define_provenance_id!(EditionCreatedById);
