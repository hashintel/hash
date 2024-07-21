use smol_str::SmolStr;

use crate::symbol::Symbol;

pub struct Signature<'a> {
    generics: Box<[Generic<'a>]>,

    arguments: Box<[Argument<'a>]>,

    r#return: Return<'a>,
}

pub struct Generic<'a> {
    name: Symbol,
    bounds: Box<[Symbol]>,
}

pub struct Argument<'a> {
    name: Symbol,
    r#type: Symbol,
}

pub struct Return<'a> {
    r#type: Symbol,
}
