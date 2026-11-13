//! Plans exact request bodies from one persisted row at a time.

mod request;
#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;

use hash_integrations_definition::{EntitySink, LinkPipeline, UnitMap, UnitMapName};
use type_system::knowledge::entity::{id::EntityId, provenance::ProvidedEntityEditionProvenance};

use self::request::UpsertBodies;
use super::{Archive, ConversionFailure, EntityUpsert, LinkUpsert, ResolvedProperties, SinkRow};

/// The exact bodies of an upsert and the properties omitted during conversion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedUpsert {
    pub create: Box<str>,
    pub patch: Box<str>,
    pub failures: Vec<ConversionFailure>,
}

/// Reports an entity whose request body could not be encoded.
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the requests for `{entity_id}` could not be encoded")]
pub struct UnencodableRequest {
    pub entity_id: EntityId,
    source: serde_json::Error,
}

/// Plans every row using the run's capture-time provenance and unit maps.
#[derive(Debug, Clone)]
pub struct Planner {
    provenance: ProvidedEntityEditionProvenance,
    unit_maps: BTreeMap<UnitMapName, UnitMap>,
}

impl Planner {
    /// Builds a planner with the provenance shared by every body in the run.
    #[must_use]
    pub const fn new(
        provenance: ProvidedEntityEditionProvenance,
        unit_maps: BTreeMap<UnitMapName, UnitMap>,
    ) -> Self {
        Self {
            provenance,
            unit_maps,
        }
    }

    /// Resolves an entity's properties and encodes its create and whole-object patch.
    ///
    /// # Arguments
    ///
    /// * `sink` - The property mapping and entity type of the target.
    /// * `entity_id` - The identity read from the changes checkpoint.
    /// * `row` - The checkpoint's values, indexed by column name.
    ///
    /// # Errors
    ///
    /// Returns [`UnencodableRequest`] if either body cannot be serialized.
    pub fn plan_entity(
        &self,
        sink: &EntitySink,
        entity_id: EntityId,
        row: SinkRow<'_>,
    ) -> Result<PlannedUpsert, UnencodableRequest> {
        let ResolvedProperties {
            properties,
            failures,
        } = row.resolve(&sink.properties, &self.unit_maps);
        let UpsertBodies { create, patch } = request::upsert_entity(EntityUpsert {
            entity_id,
            entity_type: sink.entity_type.clone(),
            properties,
            provenance: self.provenance.clone(),
        })
        .map_err(|source| UnencodableRequest { entity_id, source })?;
        Ok(PlannedUpsert {
            create,
            patch,
            failures,
        })
    }

    /// Resolves a link's properties and encodes bodies using its persisted endpoint identities.
    ///
    /// Empty link properties still replace the whole property object.
    ///
    /// # Arguments
    ///
    /// * `link` - The property mapping and link type of the target.
    /// * `link_id` - The link identity read from the checkpoint.
    /// * `left_entity_id` - The persisted source endpoint identity.
    /// * `right_entity_id` - The persisted target endpoint identity.
    /// * `row` - The checkpoint's values, indexed by column name.
    ///
    /// # Errors
    ///
    /// Returns [`UnencodableRequest`] if either body cannot be serialized.
    pub fn plan_link(
        &self,
        link: &LinkPipeline,
        link_id: EntityId,
        left_entity_id: EntityId,
        right_entity_id: EntityId,
        row: SinkRow<'_>,
    ) -> Result<PlannedUpsert, UnencodableRequest> {
        let ResolvedProperties {
            properties,
            failures,
        } = row.resolve(&link.properties, &self.unit_maps);
        let UpsertBodies { create, patch } = request::upsert_link(LinkUpsert {
            link_id,
            link_type: link.link_type.clone(),
            left_entity_id,
            right_entity_id,
            properties,
            provenance: self.provenance.clone(),
        })
        .map_err(|source| UnencodableRequest {
            entity_id: link_id,
            source,
        })?;
        Ok(PlannedUpsert {
            create,
            patch,
            failures,
        })
    }

    /// Encodes an archive patch for the persisted `entity_id`.
    ///
    /// # Errors
    ///
    /// Returns [`UnencodableRequest`] if the body cannot be serialized.
    pub fn plan_archive(&self, entity_id: EntityId) -> Result<Box<str>, UnencodableRequest> {
        request::archive(Archive {
            entity_id,
            provenance: self.provenance.clone(),
        })
        .map_err(|source| UnencodableRequest { entity_id, source })
    }
}
