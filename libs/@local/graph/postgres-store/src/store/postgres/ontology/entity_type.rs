use alloc::{borrow::Cow, collections::BTreeSet, sync::Arc};
use core::iter;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, TryStreamExt as _};
use hash_graph_authorization::{
    AuthorizationApi,
    backend::ModifyRelationshipOperation,
    policies::{
        Authorized, PartialResourceId, PolicyComponents, Request, RequestContext,
        action::ActionName,
    },
    schema::{
        EntityTypeOwnerSubject, EntityTypePermission, EntityTypeRelationAndSubject, WebPermission,
    },
    zanzibar::Consistency,
};
use hash_graph_store::{
    entity::ClosedMultiEntityTypeMap,
    entity_type::{
        ArchiveEntityTypeParams, ClosedDataTypeDefinition, CountEntityTypesParams,
        CreateEntityTypeParams, EntityTypeQueryPath, EntityTypeResolveDefinitions, EntityTypeStore,
        GetClosedMultiEntityTypesResponse, GetEntityTypeSubgraphParams,
        GetEntityTypeSubgraphResponse, GetEntityTypesParams, GetEntityTypesResponse,
        IncludeEntityTypeOption, IncludeResolvedEntityTypeOption, UnarchiveEntityTypeParams,
        UpdateEntityTypeEmbeddingParams, UpdateEntityTypesParams,
    },
    error::{InsertionError, QueryError, UpdateError},
    filter::{Filter, FilterExpression, ParameterList},
    property_type::{GetPropertyTypeSubgraphParams, PropertyTypeStore as _},
    query::{Ordering, QueryResult as _, Read, ReadPaginated, VersionedUrlSorting},
    subgraph::{
        Subgraph, SubgraphRecord as _,
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind, OutgoingEdgeResolveDepth},
        identifier::{EntityTypeVertexId, GraphElementVertexId, PropertyTypeVertexId},
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxes, QueryTemporalAxesUnresolved,
            VariableAxis, VariableTemporalAxisUnresolved,
        },
    },
};
use hash_graph_temporal_versioning::{RightBoundedTemporalInterval, Timestamp, TransactionTime};
use hash_graph_types::{Embedding, ontology::OntologyTypeProvider};
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
        crud::QueryRecordDecode,
        ontology::{PostgresOntologyOwnership, read::OntologyTypeTraversalData},
        query::{Distinctness, PostgresRecord, ReferenceTable, SelectCompiler, Table},
    },
    validation::StoreProvider,
};

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[tracing::instrument(level = "trace", skip(entity_types, provider))]
    pub(crate) async fn filter_entity_types_by_permission<I, T>(
        entity_types: impl IntoIterator<Item = (I, T)> + Send,
        provider: &StoreProvider<'_, Self>,
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
            Some(
                provider
                    .store
                    .authorization_api
                    .check_entity_types_permission(
                        policy_components
                            .actor_id
                            .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from),
                        EntityTypePermission::View,
                        ids.iter().copied(),
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(QueryError)?
                    .0,
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

                permissions
                    .get(&id)
                    .copied()
                    .unwrap_or(false)
                    .then_some(entity_type)
            }))
    }

    #[expect(clippy::too_many_lines)]
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
            .get_property_type_subgraph(
                actor_id,
                GetPropertyTypeSubgraphParams {
                    filter: Filter::for_property_type_uuids(&property_type_uuids),
                    graph_resolve_depths: GraphResolveDepths {
                        constrains_properties_on: OutgoingEdgeResolveDepth {
                            outgoing: 255,
                            incoming: 0,
                        },
                        ..GraphResolveDepths::default()
                    },
                    temporal_axes: QueryTemporalAxesUnresolved::default(),
                    after: None,
                    limit: None,
                    include_drafts: false,
                    include_count: false,
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
    async fn get_entity_types_impl(
        &self,
        actor_id: ActorEntityUuid,
        params: GetEntityTypesParams<'_>,
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<GetEntityTypesResponse, Report<QueryError>> {
        let (count, web_ids, edition_created_by_ids) = if params.include_count
            || params.include_web_ids
            || params.include_edition_created_by_ids
        {
            let mut compiler = SelectCompiler::new(Some(temporal_axes), params.include_drafts);
            let ontology_id_idx = compiler.add_selection_path(&EntityTypeQueryPath::OntologyId);
            let web_id_idx = params
                .include_web_ids
                .then(|| compiler.add_selection_path(&EntityTypeQueryPath::WebId));
            let edition_provenance_idx = params.include_edition_created_by_ids.then(|| {
                compiler.add_selection_path(&EntityTypeQueryPath::EditionProvenance(None))
            });

            compiler
                .add_filter(&params.filter)
                .change_context(QueryError)?;

            let (statement, parameters) = compiler.compile();

            let entity_types = self
                .as_client()
                .query_raw(&statement, parameters.iter().copied())
                .instrument(tracing::trace_span!("query"))
                .await
                .change_context(QueryError)?
                .map(|row| row.change_context(QueryError))
                .map_ok(move |row| (row.get(ontology_id_idx), row))
                .try_collect::<HashMap<EntityTypeUuid, _>>()
                .await?;

            let (permissions, _zookie) = self
                .authorization_api
                .check_entity_types_permission(
                    actor_id,
                    EntityTypePermission::View,
                    entity_types.keys().copied(),
                    Consistency::FullyConsistent,
                )
                .await
                .change_context(QueryError)?;

            let permitted_ids = permissions
                .into_iter()
                .filter_map(|(entity_type_id, has_permission)| {
                    has_permission.then_some(entity_type_id)
                })
                .collect::<HashSet<_>>();

            let mut web_ids = params.include_web_ids.then(ResponseCountMap::default);
            let mut edition_created_by_ids = params
                .include_edition_created_by_ids
                .then(ResponseCountMap::default);

            let count = entity_types
                .into_iter()
                .filter(|(entity_type_id, _)| permitted_ids.contains(entity_type_id))
                .inspect(|(_, row)| {
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

        // TODO: Remove again when subgraph logic was revisited
        //   see https://linear.app/hash/issue/H-297
        let mut visited_ontology_ids = HashSet::new();

        let (data, artifacts) =
            ReadPaginated::<EntityTypeWithMetadata, VersionedUrlSorting>::read_paginated_vec(
                self,
                &[params.filter],
                Some(temporal_axes),
                &VersionedUrlSorting {
                    cursor: params.after,
                },
                params.limit,
                params.include_drafts,
            )
            .await?;
        let entity_types = data
            .into_iter()
            .filter_map(|row| {
                let entity_type = row.decode_record(&artifacts);
                let id = EntityTypeUuid::from_url(&entity_type.schema.id);
                // The records are already sorted by time, so we can just take the first one
                visited_ontology_ids.insert(id).then_some((id, entity_type))
            })
            .collect::<Vec<_>>();

        let filtered_ids = entity_types
            .iter()
            .map(|(entity_type_id, _)| *entity_type_id)
            .collect::<Vec<_>>();

        let (permissions, _zookie) = self
            .authorization_api
            .check_entity_types_permission(
                actor_id,
                EntityTypePermission::View,
                filtered_ids,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(QueryError)?;

        let entity_types = entity_types
            .into_iter()
            .filter_map(|(id, entity_type)| {
                permissions
                    .get(&id)
                    .copied()
                    .unwrap_or(false)
                    .then_some(entity_type)
            })
            .collect::<Vec<_>>();

        Ok(GetEntityTypesResponse {
            cursor: if params.limit.is_some() {
                entity_types
                    .last()
                    .map(|entity_type| entity_type.schema.id.clone())
            } else {
                None
            },
            entity_types,
            closed_entity_types: params.include_entity_types.is_some().then(Vec::new),
            definitions: (params.include_entity_types == Some(IncludeEntityTypeOption::Resolved))
                .then(EntityTypeResolveDefinitions::default),
            count,
            web_ids,
            edition_created_by_ids,
        })
    }

    pub(crate) async fn get_closed_entity_types(
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
            .instrument(tracing::trace_span!("query"))
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
    pub(crate) async fn traverse_entity_types(
        &self,
        mut entity_type_queue: Vec<(
            EntityTypeUuid,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        provider: &StoreProvider<'_, Self>,
        subgraph: &mut Subgraph,
    ) -> Result<(), Report<QueryError>> {
        let mut property_type_queue = Vec::new();

        while !entity_type_queue.is_empty() {
            let mut edges_to_traverse =
                HashMap::<OntologyEdgeKind, OntologyTypeTraversalData>::new();

            #[expect(clippy::iter_with_drain, reason = "false positive, vector is reused")]
            for (entity_type_ontology_id, graph_resolve_depths, traversal_interval) in
                entity_type_queue.drain(..)
            {
                for edge_kind in [
                    OntologyEdgeKind::ConstrainsPropertiesOn,
                    OntologyEdgeKind::InheritsFrom,
                    OntologyEdgeKind::ConstrainsLinksOn,
                    OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                ] {
                    if let Some(new_graph_resolve_depths) = graph_resolve_depths
                        .decrement_depth_for_edge(edge_kind, EdgeDirection::Outgoing)
                    {
                        edges_to_traverse.entry(edge_kind).or_default().push(
                            OntologyTypeUuid::from(entity_type_ontology_id),
                            new_graph_resolve_depths,
                            traversal_interval,
                        );
                    }
                }
            }

            if let Some(traversal_data) =
                edges_to_traverse.get(&OntologyEdgeKind::ConstrainsPropertiesOn)
            {
                // TODO: Filter for entity types, which were not already added to the
                //       subgraph to avoid unnecessary lookups.
                property_type_queue.extend(
                    Self::filter_property_types_by_permission(
                        self.read_ontology_edges::<EntityTypeVertexId, PropertyTypeVertexId>(
                            traversal_data,
                            ReferenceTable::EntityTypeConstrainsPropertiesOn {
                                // TODO: Use the resolve depths passed to the query
                                inheritance_depth: Some(0),
                            },
                        )
                        .await?,
                        provider,
                    )
                    .await?
                    .flat_map(|edge| {
                        subgraph.insert_edge(
                            &edge.left_endpoint,
                            OntologyEdgeKind::ConstrainsPropertiesOn,
                            EdgeDirection::Outgoing,
                            edge.right_endpoint.clone(),
                        );

                        traversal_context.add_property_type_id(
                            PropertyTypeUuid::from(edge.right_endpoint_ontology_id),
                            edge.resolve_depths,
                            edge.traversal_interval,
                        )
                    }),
                );
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
                if let Some(traversal_data) = edges_to_traverse.get(&edge_kind) {
                    entity_type_queue.extend(
                        Self::filter_entity_types_by_permission(
                            self.read_ontology_edges::<EntityTypeVertexId, EntityTypeVertexId>(
                                traversal_data,
                                table,
                            )
                            .await?,
                            provider,
                        )
                        .await?
                        .flat_map(|edge| {
                            subgraph.insert_edge(
                                &edge.left_endpoint,
                                edge_kind,
                                EdgeDirection::Outgoing,
                                edge.right_endpoint.clone(),
                            );

                            traversal_context.add_entity_type_id(
                                EntityTypeUuid::from(edge.right_endpoint_ontology_id),
                                edge.resolve_depths,
                                edge.traversal_interval,
                            )
                        }),
                    );
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

impl<C, A> EntityTypeStore for PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn create_entity_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreateEntityTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut relationships = HashSet::new();

        let mut inserted_entity_type_metadata = Vec::new();
        let mut inserted_entity_types = Vec::new();
        let mut entity_type_reference_ids = Vec::new();

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
                transaction
                    .authorization_api
                    .check_web_permission(
                        actor_id,
                        WebPermission::CreateEntityType,
                        *web_id,
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(InsertionError)?
                    .assert_permission()
                    .change_context(InsertionError)?;

                relationships.insert((
                    entity_type_id,
                    EntityTypeRelationAndSubject::Owner {
                        subject: EntityTypeOwnerSubject::Web { id: *web_id },
                        level: 0,
                    },
                ));
            }

            relationships.extend(
                parameters
                    .relationships
                    .into_iter()
                    .map(|relation_and_subject| (entity_type_id, relation_and_subject)),
            );

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

        let mut ontology_type_resolver = OntologyTypeResolver::default();

        for (entity_type_id, inserted_entity_type) in &inserted_entity_types {
            ontology_type_resolver
                .add_unresolved_entity_type(*entity_type_id, Arc::clone(inserted_entity_type));
        }

        let required_reference_ids = entity_type_reference_ids.into_iter().collect::<Vec<_>>();

        let mut resolve_data = transaction
            .get_per_entity_type_resolve_metadata(&required_reference_ids)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not read entity type resolve data")?
            .collect::<Result<HashMap<_, _>, _>>()
            .change_context(InsertionError)?;

        transaction
            .get_entity_types(
                actor_id,
                GetEntityTypesParams {
                    filter: Filter::In(
                        FilterExpression::Path {
                            path: EntityTypeQueryPath::OntologyId,
                        },
                        ParameterList::EntityTypeIds(&required_reference_ids),
                    ),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                    include_drafts: false,
                    after: None,
                    limit: None,
                    include_entity_types: None,
                    include_count: false,
                    include_web_ids: false,
                    include_edition_created_by_ids: false,
                },
            )
            .await
            .change_context(InsertionError)
            .attach_printable("Could not read parent entity types")?
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

        transaction
            .authorization_api
            .modify_entity_type_relations(relationships.clone().into_iter().map(
                |(resource, relation_and_subject)| {
                    (
                        ModifyRelationshipOperation::Create,
                        resource,
                        relation_and_subject,
                    )
                },
            ))
            .await
            .change_context(InsertionError)?;

        if let Err(error) = transaction.commit().await.change_context(InsertionError) {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_entity_type_relations(relationships.into_iter().map(
                    |(resource, relation_and_subject)| {
                        (
                            ModifyRelationshipOperation::Delete,
                            resource,
                            relation_and_subject,
                        )
                    },
                ))
                .await
                .change_context(InsertionError)
            {
                error.push(auth_error);
            }

            Err(error.change_context(InsertionError))
        } else {
            if let Some(temporal_client) = &self.temporal_client {
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
    }

    // TODO: take actor ID into consideration, but currently we don't have any non-public entity
    //       types anyway.
    async fn count_entity_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: CountEntityTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .await
            .change_context(QueryError)?;

        params
            .filter
            .convert_parameters(&StoreProvider::new(self, &policy_components))
            .await
            .change_context(QueryError)?;

        Ok(self
            .read(
                &[params.filter],
                Some(&params.temporal_axes.resolve()),
                params.include_drafts,
            )
            .await?
            .count()
            .await)
    }

    async fn get_entity_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetEntityTypesParams<'_>,
    ) -> Result<GetEntityTypesResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .await
            .change_context(QueryError)?;

        let include_entity_types = params.include_entity_types;
        params
            .filter
            .convert_parameters(&StoreProvider::new(self, &policy_components))
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.clone();
        let resolved_temporal_axes = temporal_axes.clone().resolve();
        let mut response = self
            .get_entity_types_impl(actor_id, params, &resolved_temporal_axes)
            .await?;

        if let Some(include_entity_types) = include_entity_types {
            let ids = response
                .entity_types
                .iter()
                .map(|entity_type| EntityTypeUuid::from_url(&entity_type.schema.id))
                .collect::<Vec<_>>();

            response.closed_entity_types = Some(
                self.get_closed_entity_types(&Filter::for_entity_type_uuids(&ids), temporal_axes)
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
            .get_closed_entity_types(
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
    async fn get_entity_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetEntityTypeSubgraphParams<'_>,
    ) -> Result<GetEntityTypeSubgraphResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .await
            .change_context(QueryError)?;

        let provider = StoreProvider::new(self, &policy_components);

        params
            .filter
            .convert_parameters(&provider)
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        let GetEntityTypesResponse {
            entity_types,
            closed_entity_types: _,
            definitions: _,
            cursor,
            count,
            web_ids,
            edition_created_by_ids,
        } = self
            .get_entity_types_impl(
                actor_id,
                GetEntityTypesParams {
                    filter: params.filter,
                    temporal_axes: params.temporal_axes.clone(),
                    after: params.after,
                    limit: params.limit,
                    include_drafts: params.include_drafts,
                    include_entity_types: None,
                    include_count: params.include_count,
                    include_web_ids: params.include_web_ids,
                    include_edition_created_by_ids: params.include_edition_created_by_ids,
                },
                &temporal_axes,
            )
            .await?;

        let mut subgraph = Subgraph::new(
            params.graph_resolve_depths,
            params.temporal_axes,
            temporal_axes.clone(),
        );

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
                .map(|id| {
                    (
                        id,
                        subgraph.depths,
                        subgraph.temporal_axes.resolved.variable_interval(),
                    )
                })
                .collect(),
            &mut traversal_context,
            &provider,
            &mut subgraph,
        )
        .await?;

        traversal_context
            .read_traversed_vertices(self, &mut subgraph, params.include_drafts)
            .await?;

        Ok(GetEntityTypeSubgraphResponse {
            subgraph,
            cursor,
            count,
            web_ids,
            edition_created_by_ids,
        })
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn update_entity_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdateEntityTypesParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        let transaction = self.transaction().await.change_context(UpdateError)?;

        let mut relationships = HashSet::new();

        let mut updated_entity_type_metadata = Vec::new();
        let mut inserted_entity_types = Vec::new();
        let mut entity_type_reference_ids = Vec::new();

        for parameters in params {
            let provenance = OntologyProvenance {
                edition: OntologyEditionProvenance {
                    created_by_id: actor_id,
                    archived_by_id: None,
                    user_defined: parameters.provenance,
                },
            };

            let old_ontology_id = EntityTypeUuid::from_url(&VersionedUrl {
                base_url: parameters.schema.id.base_url.clone(),
                version: OntologyTypeVersion::new(
                    parameters
                        .schema
                        .id
                        .version
                        .inner()
                        .checked_sub(1)
                        .ok_or(UpdateError)
                        .attach_printable(
                            "The version of the entity type is already at the lowest possible \
                             value",
                        )?,
                ),
            });
            let record_id = OntologyTypeRecordId::from(parameters.schema.id.clone());
            let entity_type_id = EntityTypeUuid::from_url(&parameters.schema.id);

            transaction
                .authorization_api
                .check_entity_type_permission(
                    actor_id,
                    EntityTypePermission::Update,
                    old_ontology_id,
                    Consistency::FullyConsistent,
                )
                .await
                .change_context(UpdateError)?
                .assert_permission()
                .change_context(UpdateError)?;

            let (_ontology_id, web_id, temporal_versioning) = transaction
                .update_owned_ontology_id(&parameters.schema.id, &provenance.edition)
                .await?;

            relationships.extend(
                iter::once(EntityTypeRelationAndSubject::Owner {
                    subject: EntityTypeOwnerSubject::Web { id: web_id },
                    level: 0,
                })
                .chain(parameters.relationships)
                .map(|relation_and_subject| (entity_type_id, relation_and_subject)),
            );

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
            .attach_printable("Could not read entity type resolve data")?
            .collect::<Result<HashMap<_, _>, _>>()
            .change_context(UpdateError)?;

        transaction
            .get_entity_types(
                actor_id,
                GetEntityTypesParams {
                    filter: Filter::In(
                        FilterExpression::Path {
                            path: EntityTypeQueryPath::OntologyId,
                        },
                        ParameterList::EntityTypeIds(&required_reference_ids),
                    ),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                    include_drafts: false,
                    after: None,
                    limit: None,
                    include_entity_types: None,
                    include_count: false,
                    include_web_ids: false,
                    include_edition_created_by_ids: false,
                },
            )
            .await
            .change_context(UpdateError)
            .attach_printable("Could not read parent entity types")?
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

        transaction
            .authorization_api
            .modify_entity_type_relations(relationships.clone().into_iter().map(
                |(entity_type_id, relation_and_subject)| {
                    (
                        ModifyRelationshipOperation::Create,
                        entity_type_id,
                        relation_and_subject,
                    )
                },
            ))
            .await
            .change_context(UpdateError)?;

        if let Err(error) = transaction.commit().await.change_context(UpdateError) {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_entity_type_relations(relationships.into_iter().map(
                    |(entity_type_id, relation_and_subject)| {
                        (
                            ModifyRelationshipOperation::Delete,
                            entity_type_id,
                            relation_and_subject,
                        )
                    },
                ))
                .await
                .change_context(UpdateError)
            {
                error.push(auth_error);
            }

            Err(error.change_context(UpdateError))
        } else {
            if let Some(temporal_client) = &self.temporal_client {
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
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn archive_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: ArchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.archive_ontology_type(&params.entity_type_id, actor_id)
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn unarchive_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UnarchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
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
                .await
                .change_context(UpdateError)?;
        }

        transaction.commit().await.change_context(UpdateError)?;

        Ok(())
    }

    async fn can_instantiate_entity_types(
        &self,
        authenticated_user: ActorEntityUuid,
        entity_type_ids: &[VersionedUrl],
    ) -> Result<Vec<bool>, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(authenticated_user)
            .with_entity_type_ids(entity_type_ids.iter())
            .await
            .change_context(QueryError)?;

        let validator_provider = StoreProvider::new(self, &policy_components);

        let mut entity_type_id_set = HashMap::new();
        for entity_type_id in entity_type_ids {
            let entity_type = OntologyTypeProvider::<ClosedEntityType>::provide_type(
                &validator_provider,
                entity_type_id,
            )
            .await?;

            entity_type_id_set.insert(
                entity_type_id.clone(),
                entity_type
                    .all_of
                    .iter()
                    .map(|metadata| metadata.id.clone())
                    .collect::<HashSet<_>>(),
            );
        }

        entity_type_id_set
            .into_iter()
            .map(|(base, parents)| {
                // We need to check the base entity type and all its parents
                // to see if the user can instantiate it.
                for entity_type_id in iter::once(base).chain(parents) {
                    let allowed = policy_components
                        .policy_set
                        .evaluate(
                            &Request {
                                actor: policy_components.actor_id,
                                action: ActionName::Instantiate,
                                resource: Some(&PartialResourceId::EntityType(Some(
                                    Cow::Borrowed((&entity_type_id).into()),
                                ))),
                                context: RequestContext::default(),
                            },
                            &policy_components.context,
                        )
                        .change_context(QueryError)
                        .map(|authorized| match authorized {
                            Authorized::Always => true,
                            Authorized::Never => false,
                            Authorized::Partial(partial) => unimplemented!(
                                "Instantiation checking is not supported for partial \
                                 authorization: {partial:#?}"
                            ),
                        })?;
                    if !allowed {
                        return Ok(false);
                    }
                }
                Ok(true)
            })
            .collect()
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
