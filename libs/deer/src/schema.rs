// NOTE: this is still a prototype, and might be deleted at any stage, this minimally expands on the
// existing schema things, but instead allows for deeply nested values.

use alloc::collections::BTreeMap;
#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::{boxed::Box, format, string::String};
use core::any::{TypeId, type_name};

use serde::{Serialize, Serializer, ser::SerializeMap as _};

pub trait Reflection: 'static {
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

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct Reference {
    id: usize,
    name: &'static str,
}

impl Reference {
    fn as_path(&self) -> String {
        let bare = self.as_bare();
        format!("#/$defs/{bare}")
    }

    fn as_bare(&self) -> String {
        let Self { id, name } = self;
        format!("{id:04}-{name}")
    }
}

impl serde::Serialize for Reference {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let schema = SerializeReference {
            ref_: self.as_path(),
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
                .map(|schema| (reference.as_bare(), SerializeSchema(schema)))
        });

        serializer.collect_map(defs)
    }
}

#[expect(clippy::field_scoped_visibility_modifiers)]
pub struct Document {
    pub(crate) id: TypeId,
    schemas: BTreeMap<TypeId, Schema>,
    references: BTreeMap<TypeId, Reference>,

    counter: Counter,
}

impl Document {
    #[must_use]
    pub fn new<T: Reflection + ?Sized>() -> Self {
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
        &self.schemas[&self.id]
    }

    #[must_use]
    pub fn get(&self, reference: Reference) -> Option<&Schema> {
        // TODO: We're able to optimize this via a `BiMap`
        let type_id = self
            .references
            .iter()
            .find(|(_, other)| **other == reference)
            .map(|(type_id, _)| type_id)?;

        self.schemas.get(type_id)
    }

    #[must_use]
    pub fn reference<T: Reflection + ?Sized>(id: usize) -> Reference {
        Reference {
            id,
            name: type_name::<T>(),
        }
    }

    fn add_by_reference<T: Reflection + ?Sized>(&mut self, reference: Reference) {
        let type_id = TypeId::of::<T>();

        self.references.insert(type_id, reference);
        let schema = T::schema(self);
        self.schemas.insert(type_id, schema);
    }

    pub fn add<T: Reflection + ?Sized>(&mut self) -> Reference {
        let type_id = TypeId::of::<T>();

        // we already have the value inserted, therefore we do not need to add it again
        if let Some(reference) = self.references.get(&type_id) {
            return *reference;
        }

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
        map.serialize_entry("$ref", &id.as_path())?;
        map.serialize_entry(
            "$defs",
            &SerializeDefinitions {
                schemas: &self.schemas,
                references: &self.references,
            },
        )?;

        map.end()
    }
}

pub(crate) mod visitor {
    use crate::{Document, Schema, schema::Reflection};

