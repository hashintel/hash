use query_builder_derive::QueryBuilder;

#[derive(QueryBuilder)]
pub enum QueryPath {
    #[builder(next = "remote")]
    Nested { a: u8, b: u16 },
}

fn main() {}
