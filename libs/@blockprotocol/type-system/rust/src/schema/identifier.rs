#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;
use uuid::Uuid;

use crate::url::VersionedUrl;

macro_rules! define_id_type {
    ($name:ident) => {
        /// A unique identifier type for the schema generated from a [`VersionedUrl`].
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[cfg_attr(feature = "utoipa", derive(ToSchema))]
        #[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
        #[repr(transparent)]
        pub struct $name(Uuid);

        impl $name {
            /// Creates a new instance of the identifier type from a [`Uuid`].
            #[must_use]
            pub const fn new(uuid: Uuid) -> Self {
                Self(uuid)
            }

            /// Creates a new instance of the identifier type from a [`VersionedUrl`].
            #[must_use]
            pub fn from_url(url: &VersionedUrl) -> Self {
                Self(Uuid::new_v5(
                    &Uuid::NAMESPACE_URL,
                    url.to_string().as_bytes(),
                ))
            }

            /// Returns a reference to the inner [`Uuid`].
            #[must_use]
            pub const fn as_uuid(&self) -> &Uuid {
                &self.0
            }

            /// Returns a copy of the inner [`Uuid`].
            #[must_use]
            pub const fn into_uuid(self) -> Uuid {
                self.0
            }
        }
    };
}

define_id_type!(DataTypeId);
define_id_type!(PropertyTypeId);
define_id_type!(EntityTypeId);
