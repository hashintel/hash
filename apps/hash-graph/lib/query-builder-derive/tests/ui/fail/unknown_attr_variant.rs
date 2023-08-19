use query_builder_derive::QueryBuilder;

#[derive(QueryBuilder)]
pub enum QueryPath {
    #[builder(unknown = "value")]
    Nested,
}

fn main() {}
