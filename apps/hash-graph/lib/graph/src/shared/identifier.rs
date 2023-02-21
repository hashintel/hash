pub mod account;
pub mod knowledge;
pub mod ontology;
pub mod time;

use std::{
    collections::{HashMap, HashSet},
    hash::BuildHasher,
};

use serde::{Deserialize, Serialize};
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::ToSchema;

use crate::identifier::{
    knowledge::EntityId,
    ontology::OntologyTypeVersion,
    time::{LeftClosedTemporalInterval, Timestamp, VariableAxis},
};

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityVertexId {
    pub base_id: EntityId,
    pub revision_id: Timestamp<VariableAxis>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityIdWithInterval {
    pub entity_id: EntityId,
    pub interval: LeftClosedTemporalInterval<VariableAxis>,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeVertexId {
    pub base_id: BaseUri,
    pub revision_id: OntologyTypeVersion,
}

impl From<VersionedUri> for OntologyTypeVertexId {
    fn from(uri: VersionedUri) -> Self {
        Self {
            base_id: uri.base_uri,
            revision_id: OntologyTypeVersion::new(uri.version),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(untagged)]
pub enum GraphElementVertexId {
    Ontology(OntologyTypeVertexId),
    KnowledgeGraph(EntityVertexId),
}

impl From<OntologyTypeVertexId> for GraphElementVertexId {
    fn from(id: OntologyTypeVertexId) -> Self {
        Self::Ontology(id)
    }
}

impl From<EntityVertexId> for GraphElementVertexId {
    fn from(id: EntityVertexId) -> Self {
        Self::KnowledgeGraph(id)
    }
}

pub trait VertexId {
    type BaseId;
    type RevisionId;

    fn new(base_id: Self::BaseId, revision_id: Self::RevisionId) -> Self;
    fn base_id(&self) -> &Self::BaseId;
    fn revision_id(&self) -> Self::RevisionId;
}

impl VertexId for OntologyTypeVertexId {
    type BaseId = BaseUri;
    type RevisionId = OntologyTypeVersion;

    fn new(base_id: Self::BaseId, revision_id: Self::RevisionId) -> Self {
        Self {
            base_id,
            revision_id,
        }
    }

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RevisionId {
        self.revision_id
    }
}

impl VertexId for EntityVertexId {
    type BaseId = EntityId;
    type RevisionId = Timestamp<VariableAxis>;

    fn new(base_id: Self::BaseId, revision_id: Self::RevisionId) -> Self {
        Self {
            base_id,
            revision_id,
        }
    }

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RevisionId {
        self.revision_id
    }
}

pub trait EdgeEndpoint {
    type BaseId;
    type RightEndpoint;

    fn base_id(&self) -> &Self::BaseId;
    fn revision_id(&self) -> Self::RightEndpoint;
}

impl EdgeEndpoint for OntologyTypeVertexId {
    type BaseId = BaseUri;
    type RightEndpoint = OntologyTypeVersion;

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RightEndpoint {
        self.revision_id
    }
}

impl EdgeEndpoint for EntityIdWithInterval {
    type BaseId = EntityId;
    type RightEndpoint = LeftClosedTemporalInterval<VariableAxis>;

    fn base_id(&self) -> &Self::BaseId {
        &self.entity_id
    }

    fn revision_id(&self) -> Self::RightEndpoint {
        self.interval
    }
}

pub trait EdgeEndpointSet: IntoIterator<Item = Self::EdgeEndpoint> {
    type EdgeEndpoint: EdgeEndpoint;

    fn insert(&mut self, target_id: Self::EdgeEndpoint) -> bool;
}

impl<S: BuildHasher> EdgeEndpointSet for HashSet<OntologyTypeVertexId, S> {
    type EdgeEndpoint = OntologyTypeVertexId;

    fn insert(&mut self, edge_target_id: Self::EdgeEndpoint) -> bool {
        self.insert(edge_target_id)
    }
}

#[derive(Debug, Default)]
pub struct EntityIdWithIntervalSet {
    inner: HashMap<EntityId, HashSet<LeftClosedTemporalInterval<VariableAxis>>>,
}

impl IntoIterator for EntityIdWithIntervalSet {
    type Item = EntityIdWithInterval;

    type IntoIter = impl Iterator<Item = Self::Item>;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.into_iter().flat_map(|(entity_id, intervals)| {
            intervals
                .into_iter()
                .map(move |interval| EntityIdWithInterval {
                    entity_id,
                    interval,
                })
        })
    }
}

impl EdgeEndpointSet for EntityIdWithIntervalSet {
    type EdgeEndpoint = EntityIdWithInterval;

    fn insert(&mut self, edge_target_id: Self::EdgeEndpoint) -> bool {
        // TODO: Merge overlapping intervals
        //   see https://app.asana.com/0/0/1203399924452451/f
        self.inner
            .entry(edge_target_id.entity_id)
            .or_default()
            .insert(edge_target_id.interval)
    }
}
