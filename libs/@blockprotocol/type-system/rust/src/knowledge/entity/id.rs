use core::{fmt, str::FromStr as _};

#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql};
use serde::{
    de::{self, Deserialize, Deserializer},
    ser::{Serialize, Serializer},
};
#[cfg(feature = "utoipa")]
use utoipa::{ToSchema, openapi};
use uuid::Uuid;

use crate::principal::actor_group::WebId;

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    derive_more::Display,
)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[repr(transparent)]
pub struct EntityUuid(#[serde(with = "hash_codec::serde::valid_uuid")] Uuid);

impl EntityUuid {
    #[must_use]
    pub fn new(uuid: impl Into<Uuid>) -> Self {
        Self(uuid.into())
    }
}

impl From<EntityUuid> for Uuid {
    fn from(value: EntityUuid) -> Self {
        value.0
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    derive_more::Display,
)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[repr(transparent)]
pub struct DraftId(#[serde(with = "hash_codec::serde::valid_uuid")] Uuid);

impl DraftId {
    #[must_use]
    pub fn new(uuid: impl Into<Uuid>) -> Self {
        Self(uuid.into())
    }
}

impl From<DraftId> for Uuid {
    fn from(value: DraftId) -> Self {
        value.0
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub struct EntityId {
    pub web_id: WebId,
    pub entity_uuid: EntityUuid,
    pub draft_id: Option<DraftId>,
}

pub const ENTITY_ID_DELIMITER: char = '~';

impl fmt::Display for EntityId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(draft_id) = self.draft_id {
            write!(
                fmt,
                "{}{}{}{}{}",
                self.web_id, ENTITY_ID_DELIMITER, self.entity_uuid, ENTITY_ID_DELIMITER, draft_id,
            )
        } else {
            write!(
                fmt,
                "{}{}{}",
                self.web_id, ENTITY_ID_DELIMITER, self.entity_uuid
            )
        }
    }
}

impl Serialize for EntityId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for EntityId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let entity_id = String::deserialize(deserializer)?;
        let (web_id, tail) = entity_id.split_once(ENTITY_ID_DELIMITER).ok_or_else(|| {
            de::Error::custom(format!(
                "failed to find `{ENTITY_ID_DELIMITER}` delimited string",
            ))
        })?;
        let (entity_uuid, draft_id) = tail
            .split_once(ENTITY_ID_DELIMITER)
            .map_or((tail, None), |(entity_uuid, draft_id)| {
                (entity_uuid, Some(draft_id))
            });

        Ok(Self {
            web_id: WebId::new(Uuid::from_str(web_id).map_err(de::Error::custom)?),
            entity_uuid: EntityUuid::new(Uuid::from_str(entity_uuid).map_err(de::Error::custom)?),
            draft_id: draft_id
                .map(|draft_id| {
                    Ok(DraftId::new(
                        Uuid::from_str(draft_id).map_err(de::Error::custom)?,
                    ))
                })
                .transpose()?,
        })
    }
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for EntityId {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "EntityId",
            openapi::Schema::Object(openapi::schema::Object::with_type(
                openapi::SchemaType::String,
            ))
            .into(),
        )
    }
}

#[cfg(target_arch = "wasm32")]
#[expect(dead_code, reason = "Used in the generated TypeScript types")]
mod patch {
    #[derive(tsify::Tsify)]
    pub struct EntityId(#[tsify(type = "Brand<string, \"EntityId\">")] String);
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[repr(transparent)]
pub struct EntityEditionId(#[serde(with = "hash_codec::serde::valid_uuid")] Uuid);

impl EntityEditionId {
    #[must_use]
    pub const fn new(id: Uuid) -> Self {
        Self(id)
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

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityRecordId {
    pub entity_id: EntityId,
    pub edition_id: EntityEditionId,
}
