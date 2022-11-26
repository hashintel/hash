// NOTE: this is still a prototype, and might be deleted at any stage, this minimally expands on the
// existing schema things, but instead allows for deeply nested values.

use alloc::{boxed::Box, collections::BTreeMap, string::String};
use core::any::{Any, TypeId};

pub trait SchemaT: Any {
    fn schema(doc: &mut Document) -> Schema;
}

// TODO: most likely (in 0.2) we want to actually have a proper schema
// TODO: this is currently completely untyped, we might want to adhere to a standard, like
//  JSON-Schema or OpenAPI
//  The problem here mainly is: which crate to use, one can use utoipa (but that has significant
//  overhead)  there's no real library out there that properly just provides the types
//  necessary.
#[derive(serde::Serialize)]
pub struct Schema {
    #[serde(rename = "type")]
    ty: String,
    #[serde(flatten)]
    other: BTreeMap<String, Box<dyn erased_serde::Serialize + Send + Sync>>,
}

impl Schema {
    #[must_use]
    pub fn new(ty: impl Into<String>) -> Self {
        Self {
            ty: ty.into(),
            other: BTreeMap::new(),
        }
    }

    pub(crate) fn ty(&self) -> &str {
        &self.ty
    }

    #[must_use]
    pub fn with(
        mut self,
        key: impl Into<String>,
        value: impl erased_serde::Serialize + Send + Sync + 'static,
    ) -> Self {
        self.other.insert(key.into(), Box::new(value));

        self
    }

    pub fn set(
        &mut self,
        key: impl Into<String>,
        value: impl erased_serde::Serialize + Send + Sync + 'static,
    ) -> &mut Self {
        self.other.insert(key.into(), Box::new(value));

        self
    }
}

#[derive(serde::Serialize)]
pub struct Reference {
    // we need another way of getting a stable reference, as we are unable to serialize a `TypeId`,
    // we can use the path to a specific type or an auto-incrementing counter.
    // the path to a specific type, as well as a self-chosen name bring more deterministic
    // behaviour, but `schemars` has shown that they are unreliable.
    #[serde(rename = "$ref")]
    r: TypeId,
}

pub struct Document {
    target: Schema,
    references: BTreeMap<TypeId, Option<Schema>>,
}

impl Document {
    pub fn new<T: SchemaT>() -> Self {
        let mut this = Self {
            target: Schema::new("null"),
            references: BTreeMap::new(),
        };

        this.target = T::schema(&mut this);
        this
    }

    pub fn add<T: SchemaT>(&mut self) -> Reference {
        let type_id = TypeId::of::<T>();

        // we already have the value inserted, therefore we do not need to add it again
        if self.references.contains_key(&type_id) {
            return Reference { r: type_id };
        };

        // we do not yet have the schema, to avoid cyclic references we insert a dummy value which
        // isn't valid yet, but will return a reference if this function is called again
        self.references.insert(type_id, None);
        let schema = T::schema(self);
        self.references.insert(type_id, Some(schema));

        Reference { r: type_id }
    }
}
