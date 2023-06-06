use query_builder_derive::QueryBuilder;

#[derive(QueryBuilder)]
pub enum TypeQueryPath {}

#[derive(QueryBuilder)]
pub enum QueryPath {
    #[builder(next = "remote")]
    Nested(TypeQueryPath),
}

fn main() {}
