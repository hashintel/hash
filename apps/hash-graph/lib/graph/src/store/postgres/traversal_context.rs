use std::collections::HashSet;

use error_stack::Result;

use crate::{
    identifier::knowledge::EntityEditionId,
    knowledge::{Entity, EntityQueryPath},
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
    store::{
        crud::Read,
        query::{Filter, FilterExpression, Parameter},
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
        for vertex_id in vertex_ids {
            for data_type in <Self as Read<DataTypeWithMetadata>>::read_vec(
                self,
                &DataTypeWithMetadata::create_filter_for_vertex_id(vertex_id),
                Some(&subgraph.temporal_axes.resolved),
            )
            .await?
            {
                subgraph.insert_vertex(vertex_id, data_type);
            }
        }

        Ok(())
    }

    async fn read_property_types_by_ids(
        &self,
        vertex_ids: impl IntoIterator<Item = &PropertyTypeVertexId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        for vertex_id in vertex_ids {
            for property_type in <Self as Read<PropertyTypeWithMetadata>>::read_vec(
                self,
                &PropertyTypeWithMetadata::create_filter_for_vertex_id(vertex_id),
                Some(&subgraph.temporal_axes.resolved),
            )
            .await?
            {
                subgraph.insert_vertex(vertex_id, property_type);
            }
        }

        Ok(())
    }

    async fn read_entity_types_by_ids(
        &self,
        vertex_ids: impl IntoIterator<Item = &EntityTypeVertexId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        for vertex_id in vertex_ids {
            for enttity_type in <Self as Read<EntityTypeWithMetadata>>::read_vec(
                self,
                &EntityTypeWithMetadata::create_filter_for_vertex_id(vertex_id),
                Some(&subgraph.temporal_axes.resolved),
            )
            .await?
            {
                subgraph.insert_vertex(vertex_id, enttity_type);
            }
        }

        Ok(())
    }

    async fn read_entities_by_ids(
        &self,
        vertex_ids: impl IntoIterator<Item = &EntityEditionId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        for edition_id in vertex_ids {
            for entity in <Self as Read<Entity>>::read_vec(
                self,
                &Filter::<Entity>::Equal(
                    Some(FilterExpression::Path(EntityQueryPath::EditionId)),
                    Some(FilterExpression::Parameter(Parameter::Uuid(
                        edition_id.as_uuid(),
                    ))),
                ),
                Some(&subgraph.temporal_axes.resolved),
            )
            .await?
            {
                subgraph.insert_vertex(
                    &entity.vertex_id(subgraph.temporal_axes.resolved.variable_time_axis()),
                    entity,
                );
            }
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
    pub async fn load_vertices<C: AsClient>(
        &self,
        store: &PostgresStore<C>,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        store
            .read_data_types_by_ids(&self.data_types.vertex_ids, subgraph)
            .await?;
        store
            .read_property_types_by_ids(&self.property_types.vertex_ids, subgraph)
            .await?;
        store
            .read_entity_types_by_ids(&self.entity_types.vertex_ids, subgraph)
            .await?;
        store
            .read_entities_by_ids(&self.entities.edition_ids, subgraph)
            .await?;

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
