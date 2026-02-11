use alloc::{borrow::Cow, collections::BTreeSet, sync::Arc};
use core::iter;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, TryStreamExt as _};
use hash_graph_authorization::policies::{
    Authorized, MergePolicies, PolicyComponents, Request, RequestContext, ResourceId,
    action::ActionName, principal::actor::AuthenticatedActor,
};
use hash_graph_store::{
    entity::ClosedMultiEntityTypeMap,
    entity_type::{
        ArchiveEntityTypeParams, ClosedDataTypeDefinition, CommonQueryEntityTypesParams,
        CountEntityTypesParams, CreateEntityTypeParams, EntityTypeQueryPath,
        EntityTypeResolveDefinitions, EntityTypeStore, GetClosedMultiEntityTypesResponse,
        HasPermissionForEntityTypesParams, IncludeEntityTypeOption,
        IncludeResolvedEntityTypeOption, QueryEntityTypeSubgraphParams,
        QueryEntityTypeSubgraphResponse, QueryEntityTypesParams, QueryEntityTypesResponse,
        UnarchiveEntityTypeParams, UpdateEntityTypeEmbeddingParams, UpdateEntityTypesParams,
    },
    error::{CheckPermissionError, InsertionError, QueryError, UpdateError},
    filter::{Filter, FilterExpression, FilterExpressionList, ParameterList},
    property_type::{
        PropertyTypeStore as _, QueryPropertyTypeSubgraphParams, QueryPropertyTypesParams,
    },
    query::{Ordering, QueryResult as _, Read, VersionedUrlSorting},
    subgraph::{
        Subgraph, SubgraphRecord as _,
        edges::{
            BorrowedTraversalParams, EdgeDirection, GraphResolveDepths, OntologyEdgeKind,
            SubgraphTraversalParams, TraversalEdge,
        },
        identifier::{EntityTypeVertexId, GraphElementVertexId, PropertyTypeVertexId},
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxes, QueryTemporalAxesUnresolved,
            VariableAxis, VariableTemporalAxisUnresolved,
        },
    },
};
use hash_graph_temporal_versioning::{RightBoundedTemporalInterval, Timestamp, TransactionTime};
use hash_graph_types::{Embedding, ontology::OntologyTypeProvider};
use hash_status::StatusCode;
use postgres_types::{Json, ToSql};
use serde::Deserialize as _;
use serde_json::Value as JsonValue;
use tokio_postgres::{GenericClient as _, Row};
use tracing::{Instrument as _, instrument};
use type_system::{
    Valid, Validator as _,
    ontology::{
        EntityTypeWithMetadata, InheritanceDepth, OntologyTemporalMetadata,
        data_type::{ClosedDataType, DataType, DataTypeUuid},
        entity_type::{
            ClosedEntityType, ClosedMultiEntityType, EntityType, EntityTypeMetadata,
            EntityTypeUuid,
            schema::{
                EntityTypeResolveData, EntityTypeToPropertyTypeEdge, EntityTypeValidator,
                PartialEntityType,
            },
        },
        id::{OntologyTypeRecordId, OntologyTypeUuid, OntologyTypeVersion, VersionedUrl},
        json_schema::OntologyTypeResolver,
        property_type::PropertyTypeUuid,
        provenance::{OntologyEditionProvenance, OntologyOwnership, OntologyProvenance},
    },
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};

use crate::store::{
    error::DeletionError,
    postgres::{
        AsClient, PostgresStore, ResponseCountMap, TraversalContext,
        crud::{QueryIndices, QueryRecordDecode, TypedRow},
        ontology::{PostgresOntologyOwnership, read::OntologyTypeTraversalData},
        query::{
            Distinctness, PostgresRecord, PostgresSorting, ReferenceTable, SelectCompiler, Table,
        },
    },
    validation::StoreProvider,
};

