use std::collections::HashMap;

use error_stack::{Report, Result, ResultExt};
use futures::TryStreamExt;
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::{EntityId, EntityUuid},
    owned_by_id::OwnedById,
};

use crate::{
    backend::{
        CheckError, CheckResponse, ModifyRelationError, ModifyRelationshipOperation, ReadError,
        RpcError, ZanzibarBackend,
    },
    schema::{
        AccountGroupPermission, AccountGroupRelationAndSubject, DataTypeId, DataTypePermission,
        DataTypeRelationAndSubject, EntityPermission, EntityRelationAndSubject, EntitySetting,
        EntityTypeId, EntityTypePermission, EntityTypeRelationAndSubject, PropertyTypeId,
        PropertyTypePermission, PropertyTypeRelationAndSubject, SettingName,
        SettingRelationAndSubject, SettingSubject, WebPermission, WebRelationAndSubject,
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

    pub fn into_backend(self) -> B {
        self.backend
    }
}

impl<B> AuthorizationApi for ZanzibarClient<B>
where
    B: ZanzibarBackend + Send + Sync,
{
    async fn seed(&mut self) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .modify_relationships([
                (
                    ModifyRelationshipOperation::Touch,
                    (
                        SettingName::Entity(EntitySetting::AdministratorFromWeb),
                        SettingRelationAndSubject::Administrator {
                            subject: SettingSubject::Public,
                            level: 0,
                        },
                    ),
                ),
                (
                    ModifyRelationshipOperation::Touch,
                    (
                        SettingName::Entity(EntitySetting::UpdateFromWeb),
                        SettingRelationAndSubject::Update {
                            subject: SettingSubject::Public,
                            level: 0,
                        },
                    ),
                ),
                (
                    ModifyRelationshipOperation::Touch,
                    (
                        SettingName::Entity(EntitySetting::ViewFromWeb),
                        SettingRelationAndSubject::View {
                            subject: SettingSubject::Public,
                            level: 0,
                        },
                    ),
                ),
            ])
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    ////////////////////////////////////////////////////////////////////////////
    // Account group authorization
    ////////////////////////////////////////////////////////////////////////////
    #[tracing::instrument(level = "info", skip(self))]
    async fn check_account_group_permission(
        &self,
        actor: AccountId,
        permission: AccountGroupPermission,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check_permission(&account_group, &permission, &actor, consistency)
            .await
    }

    #[tracing::instrument(level = "info", skip(self, relationships))]
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
    #[tracing::instrument(level = "info", skip(self))]
    async fn check_web_permission(
        &self,
        actor: AccountId,
        permission: WebPermission,
        web: OwnedById,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check_permission(&web, &permission, &actor, consistency)
            .await
    }

    #[tracing::instrument(level = "info", skip(self, relationships))]
    async fn modify_web_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                OwnedById,
                WebRelationAndSubject,
            ),
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

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_web_relations(
        &self,
        web: OwnedById,
        consistency: Consistency<'static>,
    ) -> Result<Vec<WebRelationAndSubject>, ReadError> {
        self.backend
            .read_relations::<(OwnedById, WebRelationAndSubject)>(
                RelationshipFilter::from_resource(web),
                consistency,
            )
            .await
            .change_context(ReadError)?
            .map_ok(|(_, relation)| relation)
            .try_collect()
            .await
    }

    #[tracing::instrument(level = "info", skip(self, relationships))]
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

    #[tracing::instrument(level = "info", skip(self))]
    async fn check_entity_permission(
        &self,
        actor: AccountId,
        permission: EntityPermission,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check_permission(&entity.entity_uuid, &permission, &actor, consistency)
            .await
    }

    #[tracing::instrument(level = "info", skip(self, entities))]
    async fn check_entities_permission(
        &self,
        actor: AccountId,
        permission: EntityPermission,
        entities: impl IntoIterator<Item = EntityId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> Result<(HashMap<EntityUuid, bool>, Zookie<'static>), CheckError> {
        let response = self
            .backend
            .check_permissions(
                entities
                    .into_iter()
                    .map(move |entity| (entity.entity_uuid, permission, actor)),
                consistency,
            )
            .await?;
        let mut status = Ok::<(), Report<RpcError>>(());
        let permissions = response
            .permissions
            .into_iter()
            .filter_map(|item| {
                let permission = match item.has_permission {
                    Ok(permissionship) => permissionship,
                    Err(error) => {
                        if let Err(report) = &mut status {
                            report.extend_one(Report::new(error));
                        } else {
                            status = Err(Report::new(error));
                        }
                        return None;
                    }
                };
                Some((item.resource, permission))
            })
            .collect();

        status
            .change_context(CheckError)
            .map(|()| (permissions, response.checked_at))
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_entity_relations(
        &self,
        entity: EntityId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<EntityRelationAndSubject>, ReadError> {
        self.backend
            .read_relations::<(EntityUuid, EntityRelationAndSubject)>(
                RelationshipFilter::from_resource(entity.entity_uuid),
                consistency,
            )
            .await
            .change_context(ReadError)?
            .map_ok(|(_, relation)| relation)
            .try_collect()
            .await
    }

    #[tracing::instrument(level = "info", skip(self, relationships))]
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

    #[tracing::instrument(level = "info", skip(self))]
    async fn check_entity_type_permission(
        &self,
        actor: AccountId,
        permission: EntityTypePermission,
        entity_type: EntityTypeId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check_permission(&entity_type, &permission, &actor, consistency)
            .await
    }

    #[tracing::instrument(level = "info", skip(self, entity_types))]
    async fn check_entity_types_permission(
        &self,
        actor: AccountId,
        permission: EntityTypePermission,
        entity_types: impl IntoIterator<Item = EntityTypeId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> Result<(HashMap<EntityTypeId, bool>, Zookie<'static>), CheckError> {
        let response = self
            .backend
            .check_permissions(
                entity_types
                    .into_iter()
                    .map(move |entity_type| (entity_type, permission, actor)),
                consistency,
            )
            .await?;
        let mut status = Ok::<(), Report<RpcError>>(());
        let permissions = response
            .permissions
            .into_iter()
            .filter_map(|item| {
                let permission = match item.has_permission {
                    Ok(permissionship) => permissionship,
                    Err(error) => {
                        if let Err(report) = &mut status {
                            report.extend_one(Report::new(error));
                        } else {
                            status = Err(Report::new(error));
                        }
                        return None;
                    }
                };
                Some((item.resource, permission))
            })
            .collect();

        status
            .change_context(CheckError)
            .map(|()| (permissions, response.checked_at))
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_entity_type_relations(
        &self,
        entity_type: EntityTypeId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<EntityTypeRelationAndSubject>, ReadError> {
        self.backend
            .read_relations::<(EntityTypeId, EntityTypeRelationAndSubject)>(
                RelationshipFilter::from_resource(entity_type),
                consistency,
            )
            .await
            .change_context(ReadError)?
            .map_ok(|(_, relation)| relation)
            .try_collect()
            .await
    }

    #[tracing::instrument(level = "info", skip(self, relationships))]
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

    #[tracing::instrument(level = "info", skip(self))]
    async fn check_property_type_permission(
        &self,
        actor: AccountId,
        permission: PropertyTypePermission,
        property_type: PropertyTypeId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check_permission(&property_type, &permission, &actor, consistency)
            .await
    }

    #[tracing::instrument(level = "info", skip(self, property_types))]
    async fn check_property_types_permission(
        &self,
        actor: AccountId,
        permission: PropertyTypePermission,
        property_types: impl IntoIterator<Item = PropertyTypeId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> Result<(HashMap<PropertyTypeId, bool>, Zookie<'static>), CheckError> {
        let response = self
            .backend
            .check_permissions(
                property_types
                    .into_iter()
                    .map(move |property_type| (property_type, permission, actor)),
                consistency,
            )
            .await?;
        let mut status = Ok::<(), Report<RpcError>>(());
        let permissions = response
            .permissions
            .into_iter()
            .filter_map(|item| {
                let permission = match item.has_permission {
                    Ok(permissionship) => permissionship,
                    Err(error) => {
                        if let Err(report) = &mut status {
                            report.extend_one(Report::new(error));
                        } else {
                            status = Err(Report::new(error));
                        }
                        return None;
                    }
                };
                Some((item.resource, permission))
            })
            .collect();

        status
            .change_context(CheckError)
            .map(|()| (permissions, response.checked_at))
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_property_type_relations(
        &self,
        property_type: PropertyTypeId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<PropertyTypeRelationAndSubject>, ReadError> {
        self.backend
            .read_relations::<(PropertyTypeId, PropertyTypeRelationAndSubject)>(
                RelationshipFilter::from_resource(property_type),
                consistency,
            )
            .await
            .change_context(ReadError)?
            .map_ok(|(_, relation)| relation)
            .try_collect()
            .await
    }

    #[tracing::instrument(level = "info", skip(self, relationships))]
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

    #[tracing::instrument(level = "info", skip(self))]
    async fn check_data_type_permission(
        &self,
        actor: AccountId,
        permission: DataTypePermission,
        data_type: DataTypeId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check_permission(&data_type, &permission, &actor, consistency)
            .await
    }

    #[tracing::instrument(level = "info", skip(self, data_types))]
    async fn check_data_types_permission(
        &self,
        actor: AccountId,
        permission: DataTypePermission,
        data_types: impl IntoIterator<Item = DataTypeId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> Result<(HashMap<DataTypeId, bool>, Zookie<'static>), CheckError> {
        let response = self
            .backend
            .check_permissions(
                data_types
                    .into_iter()
                    .map(move |data_type| (data_type, permission, actor)),
                consistency,
            )
            .await?;
        let mut status = Ok::<(), Report<RpcError>>(());
        let permissions = response
            .permissions
            .into_iter()
            .filter_map(|item| {
                let permission = match item.has_permission {
                    Ok(permissionship) => permissionship,
                    Err(error) => {
                        if let Err(report) = &mut status {
                            report.extend_one(Report::new(error));
                        } else {
                            status = Err(Report::new(error));
                        }
                        return None;
                    }
                };
                Some((item.resource, permission))
            })
            .collect();

        status
            .change_context(CheckError)
            .map(|()| (permissions, response.checked_at))
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_data_type_relations(
        &self,
        data_type: DataTypeId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<DataTypeRelationAndSubject>, ReadError> {
        self.backend
            .read_relations::<(DataTypeId, DataTypeRelationAndSubject)>(
                RelationshipFilter::from_resource(data_type),
                consistency,
            )
            .await
            .change_context(ReadError)?
            .map_ok(|(_, relation)| relation)
            .try_collect()
            .await
    }
}
