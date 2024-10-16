use alloc::sync::Arc;
use core::error::Error;
#[cfg(feature = "postgres")]
use core::mem;
use std::collections::{HashMap, HashSet};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use error_stack::{Report, bail};
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use thiserror::Error;

use crate::{
    schema::{
        DataType, DataTypeResolveData, DataTypeUuid, EntityType, EntityTypeResolveData,
        EntityTypeToEntityTypeEdge, EntityTypeUuid, PropertyTypeUuid,
    },
    url::VersionedUrl,
};

#[derive(
    Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct InheritanceDepth(u16);

impl InheritanceDepth {
    #[must_use]
    pub const fn new(inner: u16) -> Self {
        Self(inner)
    }

    #[must_use]
    pub const fn inner(self) -> u16 {
        self.0
    }
}

#[cfg(feature = "postgres")]
impl ToSql for InheritanceDepth {
    postgres_types::accepts!(INT4);

    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        i32::from(self.0).to_sql(ty, out)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for InheritanceDepth {
    postgres_types::accepts!(INT4);

    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self::new(i32::from_sql(ty, raw)?.try_into()?))
    }
}

#[derive(Debug, Error)]
pub enum DataTypeResolveError {
    #[error("The data type ID is unknown")]
    UnknownDataTypeId,
    #[error("The data types have unresolved references: {}", serde_json::json!(schemas))]
    MissingSchemas { schemas: HashSet<VersionedUrl> },
    #[error("The closed data type metadata is missing")]
    MissingClosedDataType,
    #[error("Not all schemas are contained in the resolver")]
    MissingDataTypes,
}

#[derive(Debug, Error)]
pub enum EntityTypeResolveError {
    #[error("The entity type ID is unknown")]
    UnknownEntityTypeId,
    #[error("The entity types have unresolved references: {}", serde_json::json!(schemas))]
    MissingSchemas { schemas: HashSet<VersionedUrl> },
    #[error("The closed entity type metadata is missing")]
    MissingClosedEntityType,
    #[error("Not all schemas are contained in the resolver")]
    MissingEntityTypes,
}

#[derive(Debug)]
struct DataTypeCacheEntry {
    data_type: Arc<DataType>,
    resolve_data: Option<Arc<DataTypeResolveData>>,
}

#[derive(Debug)]
struct EntityTypeCacheEntry {
    entity_type: Arc<EntityType>,
    resolve_data: Option<Arc<EntityTypeResolveData>>,
}

#[derive(Debug, Default)]
pub struct OntologyTypeResolver {
    data_types: HashMap<DataTypeUuid, DataTypeCacheEntry>,
    entity_types: HashMap<EntityTypeUuid, EntityTypeCacheEntry>,
}

impl OntologyTypeResolver {
    pub fn add_unresolved_data_type(
        &mut self,
        data_type_id: DataTypeUuid,
        data_type: Arc<DataType>,
    ) {
        debug_assert_eq!(
            data_type_id,
            DataTypeUuid::from_url(&data_type.id),
            "The data type ID must match the URL"
        );
        self.data_types
            .entry(data_type_id)
            .or_insert(DataTypeCacheEntry {
                data_type,
                resolve_data: None,
            });
    }

    pub fn add_closed_data_type(
        &mut self,
        data_type_id: DataTypeUuid,
        data_type: Arc<DataType>,
        metadata: Arc<DataTypeResolveData>,
    ) {
        self.data_types.insert(data_type_id, DataTypeCacheEntry {
            data_type,
            resolve_data: Some(metadata),
        });
    }

    fn close_data_type(
        &mut self,
        data_type_id: DataTypeUuid,
        metadata: Arc<DataTypeResolveData>,
    ) -> Result<(), DataTypeResolveError> {
        let data_type_entry = self
            .data_types
            .get_mut(&data_type_id)
            .ok_or(DataTypeResolveError::UnknownDataTypeId)?;
        data_type_entry.resolve_data = Some(metadata);
        Ok(())
    }

