//! Partial entity representation for row hydration.
//!
//! When the bridge receives a row from PostgreSQL, each column corresponds to a leaf
//! [`EntityPath`] in the provides set. The columns are flat, one per requested storage
//! location, but the interpreter expects a nested [`Value`] tree with intermediate structs,
//! opaque wrappers, and correct `Option` representation.
//!
//! This module provides [`Hydrated`], a three-state enum that tracks whether a field was
//! requested by the query and, if so, whether the database returned a value or `NULL`.
//! The [`Required`] and [`Optional`] aliases restrict the state space based on the schema:
//! non-nullable fields cannot be [`Null`](Hydrated::Null), enforced at the type level via
//! the uninhabited type [`!`].
//!
//! The `Partial*` structs mirror the entity type hierarchy. Each leaf field holds a
//! [`Hydrated`] wrapping a [`Value`]; intermediate structs group fields by their position
//! in the type tree. Conversion from [`PartialEntity`] to [`Value`] is a separate step
//! that walks the partial tree, wraps intermediate levels in their opaque constructors,
//! and collapses `Option` boundaries.
//!
//! [`EntityPath`]: hashql_mir::pass::execution::traversal::EntityPath
//! [`Value`]: hashql_mir::interpret::value::Value

use core::alloc::Allocator;

use hashql_core::r#type::{TypeId, environment::Environment};
use hashql_mir::{
    interpret::value::{Int, Num, Value},
    pass::execution::traversal::EntityPath,
};
use tokio_postgres::Row;

use super::{Indexed, error::BridgeError, postgres_serde::Deserializer};
use crate::{bridge::postgres_serde::ValueRef, postgres::ColumnDescriptor};

/// Per-field hydration state for partial entity assembly.
///
/// Each field in the partial entity representation has one of three states:
///
/// - **Skipped**: the query's provides set did not include this field. The field will be omitted
///   from the assembled [`Value`] struct entirely.
/// - **Null**: the query requested this field, but the database returned `NULL`. This only occurs
///   for schema-optional fields (e.g. `link_data` on non-link entities, where a `LEFT JOIN`
///   produces all `NULL`s). The type parameter `A` controls whether this variant is constructible.
/// - **Value**: the query requested this field and data was returned.
///
/// Use the [`Required`] and [`Optional`] aliases rather than specifying `A` directly.
///
/// [`Value`]: hashql_mir::interpret::value::Value
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Hydrated<T, A = !> {
    /// Not in the provides set. The query did not request this field.
    Skipped,
    /// Requested, but the database returned `NULL`.
    ///
    /// Only constructible when `A = ()` ([`Optional`] fields). For [`Required`]
    /// fields (`A = !`), this variant is uninhabited.
    Null(A),
    /// Requested and present.
    Value(T),
}

impl<T, A> Default for Hydrated<T, A> {
    fn default() -> Self {
        Self::Skipped
    }
}

impl<T> Hydrated<T, !> {
    /// Sets this required field to [`Value`](Self::Value).
    ///
    /// # Panics (debug only)
    ///
    /// Debug-panics if the field is already populated.
    pub fn set(&mut self, value: T) {
        debug_assert!(
            matches!(self, Self::Skipped),
            "field already populated: duplicate column in row hydration"
        );

        *self = Self::Value(value);
    }
}

impl<T> Hydrated<T, ()> {
    /// Sets this optional field from a nullable column value.
    ///
    /// [`Some`] produces [`Value`](Self::Value), [`None`] produces
    /// [`Null`](Self::Null).
    ///
    /// # Panics (debug only)
    ///
    /// Debug-panics if the field is already populated.
    pub fn set(&mut self, value: Option<T>) {
        debug_assert!(
            matches!(self, Self::Skipped),
            "field already populated: duplicate column in row hydration"
        );

        match value {
            Some(value) => *self = Self::Value(value),
            None => *self = Self::Null(()),
        }
    }

    pub fn null(&mut self) {
        debug_assert!(
            matches!(self, Self::Skipped),
            "field already populated: duplicate column in row hydration"
        );

        *self = Self::Null(());
    }
}

