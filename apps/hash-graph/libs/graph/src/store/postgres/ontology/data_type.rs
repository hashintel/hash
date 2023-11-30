use std::collections::{HashMap, HashSet};

use async_trait::async_trait;
use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{
        DataTypeId, DataTypeOwnerSubject, DataTypePermission, DataTypeRelationAndSubject,
        DataTypeSubjectSet, DataTypeViewerSubject, WebPermission,
    },
    zanzibar::{Consistency, Zookie},
    AuthorizationApi,
};
use error_stack::{Result, ResultExt};
use graph_types::{
    account::AccountId,
    ontology::{
        DataTypeWithMetadata, OntologyElementMetadata, OntologyTemporalMetadata,
        PartialCustomOntologyMetadata, PartialOntologyElementMetadata,
    },
    provenance::{ProvenanceMetadata, RecordArchivedById, RecordCreatedById},
    web::WebId,
};
use temporal_versioning::RightBoundedTemporalInterval;
use type_system::{url::VersionedUrl, DataType};

#[cfg(hash_graph_test_environment)]
use crate::store::error::DeletionError;
use crate::{
    store::{
        crud::Read,
        postgres::{ontology::OntologyId, OntologyTypeSubject, TraversalContext},
        AsClient, ConflictBehavior, DataTypeStore, InsertionError, PostgresStore, QueryError,
        Record, UpdateError,
    },
    subgraph::{
        edges::GraphResolveDepths, identifier::DataTypeVertexId, query::StructuralQuery,
        temporal_axes::VariableAxis, Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    pub(crate) async fn filter_data_types_by_permission<I, T, A>(
        data_types: impl IntoIterator<Item = (I, T)> + Send,
        actor_id: AccountId,
        authorization_api: &A,
        zookie: &Zookie<'static>,
    ) -> Result<impl Iterator<Item = T>, QueryError>
    where
        I: Into<DataTypeId> + Send,
        T: Send,
        A: AuthorizationApi + Sync,
    {
        let (ids, data_types): (Vec<_>, Vec<_>) = data_types
            .into_iter()
            .map(|(id, edge)| (id.into(), edge))
            .unzip();

        let permissions = authorization_api
            .check_data_types_permission(
                actor_id,
                DataTypePermission::View,
                ids.iter().copied(),
                Consistency::AtExactSnapshot(zookie),
            )
            .await
            .change_context(QueryError)?
            .0;

        Ok(ids
            .into_iter()
            .zip(data_types)
            .filter_map(move |(id, data_type)| {
                permissions
                    .get(&id)
                    .copied()
                    .unwrap_or(false)
                    .then_some(data_type)
            }))
    }

    /// Internal method to read a [`DataTypeWithMetadata`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(
        level = "trace",
        skip(self, _traversal_context, _subgraph, _authorization_api, _zookie)
    )]
    pub(crate) async fn traverse_data_types<A: AuthorizationApi + Sync>(
        &self,
        queue: Vec<(
            OntologyId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        _traversal_context: &mut TraversalContext,
        actor_id: AccountId,
        _authorization_api: &A,
        _zookie: &Zookie<'static>,
        _subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        // TODO: data types currently have no references to other types, so we don't need to do
        //       anything here
        //   see https://app.asana.com/0/1200211978612931/1202464168422955/f

        Ok(())
    }

    #[tracing::instrument(level = "trace", skip(self))]
    #[cfg(hash_graph_test_environment)]
    pub async fn delete_data_types(&mut self) -> Result<(), DeletionError> {
        let transaction = self.transaction().await.change_context(DeletionError)?;

        let data_types = transaction
            .as_client()
            .query(
                "
                    DELETE FROM data_types
                    RETURNING ontology_id
                ",
                &[],
            )
            .await
            .change_context(DeletionError)?
            .into_iter()
            .filter_map(|row| row.get(0))
            .collect::<Vec<OntologyId>>();

        transaction.delete_ontology_ids(&data_types).await?;

        transaction.commit().await.change_context(DeletionError)?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> DataTypeStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, data_types, authorization_api))]
    async fn create_data_types<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        data_types: impl IntoIterator<Item = (DataType, PartialOntologyElementMetadata), IntoIter: Send>
        + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<OntologyElementMetadata>, InsertionError> {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let provenance = ProvenanceMetadata {
            record_created_by_id: RecordCreatedById::new(actor_id),
            record_archived_by_id: None,
        };

        let mut relationships = Vec::new();

        let mut inserted_data_type_metadata = Vec::new();
        for (schema, metadata) in data_types {
            if let PartialCustomOntologyMetadata::Owned { owned_by_id } = &metadata.custom {
                authorization_api
                    .check_web_permission(
                        actor_id,
                        WebPermission::CreateDataType,
                        WebId::from(*owned_by_id),
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(InsertionError)?
                    .assert_permission()
                    .change_context(InsertionError)?;
            }

            relationships.push((
                DataTypeId::from_url(schema.id()),
                DataTypeRelationAndSubject::Viewer {
                    subject: DataTypeViewerSubject::Public,
                    level: 0,
                },
            ));

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
                inserted_data_type_metadata.push(OntologyElementMetadata::from_partial(
                    metadata,
                    provenance,
                    transaction_time,
                ));

                if let Some(owner) = owner {
                    match owner {
                        OntologyTypeSubject::Account { id } => relationships.push((
                            DataTypeId::from(ontology_id),
                            DataTypeRelationAndSubject::Owner {
                                subject: DataTypeOwnerSubject::Account { id },
                                level: 0,
                            },
                        )),
                        OntologyTypeSubject::AccountGroup { id } => relationships.push((
                            DataTypeId::from(ontology_id),
                            DataTypeRelationAndSubject::Owner {
                                subject: DataTypeOwnerSubject::AccountGroup {
                                    id,
                                    set: DataTypeSubjectSet::Member,
                                },
                                level: 0,
                            },
                        )),
                    }
                }
            }
        }

        #[expect(clippy::needless_collect, reason = "Higher ranked lifetime error")]
        authorization_api
            .modify_data_type_relations(
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
                .modify_data_type_relations(relationships.into_iter().map(
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
            if relationships.is_empty() {
                tracing::warn!("Inserted datayptes without adding permissions to them");
            }

            Ok(inserted_data_type_metadata)
        }
    }

    #[tracing::instrument(level = "info", skip(self, authorization_api))]
    async fn get_data_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<DataTypeWithMetadata>,
        after: Option<&DataTypeVertexId>,
        limit: Option<usize>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
            temporal_axes: ref unresolved_temporal_axes,
            include_drafts,
        } = *query;

        let temporal_axes = unresolved_temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        // TODO: Remove again when subgraph logic was revisited
        //   see https://linear.app/hash/issue/H-297
        let mut visited_ontology_ids = HashSet::new();

        let data_types = Read::<DataTypeWithMetadata>::read_vec(
            self,
            filter,
            Some(&temporal_axes),
            after,
            limit,
        )
        .await?
        .into_iter()
        .filter_map(|data_type| {
            let id = DataTypeId::from_url(data_type.schema.id());
            let vertex_id = data_type.vertex_id(time_axis);
            // The records are already sorted by time, so we can just take the first one
            visited_ontology_ids
                .insert(id)
                .then_some((id, (vertex_id, data_type)))
        })
        .collect::<HashMap<_, _>>();

        let filtered_ids = data_types.keys().copied().collect::<Vec<_>>();
        let (permissions, zookie) = authorization_api
            .check_data_types_permission(
                actor_id,
                DataTypePermission::View,
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

        let (data_type_ids, data_type_vertices): (Vec<_>, _) = data_types
            .into_iter()
            .filter(|(id, _)| permissions.get(id).copied().unwrap_or(false))
            .unzip();
        subgraph.vertices.data_types = data_type_vertices;

        for vertex_id in subgraph.vertices.data_types.keys() {
            subgraph.roots.insert(vertex_id.clone().into());
        }

        let mut traversal_context = TraversalContext::default();

        // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow the
        //       vertices and have to `.collect()` the keys.
        self.traverse_data_types(
            data_type_ids
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

    #[tracing::instrument(level = "info", skip(self, data_type, authorization_api))]
    async fn update_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        data_type: DataType,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        let old_ontology_id = DataTypeId::from_url(&VersionedUrl {
            base_url: data_type.id().base_url.clone(),
            version: data_type.id().version - 1,
        });
        authorization_api
            .check_data_type_permission(
                actor_id,
                DataTypePermission::Update,
                old_ontology_id,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(UpdateError)?
            .assert_permission()
            .change_context(UpdateError)?;

        let transaction = self.transaction().await.change_context(UpdateError)?;

        let (ontology_id, metadata, owner) = transaction
            .update::<DataType>(&data_type, RecordCreatedById::new(actor_id))
            .await?;

        let owner = match owner {
            OntologyTypeSubject::Account { id } => DataTypeOwnerSubject::Account { id },
            OntologyTypeSubject::AccountGroup { id } => DataTypeOwnerSubject::AccountGroup {
                id,
                set: DataTypeSubjectSet::Member,
            },
        };

        let relationships = [
            (
                DataTypeId::from(ontology_id),
                DataTypeRelationAndSubject::Owner {
                    subject: owner,
                    level: 0,
                },
            ),
            (
                DataTypeId::from(ontology_id),
                DataTypeRelationAndSubject::Viewer {
                    subject: DataTypeViewerSubject::Public,
                    level: 0,
                },
            ),
        ];

        #[expect(clippy::needless_collect, reason = "Higher ranked lifetime error")]
        authorization_api
            .modify_data_type_relations(
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
                .modify_data_type_relations(
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
    async fn archive_data_type<A: AuthorizationApi + Sync>(
        &mut self,
        actor_id: AccountId,
        _authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.archive_ontology_type(id, RecordArchivedById::new(actor_id))
            .await
    }

    #[tracing::instrument(level = "info", skip(self, _authorization_api))]
    async fn unarchive_data_type<A: AuthorizationApi + Sync>(
        &mut self,
        actor_id: AccountId,
        _authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.unarchive_ontology_type(id, RecordCreatedById::new(actor_id))
            .await
    }
}
