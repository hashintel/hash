// NOTE: this is still a prototype, and might be deleted at any stage, this minimally expands on the
// existing schema things, but instead allows for deeply nested values.

use alloc::{boxed::Box, collections::BTreeMap, format, string::String};
use core::any::{type_name, TypeId};

use serde::{ser::SerializeMap, Serialize, Serializer};

pub trait Describe: Sized + 'static {
    fn schema(doc: &mut Document) -> Schema;

    #[must_use]
    fn document() -> Document {
        Document::new::<Self>()
    }
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
    id: TypeId,
    schemas: BTreeMap<TypeId, Schema>,
    references: BTreeMap<TypeId, Reference>,

    counter: Counter,
}

impl Document {
    #[must_use]
    pub fn new<T: Describe>() -> Self {
        let mut this = Self {
            id: TypeId::of::<T>(),
            schemas: BTreeMap::default(),
            references: BTreeMap::default(),
            counter: Counter::new(),
        };

        this.add::<T>();
        this
    }

    // new() ensures that an item of reference always exists
    #[must_use]
    pub fn schema(&self) -> &Schema {
        self.schemas
            .get(&self.id)
            .expect("`new()` should have created a schema for the main schema")
    }

    #[must_use]
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

        let id = self
            .references
            .get(&self.id)
            .expect("`new()` should have created a schema for the main schema");
        map.serialize_entry("$ref", &id.as_string())?;
        map.serialize_entry("$defs", &SerializeDefinitions {
            schemas: &self.schemas,
            references: &self.references,
        })?;

        map.end()
    }
}

pub(crate) mod visitor {
    use crate::{schema::Describe, Document, Schema};

    pub(crate) struct NullSchema;
    impl Describe for NullSchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("null")
        }
    }

    // TODO: below here these are temporary until stdlib is implemented
    pub(crate) struct BoolSchema;
    impl Describe for BoolSchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("boolean")
        }
    }

    pub(crate) struct NumberSchema;
    impl Describe for NumberSchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("number")
        }
    }

    pub(crate) struct CharSchema;
    impl Describe for CharSchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("string")
                .with("minLength", 1)
                .with("maxLength", 1)
        }
    }

    pub(crate) struct StringSchema;
    impl Describe for StringSchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("string")
        }
    }

    // TODO: binary is not a valid json-schema type
    pub(crate) struct BinarySchema;
    impl Describe for BinarySchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("binary")
        }
    }

    pub(crate) struct ArraySchema;
    impl Describe for ArraySchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("array")
        }
    }

    pub(crate) struct ObjectSchema;
    impl Describe for ObjectSchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("object")
        }
    }

    pub(crate) struct I8Schema;
    impl Describe for I8Schema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", i8::MIN)
                .with("maximum", i8::MAX)
        }
    }

    pub(crate) struct I16Schema;
    impl Describe for I16Schema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", i16::MIN)
                .with("maximum", i16::MAX)
        }
    }

    pub(crate) struct I32Schema;
    impl Describe for I32Schema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", i32::MIN)
                .with("maximum", i32::MAX)
        }
    }

    pub(crate) struct I64Schema;
    impl Describe for I64Schema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", i64::MIN)
                .with("maximum", i64::MAX)
        }
    }

    pub(crate) struct I128Schema;
    impl Describe for I128Schema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", i128::MIN)
                .with("maximum", i128::MAX)
        }
    }

    pub(crate) struct ISizeSchema;
    impl Describe for ISizeSchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", isize::MIN)
                .with("maximum", isize::MAX)
        }
    }

    pub(crate) struct U8Schema;
    impl Describe for U8Schema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", u8::MIN)
                .with("maximum", u8::MAX)
        }
    }

    pub(crate) struct U16Schema;
    impl Describe for U16Schema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", u16::MIN)
                .with("maximum", u16::MAX)
        }
    }

    pub(crate) struct U32Schema;
    impl Describe for U32Schema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", u32::MIN)
                .with("maximum", u32::MAX)
        }
    }

    pub(crate) struct U64Schema;
    impl Describe for U64Schema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", u64::MIN)
                .with("maximum", u64::MAX)
        }
    }

    pub(crate) struct U128Schema;
    impl Describe for U128Schema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", u128::MIN)
                .with("maximum", u128::MAX)
        }
    }

    pub(crate) struct USizeSchema;
    impl Describe for USizeSchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", usize::MIN)
                .with("maximum", usize::MAX)
        }
    }
}
