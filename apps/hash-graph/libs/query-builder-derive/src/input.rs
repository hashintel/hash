// will be removed soon, unused because we're only parsing right now
#![expect(dead_code)]

use proc_macro::{Ident, TokenTree};

#[derive(Debug)]
pub(crate) struct QueryBuilderInput {
    pub variants: Vec<QueryBuilderVariant>,
}

#[derive(Debug)]
pub enum Redirect {
    Remote(Vec<TokenTree>),
    This,
}

#[derive(Debug)]
pub enum QueryBuilderField {
    Bottom,
    Redirect(Redirect),
    // TODO: EntityEdge, EntityTypeEdge
    Complex,
    Properties,
    Skip,
}

#[derive(Debug)]
pub(crate) struct QueryBuilderVariant {
    pub name: Ident,
    pub field: QueryBuilderField,
}
