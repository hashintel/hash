// From `engine/src/graph/plan/mod.rs:15-31`
use alloc::collections::BTreeMap;
use std::collections::HashSet;

use hash_integrations_definition::{ColumnName, EntitySink, LinkPipeline, UnitMap, UnitMapName};
use serde_json::value::RawValue;
use type_system::{
    knowledge::entity::{id::EntityId, provenance::ProvidedEntityEditionProvenance},
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

use self::request::Delivery;
pub(in crate::graph) use self::request::SavedRequests;
use super::{
    ConversionFailure, EntityUpsert, GraphOperation, LinkEndpoint, LinkUpsert, OperationKind,
    ResolvedProperties, SinkRow,

// From `engine/src/graph/plan/mod.rs:175-208`
    /// The text identifying the record `values` describes as an `entity_type`, or `None` after
    /// reporting that the row has none.
    fn source_id(
        &mut self,
        entity_type: &VersionedUrl,
        row: usize,
        values: SinkRow<'_>,
        column: &ColumnName,
    ) -> Option<String> {
        let source_id = values.text(column);
        if source_id.is_none() {
            self.issues.push(PlanIssue::MissingSourceId {
                entity_type: entity_type.clone(),
                row,
                column: column.clone(),
            });
        }
        source_id
    }

    fn report(
        &mut self,
        entity_type: &VersionedUrl,
        entity_id: EntityId,
        failures: Vec<ConversionFailure>,
    ) {
        self.issues
            .extend(failures.into_iter().map(|failure| PlanIssue::Property {
                entity_type: entity_type.clone(),
                entity_id,
                failure,
            }));
    }
}

// From `engine/src/graph/plan/mod.rs:250-354`
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
            let Some(source_id) = plan.source_id(&sink.entity_type, index, row, &sink.entity_id)
            else {
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
            plan.report(&upsert.entity_type, upsert.entity_id, failures);
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
            let Some(left) = plan.source_id(&link.link_type, index, row, &link.from.column) else {
                continue;
            };
            let Some(right) = plan.source_id(&link.link_type, index, row, &link.to.column) else {
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
            plan.report(&upsert.link_type, upsert.link_id, failures);
            plan.add(GraphOperation::UpsertLink(upsert))?;
        }
        Ok(plan)
    }
}