impl<T: Default, A> Hydrated<T, A> {
    /// Ensures this field contains a value, initializing it with [`Default::default`]
    /// if it was [`Skipped`](Self::Skipped) or [`Null`](Self::Null).
    ///
    /// Returns a mutable reference to the inner value for further drilling.
    ///
    /// This is the primary mechanism for populating nested partial structs
    /// from flat column values: each intermediate level is initialized on
    /// first access, then the caller continues into the next level.
    pub fn ensure(&mut self) -> &mut T {
        if !matches!(self, Self::Value(_)) {
            *self = Self::Value(T::default());
        }

        match self {
            Self::Value(value) => value,
            _ => unreachable!(),
        }
    }
}

/// Hydration state for a non-nullable schema field.
///
/// The [`Null`](Hydrated::Null) variant is uninhabited: a required field is either
/// [`Skipped`](Hydrated::Skipped) or has a [`Value`](Hydrated::Value).
pub type Required<T> = Hydrated<T, !>;

/// Hydration state for a nullable schema field.
///
/// All three states are inhabited: [`Skipped`](Hydrated::Skipped),
/// [`Null`](Hydrated::Null), or [`Value`](Hydrated::Value).
/// [`Null`](Hydrated::Null) represents a schema-level absence (e.g. `link_data`
/// on a non-link entity), not a missing column.
pub type Optional<T> = Hydrated<T, ()>;

/// Partial representation of `EntityEncodings`.
pub struct PartialEncodings<'heap, A: Allocator> {
    pub vectors: Required<Value<'heap, A>>,
}

impl<A: Allocator> Default for PartialEncodings<'_, A> {
    fn default() -> Self {
        Self {
            vectors: Required::Skipped,
        }
    }
}

/// Partial identity of a linked entity (left or right target of a link).
///
/// Unlike [`PartialEntityId`], this only has `web_id` and `entity_uuid`:
/// link targets are not addressable by `draft_id` through
/// [`EntityPath`](hashql_mir::pass::execution::traversal::EntityPath).
pub struct PartialLinkEntityId<'heap, A: Allocator> {
    pub web_id: Required<Value<'heap, A>>,
    pub entity_uuid: Required<Value<'heap, A>>,
}

impl<A: Allocator> Default for PartialLinkEntityId<'_, A> {
    fn default() -> Self {
        Self {
            web_id: Required::Skipped,
            entity_uuid: Required::Skipped,
        }
    }
}

/// Partial representation of `EntityProvenance`.
pub struct PartialProvenance<'heap, A: Allocator> {
    pub inferred: Required<Value<'heap, A>>,
    pub edition: Required<Value<'heap, A>>,
}

impl<A: Allocator> Default for PartialProvenance<'_, A> {
    fn default() -> Self {
        Self {
            inferred: Required::Skipped,
            edition: Required::Skipped,
        }
    }
}

/// Partial representation of `TemporalMetadata`.
pub struct PartialTemporalVersioning<'heap, A: Allocator> {
    pub decision_time: Required<Value<'heap, A>>,
    pub transaction_time: Required<Value<'heap, A>>,
}

impl<A: Allocator> Default for PartialTemporalVersioning<'_, A> {
    fn default() -> Self {
        Self {
            decision_time: Required::Skipped,
            transaction_time: Required::Skipped,
        }
    }
}

/// Partial representation of `EntityId` (the entity's own identity).
///
/// Schema field `draft_id` is `Option<DraftId>`, the others are required.
///
/// This is distinct from [`PartialLinkEntityId`], which represents the
/// identity of a *linked* entity and does not include `draft_id`.
pub struct PartialEntityId<'heap, A: Allocator> {
    pub web_id: Required<Value<'heap, A>>,
    pub entity_uuid: Required<Value<'heap, A>>,
    pub draft_id: Optional<Value<'heap, A>>,
}

impl<A: Allocator> Default for PartialEntityId<'_, A> {
    fn default() -> Self {
        Self {
            web_id: Required::Skipped,
            entity_uuid: Required::Skipped,
            draft_id: Optional::Skipped,
        }
    }
}

/// Partial representation of `RecordId`.
///
/// Contains `entity_id` (composite of web, uuid, draft) and `edition_id`.
pub struct PartialRecordId<'heap, A: Allocator> {
    pub entity_id: Required<PartialEntityId<'heap, A>>,
    pub edition_id: Required<Value<'heap, A>>,
}

