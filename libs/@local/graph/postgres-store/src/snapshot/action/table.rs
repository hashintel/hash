use postgres_types::ToSql;

#[derive(Debug, ToSql)]
#[postgres(name = "action")]
pub struct ActionRow {
    pub name: String,
    pub parent: Option<String>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "action_hierarchy")]
pub struct ActionHierarchyRow {
    pub parent_name: String,
    pub child_name: String,
    pub depth: i32,
}
