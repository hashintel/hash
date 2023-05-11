use query_builder_derive::QueryBuilder;

#[derive(QueryBuilder)]
#[builder(unknown = "value")]
pub enum QueryPath {
    Nested,
}

fn main() {}
