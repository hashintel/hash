use alloc::sync::Arc;

use deltalake_core::{
    arrow::{
        array::{ArrayRef, RecordBatch, StringArray},
        datatypes::{DataType as ArrowType, Field, Schema, SchemaRef},
    },
    kernel::{DataType, StructField},
};
use error_stack::{Report, ResultExt as _};
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::{entity::id::EntityId, property::PropertyObjectWithMetadata},
    ontology::VersionedUrl,
};
use uuid::Uuid;

use super::{RUN, SyncTableError};
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

/// One entity change of a run, and one row of the table. Ids and types are stored as text, and
/// the properties as JSON text.
///
/// An update with empty `properties` adds no property, and Send removes none. An archive carries
/// empty `properties`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct SyncRow {
    #[serde(with = "run_text")]
    pub run: RunId,
    pub seq: i64,
    pub op: Op,
    pub entity_id: EntityId,
    pub entity_type: VersionedUrl,
    pub left_entity_id: Option<EntityId>,
    pub right_entity_id: Option<EntityId>,
    #[serde(with = "json_text")]
    pub properties: PropertyObjectWithMetadata,
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

/// The run as text. `serde_arrow` is not human readable, so a UUID would otherwise be bytes.
mod run_text {
    use serde::{
        Deserialize as _, Deserializer, Serializer,
        de::{
            Error as _,
            value::{Error as ValueError, StrDeserializer},
        },
    };

    use crate::RunId;

    pub(super) fn serialize<S: Serializer>(run: &RunId, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(run)
    }

    pub(super) fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<RunId, D::Error> {
        let text = String::deserialize(deserializer)?;
        RunId::deserialize(StrDeserializer::<ValueError>::new(&text)).map_err(D::Error::custom)
    }
}

/// The properties as JSON text.
mod json_text {
    use serde::{Deserialize as _, Deserializer, Serializer, de::Error as _, ser::Error as _};
    use type_system::knowledge::property::PropertyObjectWithMetadata;

    pub(super) fn serialize<S: Serializer>(
        properties: &PropertyObjectWithMetadata,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&serde_json::to_string(properties).map_err(S::Error::custom)?)
    }

    pub(super) fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<PropertyObjectWithMetadata, D::Error> {
        serde_json::from_str(&String::deserialize(deserializer)?).map_err(D::Error::custom)
    }
}

/// The columns of the table, in the order of the fields of [`SyncRow`]. The table's format is
/// stored, so it is written out here and not derived from the type.
pub(super) fn columns() -> [StructField; 8] {
    [
        StructField::new(RUN, DataType::STRING, false),
        StructField::new("seq", DataType::LONG, false),
        StructField::new("op", DataType::STRING, false),
        StructField::new("entity_id", DataType::STRING, false),
        StructField::new("entity_type", DataType::STRING, false),
        StructField::new("left_entity_id", DataType::STRING, true),
        StructField::new("right_entity_id", DataType::STRING, true),
        StructField::new("properties", DataType::STRING, false),
    ]
}

/// The rows as a batch with `schema`, the schema of the table.
///
/// # Errors
///
/// Returns [`SyncTableError::Invalid`] if a row cannot be written with `schema`.
pub(super) fn to_batch(
    rows: &[SyncRow],
    schema: &SchemaRef,
) -> Result<RecordBatch, Report<SyncTableError>> {
    serde_arrow::to_record_batch(schema.fields(), &rows).change_context(SyncTableError::Invalid)
}

/// The rows of `run` in `batch`, a batch read from one of its data files.
///
/// A data file has no `run` column, because the run is its partition, so the column is added
/// before the rows are read.
///
/// # Errors
///
/// Returns [`SyncTableError::Invalid`] if a row cannot be read.
pub(super) fn from_batch(
    run: RunId,
    batch: &RecordBatch,
) -> Result<Vec<SyncRow>, Report<SyncTableError>> {
    let runs: ArrayRef = Arc::new(StringArray::from(vec![run.to_string(); batch.num_rows()]));
    let fields = core::iter::once(Arc::new(Field::new(RUN, ArrowType::Utf8, false)))
        .chain(batch.schema().fields().iter().cloned())
        .collect::<Vec<_>>();
    let columns = core::iter::once(runs)
        .chain(batch.columns().iter().cloned())
        .collect();
    let batch = RecordBatch::try_new(Arc::new(Schema::new(fields)), columns)
        .change_context(SyncTableError::Invalid)?;
    serde_arrow::from_record_batch(&batch).change_context(SyncTableError::Invalid)
}
