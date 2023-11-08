use error_stack::{Result, ResultExt};
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::{EntityId, EntityUuid},
    web::WebId,
};

use crate::{
    backend::{
        CheckError, CheckResponse, ModifyRelationError, ModifyRelationshipOperation, ReadError,
        ZanzibarBackend,
    },
    schema::{
        AccountGroupPermission, AccountGroupRelationAndSubject, DataTypeId, DataTypePermission,
        DataTypeRelationAndSubject, EntityPermission, EntityRelationAndSubject, EntityTypeId,
        EntityTypePermission, EntityTypeRelationAndSubject, PropertyTypeId, PropertyTypePermission,
        PropertyTypeRelationAndSubject, WebPermission, WebRelationAndSubject,
    },
    zanzibar::{types::RelationshipFilter, Consistency, Zookie},
    AuthorizationApi,
};

#[derive(Debug, Clone)]
pub struct ZanzibarClient<B> {
    backend: B,
}

impl<B> ZanzibarClient<B> {
    pub const fn new(backend: B) -> Self {
        Self { backend }
    }
}

impl<B> AuthorizationApi for ZanzibarClient<B>
where
    B: ZanzibarBackend + Send + Sync,
{
    ////////////////////////////////////////////////////////////////////////////
    // Account group authorization
    ////////////////////////////////////////////////////////////////////////////
    async fn check_account_group_permission(
        &self,
        actor: AccountId,
        permission: AccountGroupPermission,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(&account_group, &permission, &actor, consistency)
            .await
    }

    async fn modify_account_group_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                AccountGroupId,
                AccountGroupRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .modify_relationships(relationships.into_iter().map(
                |(operation, account_group_id, relation)| (operation, (account_group_id, relation)),
            ))
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    ////////////////////////////////////////////////////////////////////////////
    // Web authorization
    ////////////////////////////////////////////////////////////////////////////
    async fn check_web_permission(
        &self,
        actor: AccountId,
        permission: WebPermission,
        web: WebId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(&web, &permission, &actor, consistency)
            .await
    }

    async fn modify_web_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (ModifyRelationshipOperation, WebId, WebRelationAndSubject),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .modify_relationships(
                relationships
                    .into_iter()
                    .map(|(operation, web_id, relation)| (operation, (web_id, relation))),
            )
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn get_web_relations(
        &self,
        web: WebId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<WebRelationAndSubject>, ReadError> {
        Ok(self
            .backend
            .read_relations::<(WebId, WebRelationAndSubject)>(
                RelationshipFilter::from_resource(web),
                consistency,
            )
            .await
            .change_context(ReadError)?
            .into_iter()
            .map(|(_, relation)| relation)
            .collect())
    }

    async fn modify_entity_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                EntityId,
                EntityRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .modify_relationships(relationships.into_iter().map(
                |(operation, entity_id, relation)| (operation, (entity_id.entity_uuid, relation)),
            ))
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn check_entity_permission(
        &self,
        actor: AccountId,
        permission: EntityPermission,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(&entity.entity_uuid, &permission, &actor, consistency)
            .await
    }

    async fn get_entity_relations(
        &self,
        entity: EntityId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<EntityRelationAndSubject>, ReadError> {
        Ok(self
            .backend
            .read_relations::<(EntityUuid, EntityRelationAndSubject)>(
                RelationshipFilter::from_resource(entity.entity_uuid),
                consistency,
            )
            .await
            .change_context(ReadError)?
            .into_iter()
            .map(|(_, relation)| relation)
            .collect())
    }

    async fn modify_entity_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                EntityTypeId,
                EntityTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .modify_relationships(
                relationships
                    .into_iter()
                    .map(|(operation, entity_type, relation)| (operation, (entity_type, relation))),
            )
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn check_entity_type_permission(
        &self,
        actor: AccountId,
        permission: EntityTypePermission,
        entity_type: EntityTypeId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(&entity_type, &permission, &actor, consistency)
            .await
    }

    async fn get_entity_type_relations(
        &self,
        entity_type: EntityTypeId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<EntityTypeRelationAndSubject>, ReadError> {
        Ok(self
            .backend
            .read_relations::<(EntityTypeId, EntityTypeRelationAndSubject)>(
                RelationshipFilter::from_resource(entity_type),
                consistency,
            )
            .await
            .change_context(ReadError)?
            .into_iter()
            .map(|(_, relation)| relation)
            .collect())
    }

    async fn modify_property_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                PropertyTypeId,
                PropertyTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .modify_relationships(
                relationships
                    .into_iter()
                    .map(|(operation, property_type, relation)| {
                        (operation, (property_type, relation))
                    }),
            )
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn check_property_type_permission(
        &self,
        actor: AccountId,
        permission: PropertyTypePermission,
        property_type: PropertyTypeId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(&property_type, &permission, &actor, consistency)
            .await
    }

    async fn get_property_type_relations(
        &self,
        property_type: PropertyTypeId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<PropertyTypeRelationAndSubject>, ReadError> {
        Ok(self
            .backend
            .read_relations::<(PropertyTypeId, PropertyTypeRelationAndSubject)>(
                RelationshipFilter::from_resource(property_type),
                consistency,
            )
            .await
            .change_context(ReadError)?
            .into_iter()
            .map(|(_, relation)| relation)
            .collect())
    }

    async fn modify_data_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                DataTypeId,
                DataTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .modify_relationships(
                relationships
                    .into_iter()
                    .map(|(operation, data_type, relation)| (operation, (data_type, relation))),
            )
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn check_data_type_permission(
        &self,
        actor: AccountId,
        permission: DataTypePermission,
        data_type: DataTypeId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(&data_type, &permission, &actor, consistency)
            .await
    }

    async fn get_data_type_relations(
        &self,
        data_type: DataTypeId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<DataTypeRelationAndSubject>, ReadError> {
        Ok(self
            .backend
            .read_relations::<(DataTypeId, DataTypeRelationAndSubject)>(
                RelationshipFilter::from_resource(data_type),
                consistency,
            )
            .await
            .change_context(ReadError)?
            .into_iter()
            .map(|(_, relation)| relation)
            .collect())
    }
}
