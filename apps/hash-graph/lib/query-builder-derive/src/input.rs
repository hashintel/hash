// will be removed soon, unused because we're only parsing right now
#![allow(dead_code)]

use proc_macro::{Ident, TokenTree};

#[derive(Debug)]
pub struct QueryBuilderInput {
    pub(crate) variants: Vec<QueryBuilderVariant>,
}

#[derive(Debug)]
pub enum Next {
    This,
    Nest,
    Properties,
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
pub struct QueryBuilderVariant {
    pub(crate) name: Ident,
    pub(crate) field: QueryBuilderField,
}