impl<A: Allocator> Default for PartialRecordId<'_, A> {
    fn default() -> Self {
        Self {
            entity_id: Required::Skipped,
            edition_id: Required::Skipped,
        }
    }
}

/// Partial representation of `LinkData`.
///
/// Schema fields `left_entity_confidence` and `right_entity_confidence` are
/// `Option<Confidence>`, all others are required.
///
/// The entity ID fields use [`PartialLinkEntityId`] (web + uuid only),
/// not [`PartialEntityId`] (which includes `draft_id`).
pub struct PartialLinkData<'heap, A: Allocator> {
    pub left_entity_id: Required<PartialLinkEntityId<'heap, A>>,
    pub right_entity_id: Required<PartialLinkEntityId<'heap, A>>,
    pub left_entity_confidence: Optional<Value<'heap, A>>,
    pub left_entity_provenance: Required<Value<'heap, A>>,
    pub right_entity_confidence: Optional<Value<'heap, A>>,
    pub right_entity_provenance: Required<Value<'heap, A>>,
}

impl<A: Allocator> Default for PartialLinkData<'_, A> {
    fn default() -> Self {
        Self {
            left_entity_id: Required::Skipped,
            right_entity_id: Required::Skipped,
            left_entity_confidence: Optional::Skipped,
            left_entity_provenance: Required::Skipped,
            right_entity_confidence: Optional::Skipped,
            right_entity_provenance: Required::Skipped,
        }
    }
}

/// Partial representation of `EntityMetadata`.
///
/// Schema field `confidence` is `Option<Confidence>`, all others are required.
/// The `property_metadata` field corresponds to the `properties` field in the
/// schema type ([`EntityPath::PropertyMetadata`]), renamed here to avoid
/// confusion with the entity's top-level `properties`.
///
/// [`EntityPath::PropertyMetadata`]: hashql_mir::pass::execution::traversal::EntityPath::PropertyMetadata
pub struct PartialMetadata<'heap, A: Allocator> {
    pub record_id: Required<PartialRecordId<'heap, A>>,
    pub temporal_versioning: Required<PartialTemporalVersioning<'heap, A>>,
    pub entity_type_ids: Required<Value<'heap, A>>,
    pub archived: Required<Value<'heap, A>>,
    pub provenance: Required<PartialProvenance<'heap, A>>,
    pub confidence: Optional<Value<'heap, A>>,
    pub property_metadata: Required<Value<'heap, A>>,
}

impl<A: Allocator> Default for PartialMetadata<'_, A> {
    fn default() -> Self {
        Self {
            record_id: Required::Skipped,
            temporal_versioning: Required::Skipped,
            entity_type_ids: Required::Skipped,
            archived: Required::Skipped,
            provenance: Required::Skipped,
            confidence: Optional::Skipped,
            property_metadata: Required::Skipped,
        }
    }
}

/// Partial representation of `Entity<T>`.
///
/// Mirrors the top-level entity struct with four fields:
/// - `properties`: the generic `T` parameter, always a leaf [`Value`]
/// - `metadata`: [`EntityMetadata`], a deep nested struct
/// - `link_data`: `Option<LinkData>`, nullable at the schema level
/// - `encodings`: [`EntityEncodings`], currently just `vectors`
///
/// [`EntityMetadata`]: hashql_core::module::std_lib::graph::types::knowledge::entity::types::entity_metadata
/// [`EntityEncodings`]: hashql_core::module::std_lib::graph::types::knowledge::entity::types::entity_encodings
pub struct PartialEntity<'heap, A: Allocator> {
    pub properties: Required<Value<'heap, A>>,
    pub metadata: Required<PartialMetadata<'heap, A>>,
    pub link_data: Optional<PartialLinkData<'heap, A>>,
    pub encodings: Required<PartialEncodings<'heap, A>>,
}

