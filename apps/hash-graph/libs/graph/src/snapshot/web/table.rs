use graph_types::owned_by_id::OwnedById;
use postgres_types::ToSql;

#[derive(Debug, ToSql)]
#[postgres(name = "webs")]
pub struct WebRow {
    pub web_id: OwnedById,
}
