use std::marker::PhantomData;

use query_builder_derive::QueryBuilder;

#[derive(QueryBuilder)]
pub enum QueryPath {
    #[builder(next = "this")]
    Nested(Box<Self>),
}

fn main() {}
