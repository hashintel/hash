// NOTE: this is still a prototype, and might be deleted at any stage, this minimally expands on the
// existing schema things, but instead allows for deeply nested values.

use alloc::{boxed::Box, collections::BTreeMap, format, string::String};
use core::any::{type_name, Any, TypeId};

use serde::{ser::SerializeMap, Serialize, Serializer};

pub trait Describe: Any {
    fn schema(doc: &mut Document) -> Schema;
}

struct SerializeSchema<'a>(&'a Schema);

impl Serialize for SerializeSchema<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.0.other.len() + 1))?;

        for (key, value) in &self.0.other {
            map.serialize_entry(key, value)?;
        }

        // make sure that type is deserialized last
        map.serialize_entry("type", &self.0.ty)?;

        map.end()
    }
}

// TODO: most likely (in 0.2) we want to actually have a proper schema
// TODO: this is currently completely untyped, we might want to adhere to a standard, like
//  JSON-Schema or OpenAPI
//  The problem here mainly is: which crate to use, one can use utoipa (but that has significant
//  overhead)  there's no real library out there that properly just provides the types
//  necessary.
// `Serialize` is not implemented to ensure that one does not accidentally create a forever
// recursing type definition
pub struct Schema {
    ty: String,
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
struct SerializeReference {
    #[serde(rename = "$ref")]
    ref_: String,
}

#[derive(Debug, Copy, Clone)]
pub struct Reference {
    id: usize,
    name: &'static str,
}

impl Reference {
    fn as_string(&self) -> String {
        let Self { id, name } = self;
        format!("#/$defs/{id}-{name}")
    }
}

impl serde::Serialize for Reference {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let schema = SerializeReference {
            ref_: self.as_string(),
        };

        serde::Serialize::serialize(&schema, serializer)
    }
}

struct Counter(usize);

impl Counter {
    const fn new() -> Self {
        Self(0)
    }

    fn fetch_add(&mut self) -> usize {
        let value = self.0;
        self.0 += 1;
        value
    }
}

struct SerializeDefinitions<'a> {
    schemas: &'a BTreeMap<TypeId, Schema>,
    references: &'a BTreeMap<TypeId, Reference>,
}

impl Serialize for SerializeDefinitions<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let Self {
            schemas,
            references,
        } = self;

        let defs = references.iter().filter_map(|(key, reference)| {
            schemas
                .get(key)
                .map(|schema| (reference, SerializeSchema(schema)))
        });

        serializer.collect_map(defs)
    }
}

pub struct Document {
    id: Reference,
    schemas: BTreeMap<TypeId, Schema>,
    references: BTreeMap<TypeId, Reference>,

    counter: Counter,
}

impl Document {
    pub fn new<T: Describe>() -> Self {
        let mut counter = Counter::new();

        let reference = Self::reference::<T>(counter.fetch_add());

        let mut this = Self {
            id: reference,
            schemas: BTreeMap::default(),
            references: BTreeMap::default(),
            counter,
        };

        this.add_by_reference::<T>(reference);
        this
    }

    pub fn reference<T: Describe>(id: usize) -> Reference {
        Reference {
            id,
            name: type_name::<T>(),
        }
    }

    fn add_by_reference<T: Describe>(&mut self, reference: Reference) {
        let type_id = TypeId::of::<T>();

        self.references.insert(type_id, reference);
        let schema = T::schema(self);
        self.schemas.insert(type_id, schema);
    }

    pub fn add<T: Describe>(&mut self) -> Reference {
        let type_id = TypeId::of::<T>();

        // we already have the value inserted, therefore we do not need to add it again
        if let Some(reference) = self.references.get(&type_id) {
            return *reference;
        };

        // we do not yet have the schema, to avoid cyclic references we already create the id
        let reference = Self::reference::<T>(self.counter.fetch_add());
        self.add_by_reference::<T>(reference);

        reference
    }
}

impl Serialize for Document {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(2))?;

        map.serialize_entry("$ref", &self.id.as_string())?;
        map.serialize_entry("$defs", &SerializeDefinitions {
            schemas: &self.schemas,
            references: &self.references,
        })?;

        map.end()
    }
}
