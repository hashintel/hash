use query_builder_derive::QueryBuilder;

#[derive(QueryBuilder)]
pub enum QueryPath {
    #[builder(next = "remote")]
    Nested,
}

fn main() {}