impl<C> PostgresStore<C>
where
    C: AsClient,
{
    #[tracing::instrument(level = "info", skip(entity_types, provider))]
    pub(crate) async fn filter_entity_types_by_permission<I, T>(
        entity_types: impl IntoIterator<Item = (I, T)> + Send,
        provider: &StoreProvider<'_, Self>,
        temporal_axes: QueryTemporalAxes,
    ) -> Result<impl Iterator<Item = T>, Report<QueryError>>
    where
        I: Into<EntityTypeUuid> + Send,
        T: Send,
    {
        let (ids, entity_types): (Vec<_>, Vec<_>) = entity_types
            .into_iter()
            .map(|(id, edge)| (id.into(), edge))
            .unzip();

        let permissions = if let Some(policy_components) = provider.policy_components {
            let mut compiler = SelectCompiler::new(Some(&temporal_axes), true);

            let entity_type_ids_filter = Filter::for_entity_type_uuids(&ids);
            compiler
                .add_filter(&entity_type_ids_filter)
                .change_context(QueryError)?;

            // TODO: Ideally, we'd incorporate the filter in the caller function, but that's not
            //       easily possible as the query there uses features that the query compiler does
            //       not support yet.
            let permission_filter = Filter::<EntityTypeWithMetadata>::for_policies(
                policy_components.extract_filter_policies(ActionName::ViewEntityType),
                policy_components.optimization_data(ActionName::ViewEntityType),
            );
            compiler
                .add_filter(&permission_filter)
                .change_context(QueryError)?;

            let entity_type_uuid_idx =
                compiler.add_selection_path(&EntityTypeQueryPath::OntologyId);

            let (statement, parameters) = compiler.compile();

            Some(
                provider
                    .store
                    .as_client()
                    .query_raw(&statement, parameters.iter().copied())
                    .instrument(tracing::info_span!(
                        "SELECT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres",
                        db.query.text = statement,
                    ))
                    .instrument(tracing::trace_span!("query_permitted_entity_type_uuids"))
                    .await
                    .change_context(QueryError)?
                    .map_ok(|row| row.get::<_, EntityTypeUuid>(entity_type_uuid_idx))
                    .try_collect::<HashSet<_>>()
                    .instrument(tracing::trace_span!("collect_permitted_entity_type_uuids"))
                    .await
                    .change_context(QueryError)?,
            )
        } else {
            None
        };

        Ok(ids
            .into_iter()
            .zip(entity_types)
            .filter_map(move |(id, entity_type)| {
                let Some(permissions) = &permissions else {
                    return Some(entity_type);
                };

                permissions.contains(&id).then_some(entity_type)
            }))
    }

    #[expect(clippy::too_many_lines)]
    #[tracing::instrument(level = "info", skip(self, entity_types))]
    pub(crate) async fn get_entity_type_resolve_definitions(
        &self,
        actor_id: ActorEntityUuid,
        entity_types: &[EntityTypeUuid],
        include_data_type_children: bool,
    ) -> Result<EntityTypeResolveDefinitions, Report<QueryError>> {
        let mut definitions = EntityTypeResolveDefinitions::default();
        let rows = self
            .as_client()
            .query(
                "
                SELECT
                    edge_kind,
                    target_ontology_id,
                    schema
                FROM (
                   	SELECT
                        source_entity_type_ontology_id,
                        'link' AS edge_kind,
                  		NULL::UUID AS target_ontology_id,
                        schema
                   	FROM entity_type_constrains_links_on
                   	JOIN entity_types ON target_entity_type_ontology_id = ontology_id
                UNION
                   	SELECT
                        source_entity_type_ontology_id,
                        'link_destination' AS edge_kind,
                  		NULL::UUID AS target_ontology_id,
                        schema
                   	FROM entity_type_constrains_link_destinations_on
                   	JOIN entity_types ON target_entity_type_ontology_id = ontology_id
                UNION
                   	SELECT
                        source_entity_type_ontology_id,
                        'property' AS edge_kind,
                  		target_property_type_ontology_id AS target_ontology_id,
                        '{}' AS schema
                   	FROM entity_type_constrains_properties_on
                   	JOIN property_types ON target_property_type_ontology_id = ontology_id
                ) AS subquery
                WHERE source_entity_type_ontology_id = ANY($1);
                ",
                &[&entity_types],
            )
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(QueryError)?;

        let mut property_type_uuids = Vec::<PropertyTypeUuid>::new();
        for row in rows {
            let edge_kind: String = row.get(0);
            match edge_kind.as_str() {
                "link" | "link_destination" => {
                    let entity_type: Valid<EntityType> = row.get(2);
                    definitions.entity_types.insert(
                        entity_type.id.clone(),
                        PartialEntityType::from(entity_type.into_inner()),
                    );
                }
                "property" => property_type_uuids.push(row.get(1)),
                _ => unreachable!(),
            }
        }

        let property_types = self
            .query_property_type_subgraph(
                actor_id,
                QueryPropertyTypeSubgraphParams::ResolveDepths {
                    graph_resolve_depths: GraphResolveDepths {
                        constrains_properties_on: u8::MAX,
                        ..GraphResolveDepths::default()
                    },
                    traversal_paths: Vec::new(),
                    request: QueryPropertyTypesParams {
                        filter: Filter::for_property_type_uuids(&property_type_uuids),
                        temporal_axes: QueryTemporalAxesUnresolved::default(),
                        after: None,
                        limit: None,
                        include_count: false,
                    },
                },
            )
            .await?
            .subgraph
            .vertices
            .property_types;

        let mut data_type_uuids = Vec::new();
        for (vertex_id, property_type) in property_types {
            data_type_uuids.extend(
                property_type
                    .schema
                    .data_type_references()
                    .into_iter()
                    .map(|reference| DataTypeUuid::from_url(&reference.url)),
            );
            definitions
                .property_types
                .insert(VersionedUrl::from(vertex_id), property_type.schema);
        }

        let query = if include_data_type_children {
            "
                SELECT schema, closed_schema
                FROM data_types
                WHERE ontology_id = ANY($1)
                    OR ontology_id IN (
                        SELECT source_data_type_ontology_id
                        FROM data_type_inherits_from
                        WHERE target_data_type_ontology_id = ANY($1)
                    );
            "
        } else {
            "
                SELECT schema, closed_schema
                FROM data_types
                WHERE ontology_id = ANY($1);
            "
        };

        definitions.data_types.extend(
            self.as_client()
                .query(query, &[&data_type_uuids])
                .instrument(tracing::info_span!(
                    "SELECT",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres"
                ))
                .await
                .change_context(QueryError)?
                .into_iter()
                .map(|row| {
                    let parents = row
                        .get::<_, Valid<DataType>>(0)
                        .into_inner()
                        .all_of
                        .into_iter()
                        .map(|reference| reference.url)
                        .collect();
                    let schema = row.get::<_, Valid<ClosedDataType>>(1).into_inner();
                    (
                        schema.id.clone(),
                        ClosedDataTypeDefinition { schema, parents },
                    )
                }),
        );

        Ok(definitions)
    }

    #[expect(clippy::too_many_lines)]
    async fn get_per_entity_type_resolve_metadata(
        &self,
        entity_types: &[EntityTypeUuid],
    ) -> Result<
        impl Iterator<Item = Result<(EntityTypeUuid, EntityTypeResolveData), Report<QueryError>>>,
        Report<QueryError>,
    > {
        Ok(self
            .as_client()
            .query(
                "
                    SELECT
                       	source_entity_type_ontology_id,
                       	array_agg(edge_kind),
                       	array_agg(target_ontology_id),
                       	array_agg(depth),
                       	array_agg(schema)
                    FROM (
                       	SELECT
                      		source_entity_type_ontology_id,
                      		'inheritance' AS edge_kind,
                      		target_entity_type_ontology_id AS target_ontology_id,
                      		depth,
                      		schema
                       	FROM entity_type_inherits_from
                       	JOIN entity_types ON target_entity_type_ontology_id = ontology_id
                    UNION
                       	SELECT
                      		source_entity_type_ontology_id,
                      		'link' AS edge_kind,
                      		target_entity_type_ontology_id AS target_ontology_id,
                      		inheritance_depth,
                      		'{}' AS schema
                       	FROM entity_type_constrains_links_on
                       	JOIN entity_types ON target_entity_type_ontology_id = ontology_id
                    UNION
                       	SELECT
                      		source_entity_type_ontology_id,
                      		'link_destination' AS edge_kind,
                      		target_entity_type_ontology_id AS target_ontology_id,
                      		inheritance_depth,
                      		'{}' AS schema
                       	FROM entity_type_constrains_link_destinations_on
                       	JOIN entity_types ON target_entity_type_ontology_id = ontology_id
                    UNION
                       	SELECT
                      		source_entity_type_ontology_id,
                      		'property' AS edge_kind,
                      		target_property_type_ontology_id AS target_ontology_id,
                      		inheritance_depth,
                      		'{}' AS schema
                       	FROM entity_type_constrains_properties_on
                       	JOIN property_types ON target_property_type_ontology_id = ontology_id
                    ) AS subquery
                    WHERE source_entity_type_ontology_id = ANY($1)
                    GROUP BY source_entity_type_ontology_id;
                ",
                &[&entity_types],
            )
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(QueryError)?
            .into_iter()
            .map(|row| {
                let source_id: EntityTypeUuid = row.get(0);
                let edge_kinds: Vec<String> = row.get(1);
                let targets: Vec<OntologyTypeUuid> = row.get(2);
                let depths: Vec<InheritanceDepth> = row.get(3);
                let schemas: Vec<JsonValue> = row.get(4);

                let mut resolve_data = EntityTypeResolveData::default();
                for (((edge_kind, target_id), schema), depth) in
                    edge_kinds.into_iter().zip(targets).zip(schemas).zip(depths)
                {
                    match edge_kind.as_str() {
                        "inheritance" => {
                            resolve_data.add_entity_type_inheritance_edge(
                                Arc::new(
                                    EntityType::deserialize(schema).change_context(QueryError)?,
                                ),
                                target_id.into(),
                                depth.inner(),
                            );
                        }
                        "link" => {
                            resolve_data.add_entity_type_link_edge(target_id.into(), depth.inner());
                        }
                        "link_destination" => {
                            resolve_data.add_entity_type_link_destination_edge(
                                target_id.into(),
                                depth.inner(),
                            );
                        }
                        "property" => {
                            resolve_data.add_property_type_edge(
                                EntityTypeToPropertyTypeEdge::Property,
                                target_id.into(),
                                depth.inner(),
                            );
                        }
                        _ => unreachable!(),
                    }
                }

                Ok((source_id, resolve_data))
            }))
    }

    #[expect(clippy::too_many_lines)]
    async fn query_entity_types_impl(
        &self,
        params: CommonQueryEntityTypesParams<'_>,
        temporal_axes: &QueryTemporalAxes,
        policy_components: &PolicyComponents,
    ) -> Result<QueryEntityTypesResponse, Report<QueryError>> {
        let policy_filter = Filter::<EntityTypeWithMetadata>::for_policies(
            policy_components.extract_filter_policies(ActionName::ViewEntityType),
            policy_components.optimization_data(ActionName::ViewEntityType),
        );

        let mut compiler = SelectCompiler::new(Some(temporal_axes), false);
        compiler
            .add_filter(&policy_filter)
            .change_context(QueryError)?;
        compiler
            .add_filter(&params.filter)
            .change_context(QueryError)?;

        let ontology_id_idx = compiler.add_selection_path(&EntityTypeQueryPath::OntologyId);

        let (count, web_ids, edition_created_by_ids) = if params.include_count
            || params.include_web_ids
            || params.include_edition_created_by_ids
        {
            let web_id_idx = params
                .include_web_ids
                .then(|| compiler.add_selection_path(&EntityTypeQueryPath::WebId));
            let edition_provenance_idx = params.include_edition_created_by_ids.then(|| {
                compiler.add_selection_path(&EntityTypeQueryPath::EditionProvenance(None))
            });

            let (statement, parameters) = compiler.compile();

            let entity_type_rows = self
                .as_client()
                .query(&statement, parameters)
                .instrument(tracing::info_span!(
                    "SELECT",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                    db.query.text = statement,
                ))
                .await
                .change_context(QueryError)?;

            let mut web_ids = params.include_web_ids.then(ResponseCountMap::default);
            let mut edition_created_by_ids = params
                .include_edition_created_by_ids
                .then(ResponseCountMap::default);

            let count = entity_type_rows
                .into_iter()
                .inspect(|row| {
                    if let Some((web_ids, web_id_idx)) = web_ids.as_mut().zip(web_id_idx) {
                        let web_id: WebId = row.get(web_id_idx);
                        web_ids.extend_one(web_id);
                    }

                    if let Some((edition_created_by_ids, edition_provenance_idx)) =
                        edition_created_by_ids.as_mut().zip(edition_provenance_idx)
                    {
                        let provenance: OntologyEditionProvenance = row.get(edition_provenance_idx);
                        edition_created_by_ids.extend_one(provenance.created_by_id);
                    }
                })
                .count();

            (
                params.include_count.then_some(count),
                web_ids.map(HashMap::from),
                edition_created_by_ids.map(HashMap::from),
            )
        } else {
            (None, None, None)
        };

        if let Some(limit) = params.limit {
            compiler.set_limit(limit);
        }

        let sorting = VersionedUrlSorting {
            cursor: params.after,
        };
        let cursor_parameters = PostgresSorting::<EntityTypeWithMetadata>::encode(&sorting)
            .change_context(QueryError)?;
        let cursor_indices = sorting
            .compile(&mut compiler, cursor_parameters.as_ref(), temporal_axes)
            .change_context(QueryError)?;

        let record_indices = EntityTypeWithMetadata::compile(&mut compiler, &());

        let (statement, parameters) = compiler.compile();

        let rows = self
            .as_client()
            .query(&statement, parameters)
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(QueryError)?;
        let indices = QueryIndices::<EntityTypeWithMetadata, VersionedUrlSorting> {
            record_indices,
            cursor_indices,
        };

        // TODO: Remove again when subgraph logic was revisited
        //   see https://linear.app/hash/issue/H-297
        let mut visited_ontology_ids = HashSet::new();
        let (entity_types, cursor) = {
            let _span =
                tracing::trace_span!("process_query_results", row_count = rows.len()).entered();
            let mut cursor = None;
            let num_rows = rows.len();
            let entity_types = rows
                .into_iter()
                .enumerate()
                .filter_map(|(idx, row)| {
                    let id = row.get::<_, EntityTypeUuid>(ontology_id_idx);
                    let typed_row = TypedRow::<EntityTypeWithMetadata, VersionedUrl>::from(row);
                    // The records are already sorted by time, so we can just take the first one
                    if idx == num_rows - 1 && params.limit == Some(num_rows) {
                        cursor = Some(typed_row.decode_cursor(&indices));
                    }
                    visited_ontology_ids
                        .insert(id)
                        .then(|| typed_row.decode_record(&indices))
                })
                .collect::<Vec<_>>();
            (entity_types, cursor)
        };

        Ok(QueryEntityTypesResponse {
            cursor,
            entity_types,
            closed_entity_types: None,
            definitions: None,
            count,
            web_ids,
            edition_created_by_ids,
        })
    }

    pub(crate) async fn query_closed_entity_types(
        &self,
        filter: &Filter<'_, EntityTypeWithMetadata>,
        temporal_axes: QueryTemporalAxesUnresolved,
    ) -> Result<Vec<ClosedEntityType>, Report<QueryError>> {
        let resolved_temporal_axes = temporal_axes.resolve();

        let mut compiler = SelectCompiler::new(Some(&resolved_temporal_axes), false);
        compiler.add_filter(filter).change_context(QueryError)?;
        let closed_schema_idx =
            compiler.add_selection_path(&EntityTypeQueryPath::ClosedSchema(None));
        let (statement, parameters) = compiler.compile();

        let stream = self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(QueryError)?;

        stream
            .map(|row| row.change_context(QueryError))
            .map_ok(|row| {
                row.get::<_, Valid<ClosedEntityType>>(closed_schema_idx)
                    .into_inner()
            })
            .try_collect()
            .await
            .change_context(QueryError)
    }

    /// Internal method to read a [`EntityTypeWithMetadata`] into four [`TraversalContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "info", skip(self, traversal_context, provider, subgraph))]
    #[expect(clippy::too_many_lines)]
    pub(crate) async fn traverse_entity_types<'edges>(
        &self,
        mut entity_type_queue: Vec<(
            EntityTypeUuid,
            BorrowedTraversalParams<'edges>,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext<'edges>,
        provider: &StoreProvider<'_, Self>,
        subgraph: &mut Subgraph,
    ) -> Result<(), Report<QueryError>> {
        let mut property_type_queue = Vec::new();
        let mut edges_to_traverse = HashMap::<OntologyEdgeKind, OntologyTypeTraversalData>::new();

        while !entity_type_queue.is_empty() {
            edges_to_traverse.clear();

            #[expect(clippy::iter_with_drain, reason = "false positive, vector is reused")]
            for (entity_type_ontology_id, subgraph_traversal_params, traversal_interval) in
                entity_type_queue.drain(..)
            {
                match subgraph_traversal_params {
                    BorrowedTraversalParams::ResolveDepths {
                        traversal_path,
                        graph_resolve_depths: depths,
                    } => {
                        for edge_kind in [
                            OntologyEdgeKind::ConstrainsPropertiesOn,
                            OntologyEdgeKind::InheritsFrom,
                            OntologyEdgeKind::ConstrainsLinksOn,
                            OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                        ] {
                            if let Some(new_graph_resolve_depths) =
                                depths.decrement_depth_for_edge_kind(edge_kind)
                            {
                                edges_to_traverse.entry(edge_kind).or_default().push(
                                    OntologyTypeUuid::from(entity_type_ontology_id),
                                    BorrowedTraversalParams::ResolveDepths {
                                        traversal_path,
                                        graph_resolve_depths: new_graph_resolve_depths,
                                    },
                                    traversal_interval,
                                );
                            }
                        }
                    }
                    BorrowedTraversalParams::Path { traversal_path } => {
                        let Some((edge, rest)) = traversal_path.split_first() else {
                            continue;
                        };

                        let edge_kind = match edge {
                            TraversalEdge::InheritsFrom => OntologyEdgeKind::InheritsFrom,
                            TraversalEdge::ConstrainsLinksOn => OntologyEdgeKind::ConstrainsLinksOn,
                            TraversalEdge::ConstrainsLinkDestinationsOn => {
                                OntologyEdgeKind::ConstrainsLinkDestinationsOn
                            }
                            TraversalEdge::ConstrainsPropertiesOn => {
                                OntologyEdgeKind::ConstrainsPropertiesOn
                            }
                            TraversalEdge::ConstrainsValuesOn
                            | TraversalEdge::IsOfType
                            | TraversalEdge::HasLeftEntity { .. }
                            | TraversalEdge::HasRightEntity { .. } => continue,
                        };

                        edges_to_traverse.entry(edge_kind).or_default().push(
                            OntologyTypeUuid::from(entity_type_ontology_id),
                            BorrowedTraversalParams::Path {
                                traversal_path: rest,
                            },
                            traversal_interval,
                        );
                    }
                }
            }

            for (edge_kind, table) in [(
                OntologyEdgeKind::ConstrainsPropertiesOn,
                ReferenceTable::EntityTypeConstrainsPropertiesOn {
                    // TODO: Use the resolve depths passed to the query
                    inheritance_depth: Some(0),
                },
            )] {
                let Some(traversal_data) = edges_to_traverse.remove(&edge_kind) else {
                    continue;
                };

                let traversed_edges = self
                    .read_ontology_edges::<EntityTypeVertexId, PropertyTypeVertexId>(
                        &traversal_data,
                        table,
                    )
                    .await?;

                let filtered_traversed_edges = Self::filter_property_types_by_permission(
                    traversed_edges,
                    provider,
                    subgraph.temporal_axes.resolved.clone(),
                )
                .await?;

                for edge in filtered_traversed_edges {
                    subgraph.insert_edge(
                        &edge.left_endpoint,
                        edge_kind,
                        EdgeDirection::Outgoing,
                        edge.right_endpoint.clone(),
                    );

                    let next_traversal = traversal_context.add_property_type_id(
                        PropertyTypeUuid::from(edge.right_endpoint_ontology_id),
                        edge.traversal_params,
                        edge.traversal_interval,
                    );

                    if let Some((property_type_uuid, traversal_params, interval)) = next_traversal {
                        property_type_queue.push((property_type_uuid, traversal_params, interval));
                    }
                }
            }

            for (edge_kind, table) in [
                (
                    OntologyEdgeKind::InheritsFrom,
                    ReferenceTable::EntityTypeInheritsFrom {
                        // TODO: Use the resolve depths passed to the query
                        inheritance_depth: Some(0),
                    },
                ),
                (
                    OntologyEdgeKind::ConstrainsLinksOn,
                    ReferenceTable::EntityTypeConstrainsLinksOn {
                        // TODO: Use the resolve depths passed to the query
                        inheritance_depth: Some(0),
                    },
                ),
                (
                    OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                    ReferenceTable::EntityTypeConstrainsLinkDestinationsOn {
                        // TODO: Use the resolve depths passed to the query
                        inheritance_depth: Some(0),
                    },
                ),
            ] {
                let Some(traversal_data) = edges_to_traverse.remove(&edge_kind) else {
                    continue;
                };

                let traversed_edges = self
                    .read_ontology_edges::<EntityTypeVertexId, EntityTypeVertexId>(
                        &traversal_data,
                        table,
                    )
                    .await?;

                let filtered_traversed_edges = Self::filter_entity_types_by_permission(
                    traversed_edges,
                    provider,
                    subgraph.temporal_axes.resolved.clone(),
                )
                .await?;

                for edge in filtered_traversed_edges {
                    subgraph.insert_edge(
                        &edge.left_endpoint,
                        edge_kind,
                        EdgeDirection::Outgoing,
                        edge.right_endpoint.clone(),
                    );

                    let next_traversal = traversal_context.add_entity_type_id(
                        EntityTypeUuid::from(edge.right_endpoint_ontology_id),
                        edge.traversal_params,
                        edge.traversal_interval,
                    );
                    if let Some((entity_type_uuid, traversal_params, interval)) = next_traversal {
                        entity_type_queue.push((entity_type_uuid, traversal_params, interval));
                    }
                }
            }
        }

        self.traverse_property_types(property_type_queue, traversal_context, provider, subgraph)
            .await?;

        Ok(())
    }

    /// Deletes all entity types from the database.
    ///
    /// This function removes all entity types along with their associated metadata,
    /// including embeddings, inheritance relationships, and property constraints.
    ///
    /// # Errors
    ///
    /// Returns [`DeletionError`] if the database deletion operation fails or
    /// if the transaction cannot be committed.
    #[tracing::instrument(level = "info", skip(self))]
    pub async fn delete_entity_types(&mut self) -> Result<(), Report<DeletionError>> {
        let transaction = self.transaction().await.change_context(DeletionError)?;

        transaction
            .as_client()
            .simple_query(
                "
                    DELETE FROM entity_type_embeddings;
                    DELETE FROM entity_type_inherits_from;
                    DELETE FROM entity_type_constrains_link_destinations_on;
                    DELETE FROM entity_type_constrains_links_on;
                    DELETE FROM entity_type_constrains_properties_on;
                ",
            )
            .instrument(tracing::info_span!(
                "DELETE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError)?;

        let entity_types = transaction
            .as_client()
            .query(
                "
                    DELETE FROM entity_types
                    RETURNING ontology_id
                ",
                &[],
            )
            .instrument(tracing::info_span!(
                "DELETE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError)?
            .into_iter()
            .filter_map(|row| row.get(0))
            .collect::<Vec<OntologyTypeUuid>>();

        transaction.delete_ontology_ids(&entity_types).await?;

        transaction.commit().await.change_context(DeletionError)?;

        Ok(())
    }
}

impl<C> EntityTypeStore for PostgresStore<C>
where
    C: AsClient,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn create_entity_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreateEntityTypeParams, IntoIter: Send> + Send,
    {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut inserted_entity_type_metadata = Vec::new();
        let mut inserted_entity_types = Vec::new();
        let mut entity_type_reference_ids = Vec::new();

        let mut policy_components_builder = PolicyComponents::builder(&transaction);

        for parameters in params {
            let provenance = OntologyProvenance {
                edition: OntologyEditionProvenance {
                    created_by_id: actor_id,
                    archived_by_id: None,
                    user_defined: parameters.provenance,
                },
            };

            let record_id = OntologyTypeRecordId::from(parameters.schema.id.clone());
            let entity_type_id = EntityTypeUuid::from_url(&parameters.schema.id);

            if let OntologyOwnership::Local { web_id } = &parameters.ownership {
                policy_components_builder.add_entity_type(&parameters.schema.id, Some(*web_id));
            } else {
                policy_components_builder.add_entity_type(&parameters.schema.id, None);
            }

            if let Some((_ontology_id, temporal_versioning)) = transaction
                .create_ontology_metadata(
                    &parameters.schema.id,
                    &parameters.ownership,
                    parameters.conflict_behavior,
                    &provenance,
                )
                .await?
            {
                entity_type_reference_ids.extend(
                    parameters
                        .schema
                        .entity_type_references()
                        .map(|(reference, _)| EntityTypeUuid::from_url(&reference.url)),
                );
                inserted_entity_types.push((entity_type_id, Arc::new(parameters.schema)));
                inserted_entity_type_metadata.push(EntityTypeMetadata {
                    record_id,
                    ownership: parameters.ownership,
                    temporal_versioning,
                    provenance,
                });
            }
        }

        let policy_components = policy_components_builder
            .with_actor(actor_id)
            .with_actions([ActionName::CreateEntityType], MergePolicies::No)
            .await
            .change_context(InsertionError)?;

        let policy_set = policy_components
            .build_policy_set([ActionName::CreateEntityType])
            .change_context(InsertionError)?;

        let mut ontology_type_resolver = OntologyTypeResolver::default();

        for (entity_type_id, inserted_entity_type) in &inserted_entity_types {
            match policy_set
                .evaluate(
                    &Request {
                        actor: policy_components.actor_id(),
                        action: ActionName::CreateEntityType,
                        resource: &ResourceId::EntityType(Cow::Borrowed(
                            (&inserted_entity_type.id).into(),
                        )),
                        context: RequestContext::default(),
                    },
                    policy_components.context(),
                )
                .change_context(InsertionError)?
            {
                Authorized::Always => {}
                Authorized::Never => {
                    return Err(Report::new(InsertionError)
                        .attach_opaque(StatusCode::PermissionDenied)
                        .attach(format!(
                            "The actor does not have permission to create the entity type `{}`",
                            inserted_entity_type.id
                        )));
                }
            }

            ontology_type_resolver
                .add_unresolved_entity_type(*entity_type_id, Arc::clone(inserted_entity_type));
        }

        let required_reference_ids = entity_type_reference_ids.into_iter().collect::<Vec<_>>();

        let mut resolve_data = transaction
            .get_per_entity_type_resolve_metadata(&required_reference_ids)
            .await
            .change_context(InsertionError)
            .attach("Could not read entity type resolve data")?
            .collect::<Result<HashMap<_, _>, _>>()
            .change_context(InsertionError)?;

        transaction
            .query_entity_types(
                actor_id,
                QueryEntityTypesParams {
                    request: CommonQueryEntityTypesParams {
                        filter: Filter::In(
                            FilterExpression::Path {
                                path: EntityTypeQueryPath::OntologyId,
                            },
                            FilterExpressionList::ParameterList {
                                parameters: ParameterList::EntityTypeIds(&required_reference_ids),
                            },
                        ),
                        temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                            pinned: PinnedTemporalAxisUnresolved::new(None),
                            variable: VariableTemporalAxisUnresolved::new(None, None),
                        },
                        after: None,
                        limit: None,
                        include_count: false,
                        include_web_ids: false,
                        include_edition_created_by_ids: false,
                    },
                    include_entity_types: None,
                },
            )
            .await
            .change_context(InsertionError)
            .attach("Could not read parent entity types")?
            .entity_types
            .into_iter()
            .for_each(|entity_type| {
                let entity_type_id = EntityTypeUuid::from_url(&entity_type.schema.id);
                if let Some(resolve_data) = resolve_data.remove(&entity_type_id) {
                    ontology_type_resolver.add_closed_entity_type(
                        entity_type_id,
                        Arc::new(entity_type.schema),
                        Arc::new(resolve_data),
                    );
                } else {
                    ontology_type_resolver
                        .add_unresolved_entity_type(entity_type_id, Arc::new(entity_type.schema));
                }
            });

        let closed_schemas = inserted_entity_types
            .iter()
            .map(|(entity_type_id, entity_type)| {
                let closed_metadata = ontology_type_resolver
                    .resolve_entity_type_metadata(*entity_type_id)
                    .change_context(InsertionError)?;
                let closed_schema =
                    ClosedEntityType::from_resolve_data((**entity_type).clone(), &closed_metadata)
                        .change_context(InsertionError)?;

                Ok((closed_schema, closed_metadata))
            })
            .collect::<Result<Vec<_>, Report<_>>>()?;

        let entity_type_validator = EntityTypeValidator;
        for ((entity_type_id, entity_type), (closed_schema, _resolve_data)) in
            inserted_entity_types.iter().zip(&closed_schemas)
        {
            transaction
                .insert_entity_type_with_id(
                    *entity_type_id,
                    entity_type_validator
                        .validate_ref(&**entity_type)
                        .change_context(InsertionError)?,
                    entity_type_validator
                        .validate_ref(closed_schema)
                        .change_context(InsertionError)?,
                )
                .await?;
        }
        for ((_, closed_metadata), (entity_type_id, _)) in
            closed_schemas.iter().zip(&inserted_entity_types)
        {
            transaction
                .insert_entity_type_references(*entity_type_id, closed_metadata)
                .await?;
        }

        transaction.commit().await.change_context(InsertionError)?;

        if !self.settings.skip_embedding_creation
            && let Some(temporal_client) = &self.temporal_client
        {
            temporal_client
                .start_update_entity_type_embeddings_workflow(
                    actor_id,
                    &inserted_entity_types
                        .iter()
                        .zip(&inserted_entity_type_metadata)
                        .map(|((_, schema), metadata)| EntityTypeWithMetadata {
                            schema: (**schema).clone(),
                            metadata: metadata.clone(),
                        })
                        .collect::<Vec<_>>(),
                )
                .await
                .change_context(InsertionError)?;
        }

        Ok(inserted_entity_type_metadata)
    }

    async fn count_entity_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: CountEntityTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_action(ActionName::ViewEntityType, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        params
            .filter
            .convert_parameters(&StoreProvider::new(self, &policy_components))
            .await
            .change_context(QueryError)?;

        let policy_filter = Filter::<EntityTypeWithMetadata>::for_policies(
            policy_components.extract_filter_policies(ActionName::ViewEntityType),
            policy_components.optimization_data(ActionName::ViewEntityType),
        );

        let temporal_axes = params.temporal_axes.resolve();
        let mut compiler = SelectCompiler::new(Some(&temporal_axes), false);
        compiler
            .add_filter(&policy_filter)
            .change_context(QueryError)?;
        compiler
            .add_filter(&params.filter)
            .change_context(QueryError)?;

        let (statement, parameters) = compiler.compile();

        Ok(self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(QueryError)?
            .count()
            .await)
    }

    async fn query_entity_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryEntityTypesParams<'_>,
    ) -> Result<QueryEntityTypesResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_action(ActionName::ViewEntityType, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        params
            .request
            .filter
            .convert_parameters(&StoreProvider::new(self, &policy_components))
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.request.temporal_axes;
        let resolved_temporal_axes = temporal_axes.resolve();
        let mut response = self
            .query_entity_types_impl(params.request, &resolved_temporal_axes, &policy_components)
            .await?;

        if let Some(include_entity_types) = params.include_entity_types {
            let ids = response
                .entity_types
                .iter()
                .map(|entity_type| EntityTypeUuid::from_url(&entity_type.schema.id))
                .collect::<Vec<_>>();

            response.closed_entity_types = Some(
                self.query_closed_entity_types(&Filter::for_entity_type_uuids(&ids), temporal_axes)
                    .await?,
            );

            match include_entity_types {
                IncludeEntityTypeOption::Closed => {}
                IncludeEntityTypeOption::Resolved => {
                    response.definitions = Some(
                        self.get_entity_type_resolve_definitions(actor_id, &ids, false)
                            .await?,
                    );
                }
                IncludeEntityTypeOption::ResolvedWithDataTypeChildren => {
                    response.definitions = Some(
                        self.get_entity_type_resolve_definitions(actor_id, &ids, true)
                            .await?,
                    );
                }
            }
        }

        Ok(response)
    }

    #[tracing::instrument(
        level = "info",
        skip(self, actor_id, entity_type_ids, temporal_axes, include_resolved)
    )]
    async fn get_closed_multi_entity_types<I, J>(
        &self,
        actor_id: ActorEntityUuid,
        entity_type_ids: I,
        temporal_axes: QueryTemporalAxesUnresolved,
        include_resolved: Option<IncludeResolvedEntityTypeOption>,
    ) -> Result<GetClosedMultiEntityTypesResponse, Report<QueryError>>
    where
        I: IntoIterator<Item = J>,
        J: IntoIterator<Item = VersionedUrl>,
    {
        let mut response = GetClosedMultiEntityTypesResponse {
            entity_types: HashMap::new(),
            definitions: None,
        };

        // Collect all unique entity type IDs that need resolution
        let mut entity_type_ids_to_resolve = HashSet::new();
        let all_multi_entity_type_ids = entity_type_ids
            .into_iter()
            .map(|entity_type_ids| {
                entity_type_ids
                    .into_iter()
                    .inspect(|id| {
                        entity_type_ids_to_resolve.insert(EntityTypeUuid::from_url(id));
                    })
                    .collect::<BTreeSet<_>>()
            })
            .collect::<Vec<_>>();

        // Convert entity type IDs to database-specific UUID references
        let entity_type_uuids = entity_type_ids_to_resolve.into_iter().collect::<Vec<_>>();

        // Fetch all closed entity types in a single database query for efficiency
        let closed_types = self
            .query_closed_entity_types(
                &Filter::for_entity_type_uuids(&entity_type_uuids),
                temporal_axes,
            )
            .await?
            .into_iter()
            .map(|closed_entity_type| (closed_entity_type.id.clone(), closed_entity_type))
            .collect::<HashMap<_, _>>();

        // Build the nested hierarchical structure for each set of entity types
        for entity_multi_type_ids in all_multi_entity_type_ids {
            // Get the first entity type to serve as the root of the hierarchy
            let mut entity_type_id_iter = entity_multi_type_ids.into_iter();
            let Some(first_entity_type_id) = entity_type_id_iter.next() else {
                continue; // Skip empty sets
            };

            // Create or retrieve the entry for the first entity type
            let mut map_ref = response
                .entity_types
                .entry(first_entity_type_id.clone())
                .or_insert_with(|| ClosedMultiEntityTypeMap {
                    schema: ClosedMultiEntityType::from_closed_schema(
                        closed_types
                            .get(&first_entity_type_id)
                            .expect(
                                "The entity type was already resolved, so it should be present in \
                                 the closed types",
                            )
                            .clone(),
                    ),
                    inner: HashMap::new(),
                });

            // Process remaining entity types in the set, creating a nested structure
            for entity_type_id in entity_type_id_iter {
                // For each additional entity type, create a deeper level in the hierarchy
                let new_map = map_ref
                    .inner
                    .entry(entity_type_id.clone())
                    .or_insert_with(|| {
                        let mut closed_parent = map_ref.schema.clone();
                        closed_parent
                            .add_closed_entity_type(
                                closed_types
                                    .get(&entity_type_id)
                                    .expect(
                                        "The entity type was already resolved, so it should be \
                                         present in the closed types",
                                    )
                                    .clone(),
                            )
                            .expect("The entity type was constructed before so it has to be valid");
                        ClosedMultiEntityTypeMap {
                            schema: closed_parent,
                            inner: HashMap::new(),
                        }
                    });
                map_ref = new_map;
            }
        }

        if let Some(include_entity_types) = include_resolved {
            match include_entity_types {
                IncludeResolvedEntityTypeOption::Resolved => {
                    response.definitions = Some(
                        self.get_entity_type_resolve_definitions(
                            actor_id,
                            &entity_type_uuids,
                            false,
                        )
                        .await?,
                    );
                }
                IncludeResolvedEntityTypeOption::ResolvedWithDataTypeChildren => {
                    response.definitions = Some(
                        self.get_entity_type_resolve_definitions(
                            actor_id,
                            &entity_type_uuids,
                            true,
                        )
                        .await?,
                    );
                }
            }
        }

        Ok(response)
    }

    #[tracing::instrument(level = "info", skip(self))]
    #[expect(clippy::too_many_lines)]
    async fn query_entity_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: QueryEntityTypeSubgraphParams<'_>,
    ) -> Result<QueryEntityTypeSubgraphResponse, Report<QueryError>> {
        let actions = params.view_actions();

        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_actions(actions, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        let provider = StoreProvider::new(self, &policy_components);

        let (mut request, traversal_params) = params.into_request();
        request
            .filter
            .convert_parameters(&provider)
            .await
            .change_context(QueryError)?;

        let temporal_axes = request.temporal_axes.resolve();
        let time_axis = temporal_axes.variable_time_axis();

        let mut subgraph = Subgraph::new(request.temporal_axes, temporal_axes.clone());

        let QueryEntityTypesResponse {
            entity_types,
            closed_entity_types: _,
            definitions: _,
            cursor,
            count,
            web_ids,
            edition_created_by_ids,
        } = self
            .query_entity_types_impl(request, &temporal_axes, &policy_components)
            .await?;

        let (entity_type_ids, entity_type_vertex_ids): (Vec<_>, Vec<_>) = entity_types
            .iter()
            .map(|entity_type| {
                (
                    EntityTypeUuid::from_url(&entity_type.schema.id),
                    GraphElementVertexId::from(entity_type.vertex_id(time_axis)),
                )
            })
            .unzip();
        subgraph.roots.extend(entity_type_vertex_ids);
        subgraph.vertices.entity_types = entity_types
            .into_iter()
            .map(|entity_type| (entity_type.vertex_id(time_axis), entity_type))
            .collect();

        let mut traversal_context = TraversalContext::default();

        // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow the
        //       vertices and have to `.collect()` the keys.
        self.traverse_entity_types(
            entity_type_ids
                .into_iter()
                .flat_map(|id| {
                    match &traversal_params {
                        // TODO: The `vec` is not ideal as the flattening intermediate type but this
                        //       branch will be removed anyway after the migration to traversal path
                        //       based traversal is done
                        SubgraphTraversalParams::Paths { traversal_paths } => traversal_paths
                            .iter()
                            .map(|path| {
                                (
                                    id,
                                    BorrowedTraversalParams::Path {
                                        traversal_path: &path.edges,
                                    },
                                    subgraph.temporal_axes.resolved.variable_interval(),
                                )
                            })
                            .collect(),
                        SubgraphTraversalParams::ResolveDepths {
                            traversal_paths,
                            graph_resolve_depths,
                        } => {
                            if traversal_paths.is_empty() {
                                // If no entity traversal paths are specified, still initialize
                                // the traversal queue with ontology resolve depths to enable
                                // traversal of ontology edges (e.g., inheritsFrom,
                                // constrainsPropertiesOn)
                                vec![(
                                    id,
                                    BorrowedTraversalParams::ResolveDepths {
                                        traversal_path: &[],
                                        graph_resolve_depths: *graph_resolve_depths,
                                    },
                                    subgraph.temporal_axes.resolved.variable_interval(),
                                )]
                            } else {
                                traversal_paths
                                    .iter()
                                    .map(|path| {
                                        (
                                            id,
                                            BorrowedTraversalParams::ResolveDepths {
                                                traversal_path: &path.edges,
                                                graph_resolve_depths: *graph_resolve_depths,
                                            },
                                            subgraph.temporal_axes.resolved.variable_interval(),
                                        )
                                    })
                                    .collect()
                            }
                        }
                    }
                })
                .collect(),
            &mut traversal_context,
            &provider,
            &mut subgraph,
        )
        .await?;

        traversal_context
            .read_traversed_vertices(self, &mut subgraph, false, &policy_components)
            .await?;

        Ok(QueryEntityTypeSubgraphResponse {
            subgraph,
            cursor,
            count,
            web_ids,
            edition_created_by_ids,
        })
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn update_entity_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdateEntityTypesParams, IntoIter: Send> + Send,
    {
        let transaction = self.transaction().await.change_context(UpdateError)?;

        let mut updated_entity_type_metadata = Vec::new();
        let mut inserted_entity_types = Vec::new();
        let mut entity_type_reference_ids = Vec::new();

        let mut old_entity_type_ids = Vec::new();

        for parameters in params {
            let provenance = OntologyProvenance {
                edition: OntologyEditionProvenance {
                    created_by_id: actor_id,
                    archived_by_id: None,
                    user_defined: parameters.provenance,
                },
            };

            old_entity_type_ids.push(VersionedUrl {
                base_url: parameters.schema.id.base_url.clone(),
                version: OntologyTypeVersion {
                    major: parameters
                        .schema
                        .id
                        .version
                        .major
                        .checked_sub(1)
                        .ok_or(UpdateError)
                        .attach(
                            "The version of the entity type is already at the lowest possible \
                             value",
                        )?,
                    pre_release: None,
                },
            });

            let record_id = OntologyTypeRecordId::from(parameters.schema.id.clone());
            let entity_type_id = EntityTypeUuid::from_url(&parameters.schema.id);

            let (_ontology_id, web_id, temporal_versioning) = transaction
                .update_owned_ontology_id(&parameters.schema.id, &provenance.edition)
                .await?;

            entity_type_reference_ids.extend(
                parameters
                    .schema
                    .entity_type_references()
                    .map(|(reference, _)| EntityTypeUuid::from_url(&reference.url)),
            );
            inserted_entity_types.push((entity_type_id, Arc::new(parameters.schema)));
            updated_entity_type_metadata.push(EntityTypeMetadata {
                record_id,
                ownership: OntologyOwnership::Local { web_id },
                temporal_versioning,
                provenance,
            });
        }

        let policy_components = PolicyComponents::builder(&transaction)
            .with_actor(actor_id)
            .with_entity_type_ids(&old_entity_type_ids)
            .with_actions([ActionName::UpdateEntityType], MergePolicies::No)
            .await
            .change_context(UpdateError)?;

        let policy_set = policy_components
            .build_policy_set([ActionName::UpdateEntityType])
            .change_context(UpdateError)?;

        for entity_type_id in &old_entity_type_ids {
            match policy_set
                .evaluate(
                    &Request {
                        actor: policy_components.actor_id(),
                        action: ActionName::UpdateEntityType,
                        resource: &ResourceId::EntityType(Cow::Borrowed(entity_type_id.into())),
                        context: RequestContext::default(),
                    },
                    policy_components.context(),
                )
                .change_context(UpdateError)?
            {
                Authorized::Always => {}
                Authorized::Never => {
                    return Err(Report::new(UpdateError)
                        .attach_opaque(StatusCode::PermissionDenied)
                        .attach(format!(
                            "The actor does not have permission to update the entity type \
                             `{entity_type_id}`"
                        )));
                }
            }
        }

        let mut ontology_type_resolver = OntologyTypeResolver::default();

        for (entity_type_id, inserted_entity_type) in &inserted_entity_types {
            ontology_type_resolver
                .add_unresolved_entity_type(*entity_type_id, Arc::clone(inserted_entity_type));
        }

        let required_reference_ids = entity_type_reference_ids.into_iter().collect::<Vec<_>>();

        let mut resolve_data = transaction
            .get_per_entity_type_resolve_metadata(&required_reference_ids)
            .await
            .change_context(UpdateError)
            .attach("Could not read entity type resolve data")?
            .collect::<Result<HashMap<_, _>, _>>()
            .change_context(UpdateError)?;

        transaction
            .query_entity_types(
                actor_id,
                QueryEntityTypesParams {
                    request: CommonQueryEntityTypesParams {
                        filter: Filter::In(
                            FilterExpression::Path {
                                path: EntityTypeQueryPath::OntologyId,
                            },
                            FilterExpressionList::ParameterList {
                                parameters: ParameterList::EntityTypeIds(&required_reference_ids),
                            },
                        ),
                        temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                            pinned: PinnedTemporalAxisUnresolved::new(None),
                            variable: VariableTemporalAxisUnresolved::new(None, None),
                        },
                        after: None,
                        limit: None,
                        include_count: false,
                        include_web_ids: false,
                        include_edition_created_by_ids: false,
                    },
                    include_entity_types: None,
                },
            )
            .await
            .change_context(UpdateError)
            .attach("Could not read parent entity types")?
            .entity_types
            .into_iter()
            .for_each(|entity_type| {
                let entity_type_id = EntityTypeUuid::from_url(&entity_type.schema.id);
                if let Some(resolve_data) = resolve_data.remove(&entity_type_id) {
                    ontology_type_resolver.add_closed_entity_type(
                        entity_type_id,
                        Arc::new(entity_type.schema),
                        Arc::new(resolve_data),
                    );
                } else {
                    ontology_type_resolver
                        .add_unresolved_entity_type(entity_type_id, Arc::new(entity_type.schema));
                }
            });

        let closed_schemas = inserted_entity_types
            .iter()
            .map(|(entity_type_id, entity_type)| {
                let closed_metadata = ontology_type_resolver
                    .resolve_entity_type_metadata(*entity_type_id)
                    .change_context(UpdateError)?;
                let closed_schema =
                    ClosedEntityType::from_resolve_data((**entity_type).clone(), &closed_metadata)
                        .change_context(UpdateError)?;

                Ok((closed_schema, closed_metadata))
            })
            .collect::<Result<Vec<_>, Report<_>>>()?;

        let entity_type_validator = EntityTypeValidator;
        for ((entity_type_id, entity_type), (closed_schema, _resolve_data)) in
            inserted_entity_types.iter().zip(&closed_schemas)
        {
            transaction
                .insert_entity_type_with_id(
                    *entity_type_id,
                    entity_type_validator
                        .validate_ref(&**entity_type)
                        .change_context(UpdateError)?,
                    entity_type_validator
                        .validate_ref(closed_schema)
                        .change_context(UpdateError)?,
                )
                .await
                .change_context(UpdateError)?;
        }
        for ((_, closed_metadata), (entity_type_id, _)) in
            closed_schemas.iter().zip(&inserted_entity_types)
        {
            transaction
                .insert_entity_type_references(*entity_type_id, closed_metadata)
                .await
                .change_context(UpdateError)?;
        }

        transaction.commit().await.change_context(UpdateError)?;

        if !self.settings.skip_embedding_creation
            && let Some(temporal_client) = &self.temporal_client
        {
            temporal_client
                .start_update_entity_type_embeddings_workflow(
                    actor_id,
                    &inserted_entity_types
                        .iter()
                        .zip(&updated_entity_type_metadata)
                        .map(|((_, schema), metadata)| EntityTypeWithMetadata {
                            schema: (**schema).clone(),
                            metadata: metadata.clone(),
                        })
                        .collect::<Vec<_>>(),
                )
                .await
                .change_context(UpdateError)?;
        }

        Ok(updated_entity_type_metadata)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn archive_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: ArchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_entity_type_id(&params.entity_type_id)
            .with_actions([ActionName::ArchiveEntityType], MergePolicies::No)
            .await
            .change_context(UpdateError)?;

        match policy_components
            .build_policy_set([ActionName::ArchiveEntityType])
            .change_context(UpdateError)?
            .evaluate(
                &Request {
                    actor: policy_components.actor_id(),
                    action: ActionName::ArchiveEntityType,
                    resource: &ResourceId::EntityType(Cow::Borrowed(
                        (&*params.entity_type_id).into(),
                    )),
                    context: RequestContext::default(),
                },
                policy_components.context(),
            )
            .change_context(UpdateError)?
        {
            Authorized::Always => {}
            Authorized::Never => {
                return Err(Report::new(UpdateError)
                    .attach_opaque(StatusCode::PermissionDenied)
                    .attach(format!(
                        "The actor does not have permission to archive the entity type `{}`",
                        params.entity_type_id
                    )));
            }
        }

        self.archive_ontology_type(&params.entity_type_id, actor_id)
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn unarchive_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UnarchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_entity_type_id(&params.entity_type_id)
            .with_actions([ActionName::ArchiveEntityType], MergePolicies::No)
            .await
            .change_context(UpdateError)?;

        match policy_components
            .build_policy_set([ActionName::ArchiveEntityType])
            .change_context(UpdateError)?
            .evaluate(
                &Request {
                    actor: policy_components.actor_id(),
                    action: ActionName::ArchiveEntityType,
                    resource: &ResourceId::EntityType(Cow::Borrowed(
                        (&*params.entity_type_id).into(),
                    )),
                    context: RequestContext::default(),
                },
                policy_components.context(),
            )
            .change_context(UpdateError)?
        {
            Authorized::Always => {}
            Authorized::Never => {
                return Err(Report::new(UpdateError)
                    .attach_opaque(StatusCode::PermissionDenied)
                    .attach(format!(
                        "The actor does not have permission to unarchive the entity type `{}`",
                        params.entity_type_id
                    )));
            }
        }

        self.unarchive_ontology_type(
            &params.entity_type_id,
            &OntologyEditionProvenance {
                created_by_id: actor_id,
                archived_by_id: None,
                user_defined: params.provenance,
            },
        )
        .await
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn update_entity_type_embeddings(
        &mut self,
        _: ActorEntityUuid,
        params: UpdateEntityTypeEmbeddingParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        #[derive(Debug, ToSql)]
        #[postgres(name = "entity_type_embeddings")]
        pub struct EntityTypeEmbeddingsRow<'a> {
            ontology_id: OntologyTypeUuid,
            embedding: Embedding<'a>,
            updated_at_transaction_time: Timestamp<TransactionTime>,
        }
        let entity_type_embeddings = vec![EntityTypeEmbeddingsRow {
            ontology_id: OntologyTypeUuid::from(DataTypeUuid::from_url(&params.entity_type_id)),
            embedding: params.embedding,
            updated_at_transaction_time: params.updated_at_transaction_time,
        }];

        // TODO: Add permission to allow updating embeddings
        //   see https://linear.app/hash/issue/H-1870

        self.as_client()
            .query(
                "
                WITH base_urls AS (
                        SELECT base_url, MAX(version) as max_version
                        FROM ontology_ids
                        GROUP BY base_url
                    ),
                    provided_embeddings AS (
                        SELECT embeddings.*, base_url, max_version
                        FROM UNNEST($1::entity_type_embeddings[]) AS embeddings
                        JOIN ontology_ids USING (ontology_id)
                        JOIN base_urls USING (base_url)
                        WHERE version = max_version
                    ),
                    embeddings_to_delete AS (
                        SELECT entity_type_embeddings.ontology_id
                        FROM provided_embeddings
                        JOIN ontology_ids using (base_url)
                        JOIN entity_type_embeddings
                          ON ontology_ids.ontology_id = entity_type_embeddings.ontology_id
                        WHERE version < max_version
                           OR ($2 AND version = max_version
                                  AND entity_type_embeddings.updated_at_transaction_time
                                   <= provided_embeddings.updated_at_transaction_time)
                    ),
                    deleted AS (
                        DELETE FROM entity_type_embeddings
                        WHERE (ontology_id) IN (SELECT ontology_id FROM embeddings_to_delete)
                    )
                INSERT INTO entity_type_embeddings
                SELECT
                    ontology_id,
                    embedding,
                    updated_at_transaction_time
                FROM provided_embeddings
                ON CONFLICT (ontology_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    updated_at_transaction_time = EXCLUDED.updated_at_transaction_time
                WHERE entity_type_embeddings.updated_at_transaction_time
                      <= EXCLUDED.updated_at_transaction_time;
                ",
                &[&entity_type_embeddings, &params.reset],
            )
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(UpdateError)?;

        Ok(())
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn reindex_entity_type_cache(&mut self) -> Result<(), Report<UpdateError>> {
        tracing::info!("Reindexing entity type cache");
        let transaction = self.transaction().await.change_context(UpdateError)?;

        // We remove the data from the reference tables first
        transaction
            .as_client()
            .simple_query(
                "
                    DELETE FROM entity_type_inherits_from;
                    DELETE FROM entity_type_constrains_links_on;
                    DELETE FROM entity_type_constrains_link_destinations_on;
                    DELETE FROM entity_type_constrains_properties_on;
                ",
            )
            .instrument(tracing::info_span!(
                "DELETE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(UpdateError)?;

        let mut ontology_type_resolver = OntologyTypeResolver::default();

        let entity_types = Read::<EntityTypeWithMetadata>::read_vec(&transaction, &[], None, true)
            .await
            .change_context(UpdateError)?
            .into_iter()
            .map(|entity_type| {
                let schema = Arc::new(entity_type.schema);
                let entity_type_id = EntityTypeUuid::from_url(&schema.id);
                ontology_type_resolver
                    .add_unresolved_entity_type(entity_type_id, Arc::clone(&schema));
                (entity_type_id, schema)
            })
            .collect::<Vec<_>>();

        let entity_type_validator = EntityTypeValidator;
        let num_entity_types = entity_types.len();
        for (idx, (entity_type_id, schema)) in entity_types.into_iter().enumerate() {
            tracing::debug!(entity_type_id=%schema.id, "Reindexing schema {}/{}", idx + 1, num_entity_types);
            let schema_metadata = ontology_type_resolver
                .resolve_entity_type_metadata(entity_type_id)
                .change_context(UpdateError)?;

            transaction
                .insert_entity_type_references(entity_type_id, &schema_metadata)
                .await
                .change_context(UpdateError)?;

            let closed_schema = entity_type_validator
                .validate(
                    ClosedEntityType::from_resolve_data((*schema).clone(), &schema_metadata)
                        .change_context(UpdateError)?,
                )
                .change_context(UpdateError)?;

            transaction
                .as_client()
                .query(
                    "
                        UPDATE entity_types
                        SET closed_schema = $2
                        WHERE ontology_id = $1;
                    ",
                    &[&entity_type_id, &closed_schema],
                )
                .instrument(tracing::info_span!(
                    "UPDATE",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres"
                ))
                .await
                .change_context(UpdateError)?;
        }

        transaction.commit().await.change_context(UpdateError)?;

        Ok(())
    }

    #[tracing::instrument(skip(self, params))]
    #[expect(
        clippy::too_many_lines,
        reason = "We currently need to special-case the `Instantiate` permission until it's going \
                  to be removed in https://linear.app/hash/issue/H-4956"
    )]
    async fn has_permission_for_entity_types(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForEntityTypesParams<'_>,
    ) -> Result<HashSet<VersionedUrl>, Report<CheckPermissionError>> {
        if params.action == ActionName::Instantiate {
            // For `Instantiate`, we need to check the base entity type and all its parents
            // to see if the user can instantiate it.
            // TODO: Remove this branch
            //   see https://linear.app/hash/issue/H-4956

            let policy_components = PolicyComponents::builder(self)
                .with_actor(authenticated_actor)
                .with_action(ActionName::Instantiate, MergePolicies::No)
                .with_action(ActionName::ViewEntityType, MergePolicies::Yes)
                .with_entity_type_ids(params.entity_type_ids.iter())
                .await
                .change_context(CheckPermissionError::BuildPolicyContext)?;

            let validator_provider = StoreProvider::new(self, &policy_components);

            let mut entity_type_id_set = HashMap::new();
            for entity_type_id in params.entity_type_ids.iter() {
                entity_type_id_set.insert(
                    entity_type_id.clone(),
                    OntologyTypeProvider::<ClosedEntityType>::provide_type(
                        &validator_provider,
                        entity_type_id,
                    )
                    .await
                    .map(|entity_type| {
                        entity_type
                            .all_of
                            .iter()
                            .map(|metadata| metadata.id.clone())
                            .collect::<HashSet<_>>()
                    })
                    .ok(),
                );
            }

            let policy_set = policy_components
                .build_policy_set([params.action])
                .change_context(CheckPermissionError::BuildPolicySet)?;

            entity_type_id_set
                .into_iter()
                .filter_map(|(base, parents)| {
                    let Some(parents) = parents else {
                        // We could not resolve the entity type, so we cannot check permissions.
                        // This is likely because the entity type does not exist or is not
                        // accessible.
                        return None;
                    };

                    // We need to check the base entity type and all its parents
                    // to see if the user can instantiate it.
                    for entity_type_id in iter::once(&base).chain(&parents) {
                        let allowed = policy_set.evaluate(
                            &Request {
                                actor: policy_components.actor_id(),
                                action: params.action,
                                resource: &ResourceId::EntityType(Cow::Borrowed(
                                    entity_type_id.into(),
                                )),
                                context: RequestContext::default(),
                            },
                            policy_components.context(),
                        );
                        match allowed {
                            Ok(Authorized::Always) => {}
                            Ok(Authorized::Never) => {
                                return None;
                            }
                            Err(err) => {
                                return Some(Err(
                                    err.change_context(CheckPermissionError::EvaluatePolicySet)
                                ));
                            }
                        }
                    }
                    Some(Ok(base))
                })
                .collect()
        } else {
            let temporal_axes = QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(None, None),
            }
            .resolve();
            let mut compiler = SelectCompiler::new(Some(&temporal_axes), true);

            let entity_type_uuids = params
                .entity_type_ids
                .iter()
                .map(EntityTypeUuid::from_url)
                .collect::<Vec<_>>();

            let entity_type_filter = Filter::for_entity_type_uuids(&entity_type_uuids);
            compiler
                .add_filter(&entity_type_filter)
                .change_context(CheckPermissionError::CompileFilter)?;

            let policy_components = PolicyComponents::builder(self)
                .with_actor(authenticated_actor)
                .with_action(params.action, MergePolicies::Yes)
                .await
                .change_context(CheckPermissionError::BuildPolicyContext)?;
            let policy_filter = Filter::<EntityTypeWithMetadata>::for_policies(
                policy_components.extract_filter_policies(params.action),
                policy_components.optimization_data(params.action),
            );
            compiler
                .add_filter(&policy_filter)
                .change_context(CheckPermissionError::CompileFilter)?;

            let versioned_url_idx = compiler.add_selection_path(&EntityTypeQueryPath::VersionedUrl);

            let (statement, parameters) = compiler.compile();
            self.as_client()
                .query_raw(&statement, parameters.iter().copied())
                .instrument(tracing::info_span!(
                    "SELECT",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                    db.query.text = statement,
                ))
                .await
                .change_context(CheckPermissionError::StoreError)?
                .map_ok(|row| row.get(versioned_url_idx))
                .try_collect()
                .await
                .change_context(CheckPermissionError::StoreError)
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub struct EntityTypeRowIndices {
    pub base_url: usize,
    pub version: usize,
    pub transaction_time: usize,

    pub schema: usize,

    pub edition_provenance: usize,
    pub additional_metadata: usize,
}

impl QueryRecordDecode for EntityTypeWithMetadata {
    type Indices = EntityTypeRowIndices;
    type Output = Self;

    fn decode(row: &Row, indices: &Self::Indices) -> Self {
        let record_id = OntologyTypeRecordId {
            base_url: row.get(indices.base_url),
            version: row.get(indices.version),
        };

        if let Ok(distance) = row.try_get::<_, f64>("distance") {
            tracing::trace!(%record_id, %distance, "Entity type embedding was calculated");
        }

        Self {
            schema: row.get::<_, Json<_>>(indices.schema).0,
            metadata: EntityTypeMetadata {
                record_id,
                ownership: row
                    .get::<_, Json<PostgresOntologyOwnership>>(indices.additional_metadata)
                    .0
                    .into(),
                temporal_versioning: OntologyTemporalMetadata {
                    transaction_time: row.get(indices.transaction_time),
                },
                provenance: OntologyProvenance {
                    edition: row.get(indices.edition_provenance),
                },
            },
        }
    }
}

impl PostgresRecord for EntityTypeWithMetadata {
    type CompilationParameters = ();

    fn base_table() -> Table {
        Table::OntologyTemporalMetadata
    }

    fn parameters() -> Self::CompilationParameters {}

    #[instrument(level = "info", skip(compiler, _paths))]
    fn compile<'p, 'q: 'p>(
        compiler: &mut SelectCompiler<'p, 'q, Self>,
        _paths: &Self::CompilationParameters,
    ) -> Self::Indices {
        EntityTypeRowIndices {
            base_url: compiler.add_distinct_selection_with_ordering(
                &EntityTypeQueryPath::BaseUrl,
                Distinctness::Distinct,
                None,
            ),
            version: compiler.add_distinct_selection_with_ordering(
                &EntityTypeQueryPath::Version,
                Distinctness::Distinct,
                None,
            ),
            transaction_time: compiler.add_distinct_selection_with_ordering(
                &EntityTypeQueryPath::TransactionTime,
                Distinctness::Distinct,
                Some((Ordering::Descending, None)),
            ),
            schema: compiler.add_selection_path(&EntityTypeQueryPath::Schema(None)),
            edition_provenance: compiler
                .add_selection_path(&EntityTypeQueryPath::EditionProvenance(None)),
            additional_metadata: compiler
                .add_selection_path(&EntityTypeQueryPath::AdditionalMetadata),
        }
    }
}