    pub fn add_unresolved_entity_type(
        &mut self,
        entity_type_id: EntityTypeUuid,
        entity_type: Arc<EntityType>,
    ) {
        debug_assert_eq!(
            entity_type_id,
            EntityTypeUuid::from_url(&entity_type.id),
            "The entity type ID must match the URL"
        );
        self.entity_types
            .entry(entity_type_id)
            .or_insert(EntityTypeCacheEntry {
                entity_type,
                resolve_data: None,
            });
    }

    pub fn add_closed_entity_type(
        &mut self,
        entity_type_id: EntityTypeUuid,
        entity_type: Arc<EntityType>,
        metadata: Arc<EntityTypeResolveData>,
    ) {
        self.entity_types
            .insert(entity_type_id, EntityTypeCacheEntry {
                entity_type,
                resolve_data: Some(metadata),
            });
    }

    fn close_entity_type(
        &mut self,
        entity_type_id: EntityTypeUuid,
        metadata: Arc<EntityTypeResolveData>,
    ) -> Result<(), EntityTypeResolveError> {
        let entity_type_entry = self
            .entity_types
            .get_mut(&entity_type_id)
            .ok_or(EntityTypeResolveError::UnknownEntityTypeId)?;
        entity_type_entry.resolve_data = Some(metadata);
        Ok(())
    }

    /// Resolves the metadata for the given data types.
    ///
    /// This method resolves the metadata for the given data types and all their parents. It returns
    /// the resolved metadata for all data types.
    ///
    /// # Errors
    ///
    /// Returns an error if the metadata for any of the data types could not be resolved.
    pub fn resolve_data_type_metadata(
        &mut self,
        data_type_id: DataTypeUuid,
    ) -> Result<Arc<DataTypeResolveData>, Report<DataTypeResolveError>> {
        let Some(data_type_entry) = self.data_types.get(&data_type_id) else {
            bail!(DataTypeResolveError::UnknownDataTypeId);
        };

        let data_type = Arc::clone(&data_type_entry.data_type);

        // We add all requested types to the cache to ensure that we can resolve all types. The
        // cache will be updated with the resolved metadata. We extract the IDs so that we can
        // resolve the metadata in the correct order.
        // Double buffering is used to avoid unnecessary allocations.
        let mut data_types_to_resolve = Vec::new();
        let mut next_data_types_to_resolve = vec![data_type];

        // We keep a list of all schemas that are missing from the cache. If we encounter a schema
        // that is not in the cache, we add it to this list. If we are unable to resolve all
        // schemas, we return an error with this list.
        let mut missing_schemas = HashSet::new();

        // The currently closed schema being resolved. This can be used later to resolve
        let mut in_progress_schema = DataTypeResolveData::default();

        let mut current_depth = 0;
        while !next_data_types_to_resolve.is_empty() {
            mem::swap(&mut data_types_to_resolve, &mut next_data_types_to_resolve);
            #[expect(
                clippy::iter_with_drain,
                reason = "False positive, we re-use the iterator to avoid unnecessary allocations.\
                              See https://github.com/rust-lang/rust-clippy/issues/8539"
            )]
            for data_type in data_types_to_resolve.drain(..) {
                for (data_type_reference, edge) in data_type.data_type_references() {
                    let data_type_reference_id = DataTypeUuid::from_url(&data_type_reference.url);

                    let Some(data_type_entry) = self.data_types.get(&data_type_reference_id) else {
                        // If the data type is not in the cache, we add it to the list of missing
                        // schemas.
                        missing_schemas.insert(data_type_reference.url.clone());
                        continue;
                    };

                    in_progress_schema.add_edge(
                        edge,
                        Arc::clone(&data_type_entry.data_type),
                        data_type_reference_id,
                        current_depth,
                    );

                    if let Some(resolve_data) = &data_type_entry.resolve_data {
                        in_progress_schema.extend_edges(current_depth + 1, resolve_data);
                    } else {
                        next_data_types_to_resolve.push(Arc::clone(&data_type_entry.data_type));
                    }
                }
            }

