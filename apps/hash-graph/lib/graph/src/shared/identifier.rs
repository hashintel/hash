pub mod account;
pub mod knowledge;
pub mod ontology;
pub mod time;

use std::{
    collections::{BTreeSet, HashMap, HashSet},
    hash::BuildHasher,
};

use serde::Serialize;
use utoipa::ToSchema;

use crate::{
    identifier::{
        knowledge::EntityId,
        time::{LeftClosedTemporalInterval, VariableAxis},
    },
    subgraph::identifier::{
        EdgeEndpoint, EntityIdWithInterval, EntityVertexId, OntologyTypeVertexId,
    },
};

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

pub trait EdgeEndpointSet: IntoIterator<Item = Self::EdgeEndpoint> {
    type EdgeEndpoint: EdgeEndpoint;

    fn insert(&mut self, target_id: Self::EdgeEndpoint);
}

impl<S: BuildHasher> EdgeEndpointSet for HashSet<OntologyTypeVertexId, S> {
    type EdgeEndpoint = OntologyTypeVertexId;

    fn insert(&mut self, edge_target_id: Self::EdgeEndpoint) {
        self.insert(edge_target_id);
    }
}

#[derive(Debug, Default)]
pub struct EntityIdWithIntervalSet {
    inner: HashMap<EntityId, BTreeSet<LeftClosedTemporalInterval<VariableAxis>>>,
}

impl IntoIterator for EntityIdWithIntervalSet {
    type Item = EntityIdWithInterval;

    type IntoIter = impl Iterator<Item = Self::Item>;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.into_iter().flat_map(|(entity_id, intervals)| {
            // This merges overlapping intervals
            //  Examples   |       1       |       2       |       3
            //  ===========|===============|===============|===============
            //  Interval A | [--]          | (--]          | [--]
            //  Interval B |      [-]      |      [-)      |      [-)
            //  Interval C |  [--]         |  [--]         |  [---]
            //  Interval D |           [-] |           [-] |        [----]
            //  -----------|---------------|---------------|---------------
            //  Union      | [------]  [-] | (------)  [-] | [-----------]

            // TODO: This is a very primitive implementation. Instead of iterating over all elements
            //       and merging them, we should use a data structure that allows for efficient
            //       merging of intervals. This is probably a tree structure that allows for
            //       efficient merging of overlapping intervals.
            //   See https://en.wikipedia.org/wiki/Interval_tree
            //    or https://en.wikipedia.org/wiki/Segment_tree
            //       For simplicity, we stick with this fairly robust implementation for now, but
            //       as a short-term optimization, we could utilize `#![feature(generators)]` to
            //       avoid the allocation of the intermediate vector.
            intervals
                .into_iter()
                .fold(
                    Vec::<LeftClosedTemporalInterval<VariableAxis>>::new(),
                    |mut acc, interval| {
                        // The intervals are sorted, it's only necessary to check the union of this
                        // with the last interval, if it overlaps two of the previous ones (which
                        // would make it necessary to check the union with more than just the last)
                        // then those would have been merged into one in the previous iteration
                        // (again because they are sorted).
                        if let Some(last) = acc.pop() {
                            // `union` either returns one or two intervals, depending on whether
                            // they overlap or not. If two intervals are returned, the ordering is
                            // stable, so we can just push them in order.
                            acc.extend(last.union(interval));
                        } else {
                            acc.push(interval);
                        }
                        acc
                    },
                )
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

    fn insert(&mut self, edge_target_id: Self::EdgeEndpoint) {
        self.inner
            .entry(edge_target_id.entity_id)
            .or_default()
            .insert(edge_target_id.interval);
    }
}
