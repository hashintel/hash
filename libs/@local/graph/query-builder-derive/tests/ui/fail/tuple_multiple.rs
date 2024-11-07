use query_builder_derive::QueryBuilder;

#[derive(QueryBuilder)]
pub enum QueryPath {
    #[builder(next = "remote")]
    Nested(u8, u16),
}

fn main() {}
