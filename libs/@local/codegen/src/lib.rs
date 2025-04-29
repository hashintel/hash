//! # HASH Codegen
//!
//! Code generation utilities for the HASH ecosystem.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::todo)]

use alloc::borrow::Cow;
use std::collections::HashMap;

use specta::{SpectaID, datatype::NamedDataType};

use self::definitions::TypeDefinition;

extern crate alloc;

pub mod definitions;

pub mod typescript;

#[derive(Debug, Default)]
pub struct TypeCollection {
    types: HashMap<Cow<'static, str>, (SpectaID, TypeDefinition)>,
    collection: specta::TypeCollection,
    // collection: HashMap<Cow<'static, str>, Definition>,
}

impl TypeCollection {
    pub fn register<T: specta::NamedType>(&mut self) {
        self.collection.register_mut::<T>();
        let data_type = self.collection.get(T::ID).unwrap_or_else(|| unreachable!());
        self.types.insert(
            data_type.name().clone(),
            (
                data_type.sid(),
                TypeDefinition::from_specta(data_type, &self.collection),
            ),
        );
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, (&NamedDataType, &TypeDefinition))> {
        self.types.iter().map(|(name, (id, def))| {
            (
                name.as_ref(),
                (
                    self.collection.get(*id).unwrap_or_else(|| unreachable!()),
                    def,
                ),
            )
        })
    }
}
