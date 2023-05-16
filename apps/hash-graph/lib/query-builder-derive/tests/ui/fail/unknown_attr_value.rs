use query_builder_derive::QueryBuilder;

#[derive(QueryBuilder)]
pub enum QueryPath {
    Nested(#[builder(unknown = "value")] u8),
}

fn main() {}
