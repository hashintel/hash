//! Plans the exact requests that write a run's pipeline rows to the Graph.
//!
//! Each row of a sink or link table becomes a [`GraphOperation`], and each operation becomes a
//! [`PlannedWrite`]: the JSON of every request delivery may send for it, encoded once. A retry
//! sends the saved payload again instead of planning again, and planning the same rows twice
//! gives the same payload.
//!
//! Plans from all sinks are combined and [finished](GraphPlan::finish), which rejects two writes
//! to the same entity and sorts the writes into the order the Graph must apply them.

mod request;
#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;
use std::collections::HashSet;

use hash_integrations_definition::{ColumnName, EntitySink, LinkPipeline, UnitMap, UnitMapName};
use serde_json::value::RawValue;
use type_system::{
    knowledge::entity::{id::EntityId, provenance::ProvidedEntityEditionProvenance},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use self::request::Delivery;
use super::{
    ConversionFailure, EntityUpsert, GraphOperation, LinkEndpoint, LinkUpsert, OperationKind,
    ResolvedProperties, SinkRow,
};

/// The requests that write one operation, encoded as delivery sends them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedWrite {
    pub kind: OperationKind,
    pub entity_id: EntityId,
    pub payload: Payload,
}

/// The requests for one write, as the JSON delivery sends: the create, patch and archive requests
/// of an upsert, or the archive request of an archive.
///
/// Only planning creates a payload, so it always holds the JSON a write was planned with.
#[derive(Debug, Clone)]
pub struct Payload(Box<RawValue>);

impl Payload {
    #[must_use]
    pub fn as_str(&self) -> &str {
        self.0.get()
    }
}

impl AsRef<[u8]> for Payload {
    fn as_ref(&self) -> &[u8] {
        self.as_str().as_bytes()
    }
}

impl PartialEq for Payload {
    fn eq(&self, other: &Self) -> bool {
        self.as_str() == other.as_str()
    }
}

impl Eq for Payload {}

impl TryFrom<GraphOperation> for PlannedWrite {
    type Error = UnencodableRequest;

    fn try_from(operation: GraphOperation) -> Result<Self, Self::Error> {
        let kind = operation.kind();
        let delivery = Delivery::from(operation);
        let entity_id = delivery.entity_id();
        let payload = delivery
            .encode()
            .map_err(|source| UnencodableRequest { entity_id, source })?;
        Ok(Self {
            kind,
            entity_id,
            payload,
        })
    }
}

/// Reports an operation whose requests could not be encoded.
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the requests for `{entity_id}` could not be encoded")]
pub struct UnencodableRequest {
    pub entity_id: EntityId,
    source: serde_json::Error,
}

/// Reports two writes to the same entity, which no order of applying them could satisfy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("`{entity_id}` is written more than once")]
pub struct DuplicateWrite {
    pub entity_id: EntityId,
}

/// A row, or part of one, that is not written as planned.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum PlanIssue {
    /// The row is left out, as it has no value to identify what it describes.
    #[display("row {row} has no `{column}` to identify its record")]
    MissingSourceId { row: usize, column: ColumnName },
    /// The entity or link is written without one of its properties.
    #[display("`{entity_id}` is written without a property")]
    Property {
        entity_id: EntityId,
        #[error(source)]
        failure: ConversionFailure,
    },
}

/// The writes planned for a run, and the rows that are not written as planned.
#[derive(Debug, Default)]
pub struct GraphPlan {
    writes: Vec<PlannedWrite>,
    issues: Vec<PlanIssue>,
}

impl GraphPlan {
    /// Plans `operation`.
    ///
    /// # Errors
    ///
    /// Returns [`UnencodableRequest`] if its requests cannot be encoded.
    pub fn add(&mut self, operation: GraphOperation) -> Result<(), UnencodableRequest> {
        self.writes.push(PlannedWrite::try_from(operation)?);
        Ok(())
    }

    /// Sorts the writes into the order the Graph must apply them: by [`OperationKind`], then by
    /// entity ID, so the order does not depend on the order rows were read in.
    ///
    /// # Errors
    ///
    /// Returns [`DuplicateWrite`] if two writes address the same entity.
    pub fn finish(mut self) -> Result<Self, DuplicateWrite> {
        let mut written = HashSet::with_capacity(self.writes.len());
        if let Some(write) = self
            .writes
            .iter()
            .find(|write| !written.insert(write.entity_id))
        {
            return Err(DuplicateWrite {
                entity_id: write.entity_id,
            });
        }
        self.writes.sort_by_key(|write| {
            (
                write.kind,
                Uuid::from(write.entity_id.web_id),
                Uuid::from(write.entity_id.entity_uuid),
            )
        });
        Ok(self)
    }

