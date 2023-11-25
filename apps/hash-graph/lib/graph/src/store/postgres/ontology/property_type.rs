use std::collections::{HashMap, HashSet};

use async_trait::async_trait;
use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{
        PropertyTypeId, PropertyTypeOwnerSubject, PropertyTypePermission,
        PropertyTypeRelationAndSubject, PropertyTypeSubjectSet, PropertyTypeViewerSubject,
        WebPermission,
    },
    zanzibar::{Consistency, Zookie},
    AuthorizationApi,
};
use error_stack::{Result, ResultExt};
use graph_types::{
    account::AccountId,
    ontology::{
        OntologyElementMetadata, OntologyTemporalMetadata, PartialCustomOntologyMetadata,
        PartialOntologyElementMetadata, PropertyTypeWithMetadata,
    },
    provenance::{ProvenanceMetadata, RecordArchivedById, RecordCreatedById},
    web::WebId,
};
use temporal_versioning::RightBoundedTemporalInterval;
use type_system::{url::VersionedUrl, PropertyType};

#[cfg(hash_graph_test_environment)]
use crate::store::error::DeletionError;
use crate::{
    store::{
        crud::Read,
        postgres::{
            ontology::{read::OntologyTypeTraversalData, OntologyId},
            query::ReferenceTable,
            OntologyTypeSubject, TraversalContext,
        },
        AsClient, ConflictBehavior, InsertionError, PostgresStore, PropertyTypeStore, QueryError,
        Record, UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind},
        identifier::{DataTypeVertexId, PropertyTypeVertexId},
        query::StructuralQuery,
        temporal_axes::VariableAxis,
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    pub(crate) async fn filter_property_types_by_permission<I, T, A>(
        property_types: impl IntoIterator<Item = (I, T)> + Send,
        actor_id: AccountId,
        authorization_api: &A,
        zookie: &Zookie<'static>,
    ) -> Result<impl Iterator<Item = T>, QueryError>
    where
        I: Into<PropertyTypeId> + Send,
        T: Send,
        A: AuthorizationApi + Sync,
    {
        let (ids, property_types): (Vec<_>, Vec<_>) = property_types
            .into_iter()
            .map(|(id, edge)| (id.into(), edge))
            .unzip();

        let permissions = authorization_api
            .check_property_types_permission(
                actor_id,
                PropertyTypePermission::View,
                ids.iter().copied(),
                Consistency::AtExactSnapshot(zookie),
            )
            .await
            .change_context(QueryError)?
            .0;

        Ok(ids
            .into_iter()
            .zip(property_types)
            .filter_map(move |(id, property_type)| {
                permissions
                    .get(&id)
                    .copied()
                    .unwrap_or(false)
                    .then_some(property_type)
            }))
    }

    /// Internal method to read a [`PropertyTypeWithMetadata`] into two [`TraversalContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(
        level = "trace",
        skip(self, traversal_context, subgraph, authorization_api, zookie)
    )]
    pub(crate) async fn traverse_property_types<A: AuthorizationApi + Sync>(
        &self,
        mut property_type_queue: Vec<(
            OntologyId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        actor_id: AccountId,
        authorization_api: &A,
        zookie: &Zookie<'static>,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let mut data_type_queue = Vec::new();
        let mut edges_to_traverse = HashMap::<OntologyEdgeKind, OntologyTypeTraversalData>::new();

        while !property_type_queue.is_empty() {
            edges_to_traverse.clear();

            #[expect(clippy::iter_with_drain, reason = "false positive, vector is reused")]
            for (property_type_ontology_id, graph_resolve_depths, traversal_interval) in
                property_type_queue.drain(..)
            {
                for edge_kind in [
                    OntologyEdgeKind::ConstrainsValuesOn,
                    OntologyEdgeKind::ConstrainsPropertiesOn,
                ] {
                    if let Some(new_graph_resolve_depths) = graph_resolve_depths
                        .decrement_depth_for_edge(edge_kind, EdgeDirection::Outgoing)
                    {
                        edges_to_traverse.entry(edge_kind).or_default().push(
                            property_type_ontology_id,
                            new_graph_resolve_depths,
                            traversal_interval,
                        );
                    }
                }
            }

            if let Some(traversal_data) =
                edges_to_traverse.get(&OntologyEdgeKind::ConstrainsValuesOn)
            {
                data_type_queue.extend(
                    Self::filter_data_types_by_permission(
                        self.read_ontology_edges::<PropertyTypeVertexId, DataTypeVertexId>(
                            traversal_data,
                            ReferenceTable::PropertyTypeConstrainsValuesOn,
                        )
                        .await?,
                        actor_id,
                        authorization_api,
                        zookie,
                    )
                    .await?
                    .flat_map(|edge| {
                        subgraph.insert_edge(
                            &edge.left_endpoint,
                            OntologyEdgeKind::ConstrainsValuesOn,
                            EdgeDirection::Outgoing,
                            edge.right_endpoint.clone(),
                        );

                        traversal_context.add_data_type_id(
                            edge.right_endpoint_ontology_id,
                            edge.resolve_depths,
                            edge.traversal_interval,
                        )
                    }),
                );
            }

            if let Some(traversal_data) =
                edges_to_traverse.get(&OntologyEdgeKind::ConstrainsPropertiesOn)
            {
                property_type_queue.extend(
                    Self::filter_property_types_by_permission(
                        self.read_ontology_edges::<PropertyTypeVertexId, PropertyTypeVertexId>(
                            traversal_data,
                            ReferenceTable::PropertyTypeConstrainsPropertiesOn,
                        )
                        .await?,
                        actor_id,
                        authorization_api,
                        zookie,
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
                            edge.right_endpoint_ontology_id,
                            edge.resolve_depths,
                            edge.traversal_interval,
                        )
                    }),
                );
            };
        }

        self.traverse_data_types(
            data_type_queue,
            traversal_context,
            actor_id,
            authorization_api,
            zookie,
            subgraph,
        )
        .await?;

        Ok(())
    }

    #[tracing::instrument(level = "trace", skip(self))]
    #[cfg(hash_graph_test_environment)]
    pub async fn delete_property_types(&mut self) -> Result<(), DeletionError> {
        let transaction = self.transaction().await.change_context(DeletionError)?;

        transaction
            .as_client()
            .simple_query(
                "
                    DELETE FROM property_type_constrains_properties_on;
                    DELETE FROM property_type_constrains_values_on;
                ",
            )
            .await
            .change_context(DeletionError)?;

        let property_types = transaction
            .as_client()
            .query(
                "
                    DELETE FROM property_types
                    RETURNING ontology_id
                ",
                &[],
            )
            .await
            .change_context(DeletionError)?
            .into_iter()
            .filter_map(|row| row.get(0))
            .collect::<Vec<OntologyId>>();

        transaction.delete_ontology_ids(&property_types).await?;

        transaction.commit().await.change_context(DeletionError)?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> PropertyTypeStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, property_types, authorization_api))]
    async fn create_property_types<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        property_types: impl IntoIterator<
            Item = (PropertyType, PartialOntologyElementMetadata),
            IntoIter: Send,
        > + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<OntologyElementMetadata>, InsertionError> {
        let property_types = property_types.into_iter();
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let provenance = ProvenanceMetadata {
            record_created_by_id: RecordCreatedById::new(actor_id),
            record_archived_by_id: None,
        };

        let mut relationships = Vec::new();

        let mut inserted_property_types = Vec::new();
        let mut inserted_property_type_metadata =
            Vec::with_capacity(inserted_property_types.capacity());
        for (schema, metadata) in property_types {
            if let PartialCustomOntologyMetadata::Owned { owned_by_id } = &metadata.custom {
                authorization_api
                    .check_web_permission(
                        actor_id,
                        WebPermission::CreatePropertyType,
                        WebId::from(*owned_by_id),
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(InsertionError)?
                    .assert_permission()
                    .change_context(InsertionError)?;
            }

            if let Some((ontology_id, transaction_time, owner)) = transaction
                .create_ontology_metadata(
                    provenance.record_created_by_id,
                    &metadata.record_id,
                    &metadata.custom,
                    on_conflict,
                )
                .await?
            {
                transaction.insert_with_id(ontology_id, &schema).await?;

                inserted_property_types.push((ontology_id, schema));
                inserted_property_type_metadata.push(OntologyElementMetadata::from_partial(
                    metadata,
                    provenance,
                    transaction_time,
                ));

                relationships.push((
                    PropertyTypeId::from(ontology_id),
                    PropertyTypeRelationAndSubject::Viewer {
                        subject: PropertyTypeViewerSubject::Public,
                        level: 0,
                    },
                ));
                if let Some(owner) = owner {
                    match owner {
                        OntologyTypeSubject::Account { id } => relationships.push((
                            PropertyTypeId::from(ontology_id),
                            PropertyTypeRelationAndSubject::Owner {
                                subject: PropertyTypeOwnerSubject::Account { id },
                                level: 0,
                            },
                        )),
                        OntologyTypeSubject::AccountGroup { id } => relationships.push((
                            PropertyTypeId::from(ontology_id),
                            PropertyTypeRelationAndSubject::Owner {
                                subject: PropertyTypeOwnerSubject::AccountGroup {
                                    id,
                                    set: PropertyTypeSubjectSet::Member,
                                },
                                level: 0,
                            },
                        )),
                    }
                }
            }
        }

        for (ontology_id, schema) in inserted_property_types {
            transaction
                .insert_property_type_references(&schema, ontology_id)
                .await
                .change_context(InsertionError)
                .attach_printable_lazy(|| {
                    format!(
                        "could not insert references for property type: {}",
                        schema.id()
                    )
                })
                .attach_lazy(|| schema.clone())?;
        }

        #[expect(clippy::needless_collect, reason = "Higher ranked lifetime error")]
        authorization_api
            .modify_property_type_relations(
                relationships
                    .iter()
                    .map(|(resource, relation_and_subject)| {
                        (
                            ModifyRelationshipOperation::Create,
                            *resource,
                            *relation_and_subject,
                        )
                    })
                    .collect::<Vec<_>>(),
            )
            .await
            .change_context(InsertionError)?;

        if let Err(mut error) = transaction.commit().await.change_context(InsertionError) {
            if let Err(auth_error) = authorization_api
                .modify_property_type_relations(relationships.into_iter().map(
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
                // TODO: Use `add_child`
                //   see https://linear.app/hash/issue/GEN-105/add-ability-to-add-child-errors
                error.extend_one(auth_error);
            }

            Err(error)
        } else {
            Ok(inserted_property_type_metadata)
        }
    }

    #[tracing::instrument(level = "info", skip(self, authorization_api))]
    async fn get_property_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<PropertyTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
            temporal_axes: ref unresolved_temporal_axes,
        } = *query;

        let temporal_axes = unresolved_temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        // TODO: Remove again when subgraph logic was revisited
        //   see https://linear.app/hash/issue/H-297
        let mut visited_ontology_ids = HashSet::new();

        let property_types =
            Read::<PropertyTypeWithMetadata>::read_vec(self, filter, Some(&temporal_axes))
                .await?
                .into_iter()
                .filter_map(|property_type| {
                    let id = PropertyTypeId::from_url(property_type.schema.id());
                    let vertex_id = property_type.vertex_id(time_axis);
                    // The records are already sorted by time, so we can just take the first one
                    visited_ontology_ids
                        .insert(id)
                        .then_some((id, (vertex_id, property_type)))
                })
                .collect::<HashMap<_, _>>();

        let filtered_ids = property_types.keys().copied().collect::<Vec<_>>();
        let (permissions, zookie) = authorization_api
            .check_property_types_permission(
                actor_id,
                PropertyTypePermission::View,
                filtered_ids,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(QueryError)?;

        let mut subgraph = Subgraph::new(
            graph_resolve_depths,
            unresolved_temporal_axes.clone(),
            temporal_axes.clone(),
        );

        let (property_type_ids, property_type_vertices): (Vec<_>, _) = property_types
            .into_iter()
            .filter(|(id, _)| permissions.get(id).copied().unwrap_or(false))
            .unzip();
        subgraph.vertices.property_types = property_type_vertices;

        for vertex_id in subgraph.vertices.property_types.keys() {
            subgraph.roots.insert(vertex_id.clone().into());
        }

        let mut traversal_context = TraversalContext::default();

        // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow the
        //       vertices and have to `.collect()` the keys.
        self.traverse_property_types(
            property_type_ids
                .into_iter()
                .map(|id| {
                    (
                        OntologyId::from(id),
                        subgraph.depths,
                        subgraph.temporal_axes.resolved.variable_interval(),
                    )
                })
                .collect(),
            &mut traversal_context,
            actor_id,
            authorization_api,
            &zookie,
            &mut subgraph,
        )
        .await?;

        traversal_context
            .read_traversed_vertices(self, &mut subgraph)
            .await?;

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, property_type, authorization_api))]
    async fn update_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        property_type: PropertyType,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        let old_ontology_id = PropertyTypeId::from_url(&VersionedUrl {
            base_url: property_type.id().base_url.clone(),
            version: property_type.id().version - 1,
        });
        authorization_api
            .check_property_type_permission(
                actor_id,
                PropertyTypePermission::Update,
                old_ontology_id,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(UpdateError)?
            .assert_permission()
            .change_context(UpdateError)?;

        let transaction = self.transaction().await.change_context(UpdateError)?;

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_property_type_references` taking `&property_type`
        let (ontology_id, metadata, owner) = transaction
            .update::<PropertyType>(&property_type, RecordCreatedById::new(actor_id))
            .await?;

        transaction
            .insert_property_type_references(&property_type, ontology_id)
            .await
            .change_context(UpdateError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for property type: {}",
                    property_type.id()
                )
            })
            .attach_lazy(|| property_type.clone())?;

        let owner = match owner {
            OntologyTypeSubject::Account { id } => PropertyTypeOwnerSubject::Account { id },
            OntologyTypeSubject::AccountGroup { id } => PropertyTypeOwnerSubject::AccountGroup {
                id,
                set: PropertyTypeSubjectSet::Member,
            },
        };

        let relationships = [
            (
                PropertyTypeId::from(ontology_id),
                PropertyTypeRelationAndSubject::Owner {
                    subject: owner,
                    level: 0,
                },
            ),
            (
                PropertyTypeId::from(ontology_id),
                PropertyTypeRelationAndSubject::Viewer {
                    subject: PropertyTypeViewerSubject::Public,
                    level: 0,
                },
            ),
        ];

        #[expect(clippy::needless_collect, reason = "Higher ranked lifetime error")]
        authorization_api
            .modify_property_type_relations(
                relationships
                    .iter()
                    .map(|(resource, relation_and_subject)| {
                        (
                            ModifyRelationshipOperation::Create,
                            *resource,
                            *relation_and_subject,
                        )
                    })
                    .collect::<Vec<_>>(),
            )
            .await
            .change_context(UpdateError)?;

        if let Err(mut error) = transaction.commit().await.change_context(UpdateError) {
            #[expect(clippy::needless_collect, reason = "Higher ranked lifetime error")]
            if let Err(auth_error) = authorization_api
                .modify_property_type_relations(
                    relationships
                        .iter()
                        .map(|(resource, relation_and_subject)| {
                            (
                                ModifyRelationshipOperation::Delete,
                                *resource,
                                *relation_and_subject,
                            )
                        })
                        .collect::<Vec<_>>(),
                )
                .await
                .change_context(UpdateError)
            {
                // TODO: Use `add_child`
                //   see https://linear.app/hash/issue/GEN-105/add-ability-to-add-child-errors
                error.extend_one(auth_error);
            }

            Err(error)
        } else {
            Ok(metadata)
        }
    }

    #[tracing::instrument(level = "info", skip(self, _authorization_api))]
    async fn archive_property_type<A: AuthorizationApi + Sync>(
        &mut self,
        actor_id: AccountId,
        _authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.archive_ontology_type(id, RecordArchivedById::new(actor_id))
            .await
    }

    #[tracing::instrument(level = "info", skip(self, _authorization_api))]
    async fn unarchive_property_type<A: AuthorizationApi + Sync>(
        &mut self,
        actor_id: AccountId,
        _authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.unarchive_ontology_type(id, RecordCreatedById::new(actor_id))
            .await
    }
}
