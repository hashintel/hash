use hash_graph_authorization::policies::{Effect, PolicyId, resource::ResourceConstraint};
use hash_graph_temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
use postgres_types::Json;
use type_system::principal::{PrincipalId, PrincipalType};

use crate::store::postgres::query::{
    ColumnName, PostgresType, Table, TableName,
    rows::{ColumnParameters, PostgresRow},
    table::DatabaseColumn,
};

#[derive(Debug)]
pub struct PolicyRow {
    pub id: PolicyId,
}

#[derive(Debug)]
pub struct PolicyEditionRow {
    pub id: PolicyId,
    pub name: Option<String>,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
    pub effect: Effect,
    pub principal_id: Option<PrincipalId>,
    pub principal_type: Option<PrincipalType>,
    pub actor_type: Option<PrincipalType>,
    pub resource_constraint: Option<Json<ResourceConstraint>>,
}

#[derive(Debug)]
pub struct PolicyActionRow {
    pub policy_id: PolicyId,
    pub action_name: String,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Policy {
    Id,
}

impl DatabaseColumn<'_> for Policy {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Id => "id".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Id => PostgresType::Uuid,
        }
    }
}

impl PostgresRow for PolicyRow {
    type Column = Policy;

    fn table() -> TableName<'static> {
        Table::Policy.into()
    }

    fn columnar_parameters(rows: &[Self]) -> Vec<(Policy, ColumnParameters<'_>)> {
        let mut ids = Vec::with_capacity(rows.len());
        for Self { id } in rows {
            ids.push(id);
        }
        vec![(Policy::Id, ids.into())]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PolicyEdition {
    Id,
    Name,
    TransactionTime,
    Effect,
    PrincipalId,
    PrincipalType,
    ActorType,
    ResourceConstraint,
}

impl DatabaseColumn<'_> for PolicyEdition {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Id => "id".into(),
            Self::Name => "name".into(),
            Self::TransactionTime => "transaction_time".into(),
            Self::Effect => "effect".into(),
            Self::PrincipalId => "principal_id".into(),
            Self::PrincipalType => "principal_type".into(),
            Self::ActorType => "actor_type".into(),
            Self::ResourceConstraint => "resource_constraint".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Id | Self::PrincipalId => PostgresType::Uuid,
            Self::Name => PostgresType::Text,
            Self::TransactionTime => PostgresType::TstzRange,
            Self::Effect => PostgresType::PolicyEffect,
            Self::PrincipalType | Self::ActorType => PostgresType::PrincipalType,
            Self::ResourceConstraint => PostgresType::JsonB,
        }
    }
}

impl PostgresRow for PolicyEditionRow {
    type Column = PolicyEdition;

    fn table() -> TableName<'static> {
        Table::PolicyEdition.into()
    }

    fn columnar_parameters(rows: &[Self]) -> Vec<(PolicyEdition, ColumnParameters<'_>)> {
        let mut ids = Vec::with_capacity(rows.len());
        let mut names = Vec::with_capacity(rows.len());
        let mut transaction_times = Vec::with_capacity(rows.len());
        let mut effects = Vec::with_capacity(rows.len());
        let mut principal_ids = Vec::with_capacity(rows.len());
        let mut principal_types = Vec::with_capacity(rows.len());
        let mut actor_types = Vec::with_capacity(rows.len());
        let mut resource_constraints = Vec::with_capacity(rows.len());
        for Self {
            id,
            name,
            transaction_time,
            effect,
            principal_id,
            principal_type,
            actor_type,
            resource_constraint,
        } in rows
        {
            ids.push(id);
            names.push(name);
            transaction_times.push(transaction_time);
            effects.push(effect);
            principal_ids.push(principal_id);
            principal_types.push(principal_type);
            actor_types.push(actor_type);
            resource_constraints.push(resource_constraint);
        }
        vec![
            (PolicyEdition::Id, ids.into()),
            (PolicyEdition::Name, names.into()),
            (PolicyEdition::TransactionTime, transaction_times.into()),
            (PolicyEdition::Effect, effects.into()),
            (PolicyEdition::PrincipalId, principal_ids.into()),
            (PolicyEdition::PrincipalType, principal_types.into()),
            (PolicyEdition::ActorType, actor_types.into()),
            (
                PolicyEdition::ResourceConstraint,
                resource_constraints.into(),
            ),
        ]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PolicyAction {
    PolicyId,
    ActionName,
    TransactionTime,
}

impl DatabaseColumn<'_> for PolicyAction {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::PolicyId => "policy_id".into(),
            Self::ActionName => "action_name".into(),
            Self::TransactionTime => "transaction_time".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::PolicyId => PostgresType::Uuid,
            Self::ActionName => PostgresType::Text,
            Self::TransactionTime => PostgresType::TstzRange,
        }
    }
}

impl PostgresRow for PolicyActionRow {
    type Column = PolicyAction;

    fn table() -> TableName<'static> {
        Table::PolicyAction.into()
    }

    fn columnar_parameters(rows: &[Self]) -> Vec<(PolicyAction, ColumnParameters<'_>)> {
        let mut policy_ids = Vec::with_capacity(rows.len());
        let mut action_names = Vec::with_capacity(rows.len());
        let mut transaction_times = Vec::with_capacity(rows.len());
        for Self {
            policy_id,
            action_name,
            transaction_time,
        } in rows
        {
            policy_ids.push(policy_id);
            action_names.push(action_name);
            transaction_times.push(transaction_time);
        }
        vec![
            (PolicyAction::PolicyId, policy_ids.into()),
            (PolicyAction::ActionName, action_names.into()),
            (PolicyAction::TransactionTime, transaction_times.into()),
        ]
    }
}