            current_depth += 1;
        }

        if missing_schemas.is_empty() {
            // We create the resolved metadata for the current data type and update the cache so
            // that we don't need to resolve it again.
            let in_progress_schema = Arc::new(in_progress_schema);
            self.close_data_type(data_type_id, Arc::clone(&in_progress_schema))?;
            Ok(in_progress_schema)
        } else {
            Err(Report::from(DataTypeResolveError::MissingSchemas {
                schemas: missing_schemas,
            }))
        }
    }

    /// Resolves the metadata for the given entity types.
    ///
    /// This method resolves the metadata for the given entity types and all their parents. It
    /// returns the resolved metadata for all entity types.
    ///
    /// # Errors
    ///
    /// Returns an error if the metadata for any of the entity types could not be resolved.
    pub fn resolve_entity_type_metadata(
        &mut self,
        entity_type_id: EntityTypeUuid,
    ) -> Result<Arc<EntityTypeResolveData>, Report<EntityTypeResolveError>> {
        let Some(entity_type_entry) = self.entity_types.get(&entity_type_id) else {
            bail!(EntityTypeResolveError::UnknownEntityTypeId);
        };

        let entity_type = Arc::clone(&entity_type_entry.entity_type);

        let mut entity_types_to_resolve = Vec::new();
        let mut next_entity_types_to_resolve = vec![entity_type];

        let mut missing_schemas = HashSet::new();

        // The currently closed schema being resolved. This can be used later to resolve
        let mut in_progress_schema = EntityTypeResolveData::default();

        let mut current_depth = 0;
        while !next_entity_types_to_resolve.is_empty() {
            mem::swap(
                &mut entity_types_to_resolve,
                &mut next_entity_types_to_resolve,
            );
            #[expect(
                clippy::iter_with_drain,
                reason = "False positive, we re-use the iterator to avoid unnecessary allocations.\
                                  See https://github.com/rust-lang/rust-clippy/issues/8539"
            )]
            for entity_type in entity_types_to_resolve.drain(..) {
                for (entity_type_reference, edge) in entity_type.entity_type_references() {
                    let entity_type_reference_id =
                        EntityTypeUuid::from_url(&entity_type_reference.url);

                    let Some(entity_type_entry) = self.entity_types.get(&entity_type_reference_id)
                    else {
                        missing_schemas.insert(entity_type_reference.url.clone());
                        continue;
                    };

                    in_progress_schema.add_entity_type_edge(
                        edge,
                        Arc::clone(&entity_type_entry.entity_type),
                        entity_type_reference_id,
                        current_depth,
                    );

                    if edge == EntityTypeToEntityTypeEdge::Inheritance {
                        if let Some(resolve_data) = &entity_type_entry.resolve_data {
                            in_progress_schema.extend_edges(current_depth + 1, resolve_data);
                        } else {
                            next_entity_types_to_resolve
                                .push(Arc::clone(&entity_type_entry.entity_type));
                        }
                    }
                }
                for (property_type_reference, edge) in entity_type.property_type_references() {
                    let property_type_reference_id =
                        PropertyTypeUuid::from_url(&property_type_reference.url);

                    in_progress_schema.add_property_type_edge(
                        edge,
                        property_type_reference_id,
                        current_depth,
                    );
                }
            }

            current_depth += 1;
        }

        if missing_schemas.is_empty() {
            // We create the resolved metadata for the current data type and update the cache so
            // that we don't need to resolve it again.
            let in_progress_schema = Arc::new(in_progress_schema);
            self.close_entity_type(entity_type_id, Arc::clone(&in_progress_schema))?;
            Ok(in_progress_schema)
        } else {
            Err(Report::from(EntityTypeResolveError::MissingSchemas {
                schemas: missing_schemas,
            }))
        }
    }
}
