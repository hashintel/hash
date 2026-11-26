use core::str::FromStr as _;

use duckdb::{Row, ToSql, types::ToSqlOutput};
use error_stack::{Report, ResultExt as _};
use serde::{
    Deserialize, Serialize,
    de::value::{Error as ValueError, StrDeserializer},
};
use type_system::{
    knowledge::{entity::id::EntityId, property::PropertyObjectWithMetadata},
    ontology::VersionedUrl,
};
use uuid::Uuid;

use super::SyncTableError;
use crate::RunId;

/// What a row does to its entity, declared in the order Send delivers them. The table stores it
/// as text, such as `create_entity`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Op {
    CreateEntity,
    UpdateEntity,
    CreateLink,
    UpdateLink,
    ArchiveLink,
    ArchiveEntity,
}

impl Op {
    /// The text the table stores.
    const fn as_str(self) -> &'static str {
        match self {
            Self::CreateEntity => "create_entity",
            Self::UpdateEntity => "update_entity",
            Self::CreateLink => "create_link",
            Self::UpdateLink => "update_link",
            Self::ArchiveLink => "archive_link",
            Self::ArchiveEntity => "archive_entity",
        }
    }
}

impl ToSql for Op {
    fn to_sql(&self) -> duckdb::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

/// One entity change of a run, and one row of the table. Ids and types are stored as text, and
/// the properties as JSON text.
///
/// An update with empty `properties` adds no property, and Send removes none. An archive carries
/// empty `properties`.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SyncRow {
    pub run: RunId,
    pub seq: i64,
    pub op: Op,
    pub entity_id: EntityId,
    pub entity_type: VersionedUrl,
    pub left_entity_id: Option<EntityId>,
    pub right_entity_id: Option<EntityId>,
    pub properties: PropertyObjectWithMetadata,
}

impl SyncRow {
    /// The properties as the JSON text the table stores.
    ///
    /// # Errors
    ///
    /// Returns [`SyncTableError::Invalid`] if the properties cannot be written as JSON.
    pub(super) fn properties_text(&self) -> Result<String, Report<SyncTableError>> {
        serde_json::to_string(&self.properties).change_context(SyncTableError::Invalid)
    }

    /// The row of `run` that `row` holds, by the names of the table's columns.
    ///
    /// # Errors
    ///
    /// Returns [`SyncTableError::Invalid`] if a value cannot be read as its field.
    pub(super) fn read(row: &Row<'_>, run: RunId) -> Result<Self, Report<SyncTableError>> {
        let text = |column: &str| -> Result<Option<String>, Report<SyncTableError>> {
            row.get(column)
                .change_context(SyncTableError::Invalid)
                .attach_with(|| format!("the column `{column}` cannot be read"))
        };
        let required = |column: &str| -> Result<String, Report<SyncTableError>> {
            text(column)?.ok_or_else(|| {
                Report::new(SyncTableError::Invalid)
                    .attach(format!("the column `{column}` is empty"))
            })
        };
        let entity = |value: String| parse::<EntityId>(&value);
        let op = required("op")?;
        Ok(Self {
            run,
            seq: row.get("seq").change_context(SyncTableError::Invalid)?,
            op: parse(&op)?,
            entity_id: entity(required("entity_id")?)?,
            entity_type: VersionedUrl::from_str(&required("entity_type")?)
                .change_context(SyncTableError::Invalid)?,
            left_entity_id: text("left_entity_id")?.map(entity).transpose()?,
            right_entity_id: text("right_entity_id")?.map(entity).transpose()?,
            properties: serde_json::from_str(&required("properties")?)
                .change_context(SyncTableError::Invalid)?,
        })
    }
}

/// The order of entities with the same `seq`. [`EntityId`] has no order of its own, so the order
/// is that of its web id, then its entity UUID.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct OrderKey {
    web_id: Uuid,
    entity_uuid: Uuid,
}

pub(crate) fn order_key(id: &EntityId) -> OrderKey {
    OrderKey {
        web_id: id.web_id.into(),
        entity_uuid: id.entity_uuid.into(),
    }
}

/// `text` as a value of `T`, which reads it as a string.
fn parse<'text, T: Deserialize<'text>>(text: &'text str) -> Result<T, Report<SyncTableError>> {
    T::deserialize(StrDeserializer::<ValueError>::new(text)).change_context(SyncTableError::Invalid)
}
