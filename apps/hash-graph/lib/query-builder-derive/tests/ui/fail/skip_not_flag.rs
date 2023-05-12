use query_builder_derive::QueryBuilder;

#[derive(QueryBuilder)]
pub enum QueryPath {
    #[builder(skip = "false")]
    Nested,
}

fn main() {}