impl<'heap, A: Allocator> PartialEntity<'heap, A> {
    fn populate_postgres(
        &mut self,
        env: &Environment<'heap>,
        deserializer: &Deserializer<'_, 'heap, A>,
        path: EntityPath,
        r#type: TypeId,
        column: Indexed<ColumnDescriptor>,
        row: &Row,
    ) -> Result<(), BridgeError>
    where
        A: Clone,
    {
        let row_hydration_error = |source| BridgeError::RowHydration { column, source };

        match path {
            EntityPath::Properties => {
                let value: serde_json::Value =
                    row.try_get(column.index).map_err(row_hydration_error)?;
                let value = deserializer.try_deserialize(r#type, (&value).into(), column)?;
                self.properties.set(value);
            }
            EntityPath::Vectors => unreachable!(
                "entity vectors should never reach postgres compilation; the placement pass \
                 should have rejected this"
            ),
            EntityPath::RecordId => {
                let value: serde_json::Value =
                    row.try_get(column.index).map_err(row_hydration_error)?;

                let entity_id = &value["entity_id"];
                let edition_id = &value["edition_id"];

                self.hydrate_entity_id(env, deserializer, column, entity_id)?;
                self.hydrate_edition_id(env, deserializer, column, edition_id)?;
            }
            EntityPath::EntityId => {
                let value: serde_json::Value =
                    row.try_get(column.index).map_err(row_hydration_error)?;

                self.hydrate_entity_id(env, deserializer, column, &value)?;
            }
            EntityPath::WebId => {
                let value: String = row.try_get(column.index).map_err(row_hydration_error)?;
                self.hydrate_web_id(env, deserializer, column, ValueRef::String(&value))?;
            }
            EntityPath::EntityUuid => {
                let value: String = row.try_get(column.index).map_err(row_hydration_error)?;
                self.hydrate_entity_uuid(env, deserializer, column, ValueRef::String(&value))?;
            }
            EntityPath::DraftId => {
                let value: Option<String> =
                    row.try_get(column.index).map_err(row_hydration_error)?;
                self.hydrate_draft_id(
                    env,
                    deserializer,
                    column,
                    value.as_deref().map(ValueRef::String),
                )?;
            }
            EntityPath::EditionId => {
                let value: String = row.try_get(column.index).map_err(row_hydration_error)?;
                self.hydrate_edition_id(env, deserializer, column, ValueRef::String(&value))?;
            }
            EntityPath::TemporalVersioning => {
                let value: serde_json::Value =
                    row.try_get(column.index).map_err(row_hydration_error)?;
                let transaction_time = &value["transaction_time"];
                let decision_time = &value["decision_time"];

                self.hydrate_decision_time(env, deserializer, column, decision_time)?;
                self.hydrate_transaction_time(env, deserializer, column, transaction_time)?;
            }
            EntityPath::DecisionTime => {
                let value: serde_json::Value =
                    row.try_get(column.index).map_err(row_hydration_error)?;
                self.hydrate_decision_time(env, deserializer, column, &value)?;
            }
            EntityPath::TransactionTime => {
                let value: serde_json::Value =
                    row.try_get(column.index).map_err(row_hydration_error)?;
                self.hydrate_transaction_time(env, deserializer, column, &value)?;
            }
            EntityPath::EntityTypeIds => {
                let value: serde_json::Value =
                    row.try_get(column.index).map_err(row_hydration_error)?;
                let value = deserializer.try_deserialize(r#type, (&value).into(), column)?;

                self.metadata.ensure().entity_type_ids.set(value);
            }
            EntityPath::Archived => {
                let value: bool = row.try_get(column.index).map_err(row_hydration_error)?;

                self.metadata
                    .ensure()
                    .archived
                    .set(Value::Integer(Int::from(value)));
            }
            EntityPath::Confidence => {
                let value: Option<f64> = row.try_get(column.index).map_err(row_hydration_error)?;

                self.metadata
                    .ensure()
                    .confidence
                    .set(value.map(Num::from).map(Value::Number));
            }
            EntityPath::ProvenanceInferred => {
                let value: serde_json::Value =
                    row.try_get(column.index).map_err(row_hydration_error)?;
                let value = deserializer.try_deserialize(r#type, (&value).into(), column)?;

                self.metadata
                    .ensure()
                    .provenance
                    .ensure()
                    .inferred
                    .set(value);
            }
            EntityPath::ProvenanceEdition => {
                let value: serde_json::Value =
                    row.try_get(column.index).map_err(row_hydration_error)?;
                let value = deserializer.try_deserialize(r#type, (&value).into(), column)?;

                self.metadata
                    .ensure()
                    .provenance
                    .ensure()
                    .edition
                    .set(value);
            }
            EntityPath::PropertyMetadata => {
                let value: serde_json::Value =
                    row.try_get(column.index).map_err(row_hydration_error)?;
                let value = deserializer.try_deserialize(r#type, (&value).into(), column)?;

                self.metadata.ensure().property_metadata.set(value);
            }
            EntityPath::LeftEntityWebId => {
                let value: Option<String> =
                    row.try_get(column.index).map_err(row_hydration_error)?;

                let Some(value) = value else {
                    self.link_data.null();
                    return Ok(());
                };

                let value =
                    deserializer.try_deserialize(r#type, ValueRef::String(&value), column)?;

                self.link_data
                    .ensure()
                    .left_entity_id
                    .ensure()
                    .web_id
                    .set(value);
            }
            EntityPath::LeftEntityUuid => {
                let value: Option<String> =
                    row.try_get(column.index).map_err(row_hydration_error)?;

                let Some(value) = value else {
                    self.link_data.null();
                    return Ok(());
                };

                let value =
                    deserializer.try_deserialize(r#type, ValueRef::String(&value), column)?;

                self.link_data
                    .ensure()
                    .left_entity_id
                    .ensure()
                    .entity_uuid
                    .set(value);
            }
            EntityPath::RightEntityWebId => {
                let value: Option<String> =
                    row.try_get(column.index).map_err(row_hydration_error)?;

                let Some(value) = value else {
                    self.link_data.null();
                    return Ok(());
                };

                let value =
                    deserializer.try_deserialize(r#type, ValueRef::String(&value), column)?;

                self.link_data
                    .ensure()
                    .right_entity_id
                    .ensure()
                    .web_id
                    .set(value);
            }
            EntityPath::RightEntityUuid => {
                let value: Option<String> =
                    row.try_get(column.index).map_err(row_hydration_error)?;

                let Some(value) = value else {
                    self.link_data.null();
                    return Ok(());
                };

                let value =
                    deserializer.try_deserialize(r#type, ValueRef::String(&value), column)?;

                self.link_data
                    .ensure()
                    .right_entity_id
                    .ensure()
                    .entity_uuid
                    .set(value);
            }
            EntityPath::LeftEntityConfidence => {
                let value: Option<f64> = row.try_get(column.index).map_err(row_hydration_error)?;

                self.link_data
                    .ensure()
                    .left_entity_confidence
                    .set(value.map(Num::from).map(Value::Number));
            }
            EntityPath::RightEntityConfidence => {
                let value: Option<f64> = row.try_get(column.index).map_err(row_hydration_error)?;

                self.link_data
                    .ensure()
                    .right_entity_confidence
                    .set(value.map(Num::from).map(Value::Number));
            }
            EntityPath::LeftEntityProvenance => {
                let value: Option<String> =
                    row.try_get(column.index).map_err(row_hydration_error)?;

                let Some(value) = value else {
                    self.link_data.null();
                    return Ok(());
                };

                let value =
                    deserializer.try_deserialize(r#type, ValueRef::String(&value), column)?;

                self.link_data.ensure().left_entity_provenance.set(value);
            }
            EntityPath::RightEntityProvenance => {
                let value: Option<String> =
                    row.try_get(column.index).map_err(row_hydration_error)?;

                let Some(value) = value else {
                    self.link_data.null();
                    return Ok(());
                };

                let value =
                    deserializer.try_deserialize(r#type, ValueRef::String(&value), column)?;

                self.link_data.ensure().right_entity_provenance.set(value);
            }
        }

        Ok(())
    }

    fn hydrate_entity_id(
        &mut self,
        env: &Environment<'heap>,
        deserializer: &Deserializer<'_, 'heap, A>,
        column: Indexed<ColumnDescriptor>,
        value: &serde_json::Value,
    ) -> Result<(), BridgeError>
    where
        A: Clone,
    {
        let web_id = &value["web_id"];
        let entity_uuid = &value["entity_uuid"];

        self.hydrate_web_id(env, deserializer, column, web_id)?;
        self.hydrate_entity_uuid(env, deserializer, column, entity_uuid)?;
        self.hydrate_draft_id(env, deserializer, column, value.get("draft_id"))?;

        Ok(())
    }

    fn hydrate_decision_time<'value>(
        &mut self,
        env: &Environment<'heap>,
        deserializer: &Deserializer<'_, 'heap, A>,
        column: Indexed<ColumnDescriptor>,
        value: impl Into<ValueRef<'value>>,
    ) -> Result<(), BridgeError>
    where
        A: Clone,
    {
        let value = deserializer.try_deserialize(
            EntityPath::DecisionTime.r#type(env),
            value.into(),
            column,
        )?;
        self.metadata
            .ensure()
            .temporal_versioning
            .ensure()
            .decision_time
            .set(value);

        Ok(())
    }

    fn hydrate_transaction_time<'value>(
        &mut self,
        env: &Environment<'heap>,
        deserializer: &Deserializer<'_, 'heap, A>,
        column: Indexed<ColumnDescriptor>,
        value: impl Into<ValueRef<'value>>,
    ) -> Result<(), BridgeError>
    where
        A: Clone,
    {
        let value = deserializer.try_deserialize(
            EntityPath::TransactionTime.r#type(env),
            value.into(),
            column,
        )?;
        self.metadata
            .ensure()
            .temporal_versioning
            .ensure()
            .transaction_time
            .set(value);

        Ok(())
    }

    fn hydrate_web_id<'value>(
        &mut self,
        env: &Environment<'heap>,
        deserializer: &Deserializer<'_, 'heap, A>,
        column: Indexed<ColumnDescriptor>,
        value: impl Into<ValueRef<'value>>,
    ) -> Result<(), BridgeError>
    where
        A: Clone,
    {
        let value =
            deserializer.try_deserialize(EntityPath::WebId.r#type(env), value.into(), column)?;

        self.metadata
            .ensure()
            .record_id
            .ensure()
            .entity_id
            .ensure()
            .web_id
            .set(value);

        Ok(())
    }

    fn hydrate_entity_uuid<'value>(
        &mut self,
        env: &Environment<'heap>,
        deserializer: &Deserializer<'_, 'heap, A>,
        column: Indexed<ColumnDescriptor>,
        value: impl Into<ValueRef<'value>>,
    ) -> Result<(), BridgeError>
    where
        A: Clone,
    {
        let value = deserializer.try_deserialize(
            EntityPath::EntityUuid.r#type(env),
            value.into(),
            column,
        )?;

        self.metadata
            .ensure()
            .record_id
            .ensure()
            .entity_id
            .ensure()
            .entity_uuid
            .set(value);

        Ok(())
    }

    fn hydrate_draft_id<'value>(
        &mut self,
        env: &Environment<'heap>,
        deserializer: &Deserializer<'_, 'heap, A>,
        column: Indexed<ColumnDescriptor>,
        value: Option<impl Into<ValueRef<'value>>>,
    ) -> Result<(), BridgeError>
    where
        A: Clone,
    {
        let value = value
            .map(Into::into)
            .filter(|value| !matches!(value, ValueRef::Null))
            .map(|value| {
                deserializer.try_deserialize(EntityPath::DraftId.r#type(env), value, column)
            })
            .transpose()?;

        self.metadata
            .ensure()
            .record_id
            .ensure()
            .entity_id
            .ensure()
            .draft_id
            .set(value);
        Ok(())
    }

    fn hydrate_edition_id<'value>(
        &mut self,
        env: &Environment<'heap>,
        deserializer: &Deserializer<'_, 'heap, A>,
        column: Indexed<ColumnDescriptor>,
        value: impl Into<ValueRef<'value>>,
    ) -> Result<(), BridgeError>
    where
        A: Clone,
    {
        let value = deserializer.try_deserialize(
            EntityPath::EditionId.r#type(env),
            value.into(),
            column,
        )?;

        self.metadata
            .ensure()
            .record_id
            .ensure()
            .edition_id
            .set(value);
        Ok(())
    }
}

impl<A: Allocator> Default for PartialEntity<'_, A> {
    fn default() -> Self {
        Self {
            properties: Required::Skipped,
            metadata: Required::Skipped,
            link_data: Optional::Skipped,
            encodings: Required::Skipped,
        }
    }
}
