use std::collections::HashSet;

use error_stack::Result;

use crate::{
    identifier::knowledge::EntityEditionId,
    knowledge::{Entity, EntityQueryPath},
    ontology::{
        DataTypeQueryPath, DataTypeWithMetadata, EntityTypeQueryPath, EntityTypeWithMetadata,
        PropertyTypeQueryPath, PropertyTypeWithMetadata,
    },
    store::{
        crud::Read,
        query::{Filter, FilterExpression, ParameterList},
        AsClient, PostgresStore, QueryError, Record,
    },
    subgraph::{
        identifier::{DataTypeVertexId, EntityTypeVertexId, PropertyTypeVertexId},
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    async fn read_data_types_by_ids(
        &self,
        vertex_ids: impl IntoIterator<Item = &DataTypeVertexId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let ids = vertex_ids
            .into_iter()
            .map(|id| format!("{}v/{}", id.base_id, id.revision_id.inner()))
            .collect::<Vec<_>>();

        for data_type in <Self as Read<DataTypeWithMetadata>>::read_vec(
            self,
            &Filter::<DataTypeWithMetadata>::In(
                FilterExpression::Path(DataTypeQueryPath::VersionedUrl),
                ParameterList::VersionedUrls(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
        )
        .await?
        {
            subgraph.insert_vertex(
                data_type.vertex_id(subgraph.temporal_axes.resolved.variable_time_axis()),
                data_type,
            );
        }

        Ok(())
    }

    async fn read_property_types_by_ids(
        &self,
        vertex_ids: impl IntoIterator<Item = &PropertyTypeVertexId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let ids = vertex_ids
            .into_iter()
            .map(|id| format!("{}v/{}", id.base_id, id.revision_id.inner()))
            .collect::<Vec<_>>();

        for property_type in <Self as Read<PropertyTypeWithMetadata>>::read_vec(
            self,
            &Filter::<PropertyTypeWithMetadata>::In(
                FilterExpression::Path(PropertyTypeQueryPath::VersionedUrl),
                ParameterList::VersionedUrls(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
        )
        .await?
        {
            subgraph.insert_vertex(
                property_type.vertex_id(subgraph.temporal_axes.resolved.variable_time_axis()),
                property_type,
            );
        }

        Ok(())
    }

    async fn read_entity_types_by_ids(
        &self,
        vertex_ids: impl IntoIterator<Item = &EntityTypeVertexId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let ids = vertex_ids
            .into_iter()
            .map(|id| format!("{}v/{}", id.base_id, id.revision_id.inner()))
            .collect::<Vec<_>>();

        for entity_type in <Self as Read<EntityTypeWithMetadata>>::read_vec(
            self,
            &Filter::<EntityTypeWithMetadata>::In(
                FilterExpression::Path(EntityTypeQueryPath::VersionedUrl),
                ParameterList::VersionedUrls(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
        )
        .await?
        {
            subgraph.insert_vertex(
                entity_type.vertex_id(subgraph.temporal_axes.resolved.variable_time_axis()),
                entity_type,
            );
        }

        Ok(())
    }

    async fn read_entities_by_ids(
        &self,
        edition_ids: impl IntoIterator<Item = EntityEditionId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let ids = edition_ids
            .into_iter()
            .map(EntityEditionId::as_uuid)
            .collect::<Vec<_>>();

        for entity in <Self as Read<Entity>>::read_vec(
            self,
            &Filter::<Entity>::In(
                FilterExpression::Path(EntityQueryPath::EditionId),
                ParameterList::Uuid(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
        )
        .await?
        {
            subgraph.insert_vertex(
                entity.vertex_id(subgraph.temporal_axes.resolved.variable_time_axis()),
                entity,
            );
        }

        Ok(())
    }
}

#[derive(Debug)]
pub struct OntologyTraversalContext<R: Record> {
    vertex_ids: HashSet<R::VertexId>,
}

impl<R: Record> Default for OntologyTraversalContext<R> {
    fn default() -> Self {
        Self {
            vertex_ids: HashSet::new(),
        }
    }
}

impl<R: Record> OntologyTraversalContext<R>
where
    R::VertexId: Clone + Eq + std::hash::Hash,
{
    pub fn add_id(&mut self, vertex_id: R::VertexId) {
        self.vertex_ids.insert(vertex_id);
    }
}

#[derive(Debug, Default)]
pub struct EntityTraversalContext {
    edition_ids: HashSet<EntityEditionId>,
}

impl EntityTraversalContext {
    pub fn add_id(&mut self, edition_id: EntityEditionId) {
        self.edition_ids.insert(edition_id);
    }
}

#[derive(Debug, Default)]
pub struct TraversalContext {
    data_types: OntologyTraversalContext<DataTypeWithMetadata>,
    property_types: OntologyTraversalContext<PropertyTypeWithMetadata>,
    entity_types: OntologyTraversalContext<EntityTypeWithMetadata>,
    entities: EntityTraversalContext,
}

impl TraversalContext {
    pub async fn read_traversed_vertices<C: AsClient>(
        &self,
        store: &PostgresStore<C>,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        if !self.data_types.vertex_ids.is_empty() {
            store
                .read_data_types_by_ids(&self.data_types.vertex_ids, subgraph)
                .await?;
        }
        if !self.property_types.vertex_ids.is_empty() {
            store
                .read_property_types_by_ids(&self.property_types.vertex_ids, subgraph)
                .await?;
        }
        if !self.entity_types.vertex_ids.is_empty() {
            store
                .read_entity_types_by_ids(&self.entity_types.vertex_ids, subgraph)
                .await?;
        }

        if !self.entities.edition_ids.is_empty() {
            store
                .read_entities_by_ids(self.entities.edition_ids.iter().copied(), subgraph)
                .await?;
        }

        Ok(())
    }

    pub fn add_data_type_id(&mut self, vertex_id: DataTypeVertexId) {
        self.data_types.add_id(vertex_id);
    }

    pub fn add_property_type_id(&mut self, vertex_id: PropertyTypeVertexId) {
        self.property_types.add_id(vertex_id);
    }

    pub fn add_entity_type_id(&mut self, vertex_id: EntityTypeVertexId) {
        self.entity_types.add_id(vertex_id);
    }

    pub fn add_entity_id(&mut self, edition_id: EntityEditionId) {
        self.entities.add_id(edition_id);
    }
}
