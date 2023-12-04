use graph_types::provenance::OwnedById;
use postgres_types::ToSql;

#[derive(Debug, ToSql)]
#[postgres(name = "webs")]
pub struct WebRow {
    pub web_id: OwnedById,
}