    #[must_use]
    pub fn writes(&self) -> &[PlannedWrite] {
        &self.writes
    }

    #[must_use]
    pub fn issues(&self) -> &[PlanIssue] {
        &self.issues
    }

    /// The text identifying the record `values` describes, or `None` after reporting that the
    /// row has none.
    fn source_id(
        &mut self,
        row: usize,
        values: SinkRow<'_>,
        column: &ColumnName,
    ) -> Option<String> {
        let source_id = values.text(column);
        if source_id.is_none() {
            self.issues.push(PlanIssue::MissingSourceId {
                row,
                column: column.clone(),
            });
        }
        source_id
    }

    fn report(&mut self, entity_id: EntityId, failures: Vec<ConversionFailure>) {
        self.issues.extend(
            failures
                .into_iter()
                .map(|failure| PlanIssue::Property { entity_id, failure }),
        );
    }
}

/// Combines the plans of several sinks.
impl Extend<Self> for GraphPlan {
    fn extend<I: IntoIterator<Item = Self>>(&mut self, iter: I) {
        for plan in iter {
            self.writes.extend(plan.writes);
            self.issues.extend(plan.issues);
        }
    }
}

impl FromIterator<Self> for GraphPlan {
    fn from_iter<I: IntoIterator<Item = Self>>(iter: I) -> Self {
        let mut plan = Self::default();
        plan.extend(iter);
        plan
    }
}

/// Plans the writes of one run of an integration.
#[derive(Debug, Clone)]
pub struct Planner {
    web_id: WebId,
    namespace: Box<str>,
    provenance: ProvidedEntityEditionProvenance,
    unit_maps: BTreeMap<UnitMapName, UnitMap>,
}

impl Planner {
    /// A planner writing into `web_id`, deriving IDs within `namespace`, and recording
    /// `provenance` on every edition.
    #[must_use]
    pub fn new(
        web_id: WebId,
        namespace: impl Into<Box<str>>,
        provenance: ProvidedEntityEditionProvenance,
        unit_maps: BTreeMap<UnitMapName, UnitMap>,
    ) -> Self {
        Self {
            web_id,
            namespace: namespace.into(),
            provenance,
            unit_maps,
        }
    }

    /// Plans an upsert of the entity each of `rows` describes in `sink`.
    ///
    /// # Errors
    ///
    /// Returns [`UnencodableRequest`] if an upsert's requests cannot be encoded.
    pub fn plan_entities<'row>(
        &self,
        sink: &EntitySink,
        rows: impl IntoIterator<Item = SinkRow<'row>>,
    ) -> Result<GraphPlan, UnencodableRequest> {
        let mut plan = GraphPlan::default();
        for (index, row) in rows.into_iter().enumerate() {
            let Some(source_id) = plan.source_id(index, row, &sink.entity_id) else {
                continue;
            };
            let ResolvedProperties {
                properties,
                failures,
            } = row.resolve(&sink.properties, &self.unit_maps);
            let upsert = EntityUpsert::new(
                self.web_id,
                &self.namespace,
                sink.entity_type.clone(),
                &source_id,
                properties,
                self.provenance.clone(),
            );
            plan.report(upsert.entity_id, failures);
            plan.add(GraphOperation::UpsertEntity(upsert))?;
        }
        Ok(plan)
    }

    /// Plans an upsert of the link each of `rows` describes in `link`.
    ///
    /// # Errors
    ///
    /// Returns [`UnencodableRequest`] if an upsert's requests cannot be encoded.
    pub fn plan_links<'row>(
        &self,
        link: &LinkPipeline,
        rows: impl IntoIterator<Item = SinkRow<'row>>,
    ) -> Result<GraphPlan, UnencodableRequest> {
        let mut plan = GraphPlan::default();
        for (index, row) in rows.into_iter().enumerate() {
            let Some(left) = plan.source_id(index, row, &link.from.column) else {
                continue;
            };
            let Some(right) = plan.source_id(index, row, &link.to.column) else {
                continue;
            };
            let ResolvedProperties {
                properties,
                failures,
            } = row.resolve(&link.properties, &self.unit_maps);
            let upsert = LinkUpsert::new(
                self.web_id,
                &self.namespace,
                link.link_type.clone(),
                LinkEndpoint {
                    entity_type: &link.from.entity_type,
                    source_id: &left,
                },
                LinkEndpoint {
                    entity_type: &link.to.entity_type,
                    source_id: &right,
                },
                // A link without properties keeps the ones it has.
                Some(properties).filter(|properties| !properties.value.is_empty()),
                self.provenance.clone(),
            );
            plan.report(upsert.link_id, failures);
            plan.add(GraphOperation::UpsertLink(upsert))?;
        }
        Ok(plan)
    }
}
