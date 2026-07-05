use hash_graph_authorization::policies::{Effect, PolicyId, resource::ResourceConstraint};
use hash_graph_temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
use postgres_types::{Json, ToSql};
use type_system::principal::{PrincipalId, PrincipalType};

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

use crate::store::postgres::query::{
    PostgresType, Table, TableName, rows::PostgresRow, table::DatabaseColumn,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Policy {
    Id,
}

impl DatabaseColumn for Policy {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Id => "id",
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

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(Policy, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ids = Vec::with_capacity(rows.len());
        for Self { id } in rows {
            ids.push(id);
        }
        vec![(Policy::Id, Box::new(ids))]
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

impl DatabaseColumn for PolicyEdition {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Id => "id",
            Self::Name => "name",
            Self::TransactionTime => "transaction_time",
            Self::Effect => "effect",
            Self::PrincipalId => "principal_id",
            Self::PrincipalType => "principal_type",
            Self::ActorType => "actor_type",
            Self::ResourceConstraint => "resource_constraint",
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

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(PolicyEdition, Box<dyn ToSql + Send + Sync + 'r>)> {
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
            (PolicyEdition::Id, Box::new(ids)),
            (PolicyEdition::Name, Box::new(names)),
            (PolicyEdition::TransactionTime, Box::new(transaction_times)),
            (PolicyEdition::Effect, Box::new(effects)),
            (PolicyEdition::PrincipalId, Box::new(principal_ids)),
            (PolicyEdition::PrincipalType, Box::new(principal_types)),
            (PolicyEdition::ActorType, Box::new(actor_types)),
            (
                PolicyEdition::ResourceConstraint,
                Box::new(resource_constraints),
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

impl DatabaseColumn for PolicyAction {
    fn as_str(&self) -> &'static str {
        match self {
            Self::PolicyId => "policy_id",
            Self::ActionName => "action_name",
            Self::TransactionTime => "transaction_time",
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

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(PolicyAction, Box<dyn ToSql + Send + Sync + 'r>)> {
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
            (PolicyAction::PolicyId, Box::new(policy_ids)),
            (PolicyAction::ActionName, Box::new(action_names)),
            (PolicyAction::TransactionTime, Box::new(transaction_times)),
        ]
    }
}
