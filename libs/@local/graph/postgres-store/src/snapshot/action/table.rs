use postgres_types::ToSql;

use crate::store::postgres::query::{
    PostgresType, Table, TableName, rows::PostgresRow, table::DatabaseColumn,
};

#[derive(Debug)]
pub struct ActionRow {
    pub name: String,
    pub parent: Option<String>,
}

#[derive(Debug)]
pub struct ActionHierarchyRow {
    pub parent_name: String,
    pub child_name: String,
    pub depth: i32,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Action {
    Name,
    Parent,
}

impl DatabaseColumn for Action {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Name => "name",
            Self::Parent => "parent",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Name | Self::Parent => PostgresType::Text,
        }
    }
}

impl PostgresRow for ActionRow {
    type Column = Action;

    fn table() -> TableName<'static> {
        Table::Action.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(Action, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut names = Vec::with_capacity(rows.len());
        let mut parents = Vec::with_capacity(rows.len());
        for Self { name, parent } in rows {
            names.push(name);
            parents.push(parent);
        }
        vec![
            (Action::Name, Box::new(names)),
            (Action::Parent, Box::new(parents)),
        ]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ActionHierarchy {
    ParentName,
    ChildName,
    Depth,
}

impl DatabaseColumn for ActionHierarchy {
    fn as_str(&self) -> &'static str {
        match self {
            Self::ParentName => "parent_name",
            Self::ChildName => "child_name",
            Self::Depth => "depth",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::ParentName | Self::ChildName => PostgresType::Text,
            Self::Depth => PostgresType::Int4,
        }
    }
}

impl PostgresRow for ActionHierarchyRow {
    type Column = ActionHierarchy;

    fn table() -> TableName<'static> {
        Table::ActionHierarchy.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(ActionHierarchy, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut parent_names = Vec::with_capacity(rows.len());
        let mut child_names = Vec::with_capacity(rows.len());
        let mut depths = Vec::with_capacity(rows.len());
        for Self {
            parent_name,
            child_name,
            depth,
        } in rows
        {
            parent_names.push(parent_name);
            child_names.push(child_name);
            depths.push(depth);
        }
        vec![
            (ActionHierarchy::ParentName, Box::new(parent_names)),
            (ActionHierarchy::ChildName, Box::new(child_names)),
            (ActionHierarchy::Depth, Box::new(depths)),
        ]
    }
}
