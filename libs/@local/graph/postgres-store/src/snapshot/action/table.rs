use crate::store::postgres::query::{
    ColumnName, PostgresType, Table, TableName,
    rows::{ColumnParameters, PostgresRow},
    table::DatabaseColumn,
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

impl DatabaseColumn<'_> for Action {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Name => "name".into(),
            Self::Parent => "parent".into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(Action, ColumnParameters<'_>)> {
        let mut names = Vec::with_capacity(rows.len());
        let mut parents = Vec::with_capacity(rows.len());
        for Self { name, parent } in rows {
            names.push(name);
            parents.push(parent);
        }
        vec![
            (Action::Name, names.into()),
            (Action::Parent, parents.into()),
        ]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ActionHierarchy {
    ParentName,
    ChildName,
    Depth,
}

impl DatabaseColumn<'_> for ActionHierarchy {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::ParentName => "parent_name".into(),
            Self::ChildName => "child_name".into(),
            Self::Depth => "depth".into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(ActionHierarchy, ColumnParameters<'_>)> {
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
            (ActionHierarchy::ParentName, parent_names.into()),
            (ActionHierarchy::ChildName, child_names.into()),
            (ActionHierarchy::Depth, depths.into()),
        ]
    }
}