    // TODO: below here these are temporary until stdlib is implemented
    #[expect(dead_code)]
    pub(crate) struct BoolSchema;
    impl Reflection for BoolSchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("boolean")
        }
    }

    #[cfg_attr(not(test), expect(dead_code))]
    pub(crate) struct StringSchema;
    impl Reflection for StringSchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("string")
        }
    }

    // TODO: binary is not a valid json-schema type
    pub(crate) struct BinarySchema;
    impl Reflection for BinarySchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("binary")
        }
    }

    pub(crate) struct ArraySchema;
    impl Reflection for ArraySchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("array")
        }
    }

    pub(crate) struct ObjectSchema;
    impl Reflection for ObjectSchema {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("object")
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::collections::BTreeMap;
    #[cfg_attr(feature = "std", allow(unused_imports))]
    use alloc::{boxed::Box, vec::Vec};

    use serde_json::{json, to_value};
    use similar_asserts::assert_serde_eq;

    use crate::{Document, Reflection, Schema};

    struct U8;

    impl Reflection for U8 {
        fn schema(_: &mut Document) -> Schema {
            Schema::new("integer")
                .with("minimum", u8::MIN)
                .with("maximum", u8::MAX)
        }
    }

    #[test]
    fn simple() {
        let document = U8::document();
        let document = to_value(document).expect("should be valid json");

        assert_eq!(
            document,
            json!({
              "$ref": "#/$defs/0000-deer::schema::tests::U8",
              "$defs": {
                "0000-deer::schema::tests::U8": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 255
                }
              }
            })
        );
    }

    // test for self referential
    // Reason: we don't actually use them, but it is easier to visualize the schema that way
    #[expect(unused)]
    struct Node {
        child: Box<Node>,
    }

    impl Reflection for Node {
        fn schema(doc: &mut Document) -> Schema {
            // there's a way to do this without allocations, it's just a lot more boilerplate
            let mut properties = BTreeMap::new();
            properties.insert("child", doc.add::<Self>());

            Schema::new("object")
                .with("additionalProperties", false)
                .with("properties", properties)
        }
    }

    #[test]
    fn self_referential() {
        let document = Node::document();
        let document = to_value(document).expect("should be valid json");

        assert_eq!(
            document,
            json!({
              "$ref": "#/$defs/0000-deer::schema::tests::Node",
              "$defs": {
                "0000-deer::schema::tests::Node": {
                  "additionalProperties": false,
                  "properties": {
                    "child": {
                      "$ref": "#/$defs/0000-deer::schema::tests::Node"
                    }
                  },
                  "type": "object"
                }
              }
            })
        );
    }

    // test for multi self referential
    // Reason: we don't actually use them, but it is easier to visualize the schema that way
    #[expect(unused)]
    struct Tree {
        left: Box<Node>,
        right: Box<Node>,
    }

    impl Reflection for Tree {
        fn schema(doc: &mut Document) -> Schema {
            // there's a way to do this without allocations, it's just a lot more boilerplate
            let mut properties = BTreeMap::new();
            properties.insert("left", doc.add::<Self>());
            properties.insert("right", doc.add::<Self>());

            Schema::new("object")
                .with("additionalProperties", false)
                .with("properties", properties)
        }
    }

    #[test]
    fn multi_self_referential() {
        let document = Tree::document();
        let document = to_value(document).expect("should be valid json");

        assert_eq!(
            document,
            json!({
              "$ref": "#/$defs/0000-deer::schema::tests::Tree",
              "$defs": {
                "0000-deer::schema::tests::Tree": {
                  "additionalProperties": false,
                  "properties": {
                    "left": {
                      "$ref": "#/$defs/0000-deer::schema::tests::Tree"
                    },
                    "right": {
                      "$ref": "#/$defs/0000-deer::schema::tests::Tree"
                    },
                  },
                  "type": "object"
                }
              }
            })
        );
    }

    // TODO: once `Describe` is implemented for `core` types replace this temporary type
    struct VecVertex;

    impl Reflection for VecVertex {
        fn schema(doc: &mut Document) -> Schema {
            Schema::new("array").with("items", doc.add::<Vertex>())
        }
    }

    // types are only here for illustration
    #[expect(unused)]
    #[expect(clippy::min_ident_chars, reason = "Simplifies test cases")]
    struct Vertex {
        a: u8,
        b: u16,
        c: u32,
        d: u16,
        next: Vec<Vertex>,
    }

    impl Reflection for Vertex {
        fn schema(doc: &mut Document) -> Schema {
            let mut properties = BTreeMap::new();
            // TODO: once `Describe` is implemented for `core` types replace this temporary type
            properties.insert("a", doc.add::<u8>());
            properties.insert("b", doc.add::<u16>());
            properties.insert("c", doc.add::<u32>());
            properties.insert("d", doc.add::<u16>());
            properties.insert("next", doc.add::<VecVertex>());

            Schema::new("object")
                .with("additionalProperties", false)
                .with("properties", properties)
        }
    }

    #[test]
    fn integration() {
        // patented sanity integration test™
        let document = Vertex::document();
        let document = to_value(document).expect("should be valid json");

        assert_serde_eq!(
            document,
            json!({
              "$ref": "#/$defs/0000-deer::schema::tests::Vertex",
              "$defs": {
                "0004-deer::schema::tests::VecVertex": {
                  "items": {
                    "$ref": "#/$defs/0000-deer::schema::tests::Vertex"
                  },
                  "type": "array"
                },
                "0003-u32": {
                  "maximum": u32::MAX,
                  "minimum": 0,
                  "type": "integer"
                },
                "0001-u8": {
                  "maximum": u8::MAX,
                  "minimum": 0,
                  "type": "integer"
                },
                "0000-deer::schema::tests::Vertex": {
                  "additionalProperties": false,
                  "properties": {
                    "a": {
                      "$ref": "#/$defs/0001-u8"
                    },
                    "b": {
                      "$ref": "#/$defs/0002-u16"
                    },
                    "c": {
                      "$ref": "#/$defs/0003-u32"
                    },
                    "d": {
                      "$ref": "#/$defs/0002-u16"
                    },
                    "next": {
                      "$ref": "#/$defs/0004-deer::schema::tests::VecVertex"
                    }
                  },
                  "type": "object"
                },
                "0002-u16": {
                  "maximum": u16::MAX,
                  "minimum": 0,
                  "type": "integer"
                }
              }
            })
        );
    }
}
