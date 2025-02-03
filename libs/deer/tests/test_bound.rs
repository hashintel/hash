#![expect(clippy::panic_in_result_fn)]
#![expect(clippy::min_ident_chars, reason = "Simplifies test cases")]

use deer::{
    ArrayAccess, Deserialize, Deserializer, Document, ObjectAccess, Reflection, Schema, Visitor,
    error::{DeserializeError, VisitorError},
    schema::Reference,
};
use deer_desert::{Token, assert_tokens, assert_tokens_error, error};
use error_stack::{Report, ReportSink, ResultExt as _};
use serde::{Serialize, Serializer, ser::SerializeMap as _};
use serde_json::json;

struct Properties<const N: usize>([(&'static str, Reference); N]);

impl<const N: usize> Serialize for Properties<N> {
    fn serialize<S>(&self, serializer: S) -> core::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(N))?;

        for (key, value) in &self.0 {
            map.serialize_entry(key, value)?;
        }

        map.end()
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
struct ArrayStats {
    total: usize,
    some: usize,
}

impl Reflection for ArrayStats {
    fn schema(doc: &mut Document) -> Schema {
        Schema::new("object").with(
            "properties",
            Properties([
                ("total", doc.add::<usize>()), //
                ("some", doc.add::<usize>()),
            ]),
        )
    }
}

struct ArrayStatsVisitor;

impl<'de> Visitor<'de> for ArrayStatsVisitor {
    type Value = ArrayStats;

    fn expecting(&self) -> Document {
        Self::Value::document()
    }

    fn visit_array<T>(self, array: T) -> Result<Self::Value, Report<VisitorError>>
    where
        T: ArrayAccess<'de>,
    {
        let mut array = array.into_bound(3).change_context(VisitorError)?;
        let mut stats = ArrayStats { total: 0, some: 0 };

        let mut errors = ReportSink::new();

        while let Some(value) = array.next::<Option<u8>>() {
            match value {
                Ok(value) => {
                    stats.total += 1;

                    if value.is_some() {
                        stats.some += 1;
                    }
                }
                Err(error) => {
                    errors.append(error);
                }
            }
        }

        let error = array.end();

        match (errors.finish(), error) {
            (Err(errors), Ok(())) => Err(errors.change_context(VisitorError)),
            (Ok(()), Err(errors)) => Err(errors.change_context(VisitorError)),
            (Err(mut errors), Err(error)) => {
                errors.push(error);

                Err(errors.change_context(VisitorError))
            }
            (Ok(()), Ok(())) => Ok(stats),
        }
    }
}

impl<'de> Deserialize<'de> for ArrayStats {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_array(ArrayStatsVisitor)
            .change_context(DeserializeError)
    }
}

#[test]
fn array_access_ok() {
    assert_tokens(
        &ArrayStats { total: 3, some: 3 },
        &[
            Token::Array { length: Some(3) },
            Token::Number(0.into()),
            Token::Number(0.into()),
            Token::Number(0.into()),
            Token::ArrayEnd,
        ],
    );
}

#[test]
fn array_access_not_enough_ok() {
    assert_tokens(
        &ArrayStats { total: 3, some: 2 },
        &[
            Token::Array { length: Some(3) },
            Token::Number(0.into()),
            Token::Number(0.into()),
            Token::ArrayEnd,
        ],
    );
}

#[test]
fn array_access_too_many_err() {
    assert_tokens_error::<ArrayStats>(
        &error!([{
            ns: "deer",
            id: ["array", "length"],
            properties: {
                "expected": 3,
                "received": 4,
                "location": []
            }
        }]),
        &[
            Token::Array { length: Some(4) },
            Token::Number(0.into()),
            Token::Number(0.into()),
            Token::Number(0.into()),
            Token::Number(0.into()),
            Token::ArrayEnd,
        ],
    );
}

#[derive(Debug)]
struct DirtyArray;

struct DirtyArrayVisitor;

impl<'de> Visitor<'de> for DirtyArrayVisitor {
    type Value = DirtyArray;

    fn expecting(&self) -> Document {
        <()>::reflection()
    }

    fn visit_array<T>(self, mut array: T) -> Result<Self::Value, Report<VisitorError>>
    where
        T: ArrayAccess<'de>,
    {
        // simulate dirty by taking one item
        _ = array.next::<Option<u8>>();

        array.into_bound(2).change_context(VisitorError)?;

        unreachable!();
    }
}

impl<'de> Deserialize<'de> for DirtyArray {
    type Reflection = <() as Deserialize<'de>>::Reflection;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_array(DirtyArrayVisitor)
            .change_context(DeserializeError)
    }
}

#[test]
fn array_access_on_dirty_err() {
    assert_tokens_error::<DirtyArray>(
        &error!([{
            ns: "deer",
            id: ["internal", "access", "bound"],
            properties: {
                "location": []
            }
        }]),
        &[
            Token::Array { length: Some(2) },
            Token::Number(0.into()),
            Token::Number(0.into()),
            Token::ArrayEnd,
        ],
    );
}

#[test]
fn array_access_called_twice_err() {
    assert_tokens_error::<DirtyArray>(
        &error!([{
            ns: "deer",
            id: ["internal", "access", "bound"],
            properties: {
                "location": []
            }
        }]),
        &[
            Token::Array { length: Some(2) },
            Token::Number(0.into()),
            Token::Number(0.into()),
            Token::ArrayEnd,
        ],
    );
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
struct ObjectStats {
    a: usize,
    b: usize,
    c: usize,

    total: usize,
    none: usize,
}

impl Reflection for ObjectStats {
    fn schema(doc: &mut Document) -> Schema {
        Schema::new("object").with(
            "properties",
            Properties([
                ("a", doc.add::<usize>()),
                ("b", doc.add::<usize>()),
                ("c", doc.add::<usize>()),
                ("none", doc.add::<usize>()),
            ]),
        )
    }
}

struct ObjectStatsVisitor;

impl<'de> Visitor<'de> for ObjectStatsVisitor {
    type Value = ObjectStats;

    fn expecting(&self) -> Document {
        Self::Value::document()
    }

    fn visit_object<T>(self, object: T) -> Result<Self::Value, Report<VisitorError>>
    where
        T: ObjectAccess<'de>,
    {
        let mut object = object.into_bound(3).change_context(VisitorError)?;
        let mut stats = ObjectStats {
            a: 0,
            b: 0,
            c: 0,

            total: 0,
            none: 0,
        };

        let mut errors = ReportSink::new();

        while let Some(value) = object.next::<Option<&str>, Option<()>>() {
            match value {
                Ok((key, _)) => {
                    stats.total += 1;

                    match key {
                        Some("a") => stats.a += 1,
                        Some("b") => stats.b += 1,
                        Some("c") => stats.c += 1,
                        Some(_) => {
                            panic!("only for testing purposes, use either `a`, `b`, or `c` as key!")
                        }
                        None => stats.none += 1,
                    }
                }
                Err(error) => {
                    errors.append(error);
                }
            }
        }

        let error = object.end();

        match (errors.finish(), error) {
            (Err(errors), Ok(())) => Err(errors.change_context(VisitorError)),
            (Ok(()), Err(errors)) => Err(errors.change_context(VisitorError)),
            (Err(mut errors), Err(error)) => {
                errors.push(error);

                Err(errors.change_context(VisitorError))
            }
            (Ok(()), Ok(())) => Ok(stats),
        }
    }
}

impl<'de> Deserialize<'de> for ObjectStats {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_object(ObjectStatsVisitor)
            .change_context(DeserializeError)
    }
}

#[test]
fn object_access_ok() {
    let tokens = [
        Token::Object { length: Some(3) },
        Token::BorrowedStr("a"),
        Token::Null,
        Token::BorrowedStr("b"),
        Token::Null,
        Token::BorrowedStr("c"),
        Token::Null,
        Token::ObjectEnd,
    ];

    assert_tokens(
        &ObjectStats {
            a: 1,
            b: 1,
            c: 1,
            total: 3,
            none: 0,
        },
        &tokens,
    );
}

#[test]
fn object_access_not_enough_ok() {
    let tokens = [
        Token::Object { length: Some(2) },
        Token::BorrowedStr("a"),
        Token::Null,
        Token::BorrowedStr("b"),
        Token::Null,
        Token::ObjectEnd,
    ];

    assert_tokens(
        &ObjectStats {
            a: 1,
            b: 1,
            c: 0,
            total: 3,
            none: 1,
        },
        &tokens,
    );
}

#[test]
fn object_access_too_many_err() {
    let tokens = [
        Token::Object { length: Some(4) },
        Token::BorrowedStr("a"),
        Token::Null,
        Token::BorrowedStr("b"),
        Token::Null,
        Token::BorrowedStr("c"),
        Token::Null,
        Token::BorrowedStr("a"),
        Token::Null,
        Token::ObjectEnd,
    ];

    assert_tokens_error::<ObjectStats>(
        &error!([{
            ns: "deer",
            id: ["object", "length"],
            properties: {
                "expected": 3,
                "received": 4,
                "location": []
            }
        }]),
        &tokens,
    );
}

#[derive(Debug)]
struct DirtyObject;

struct DirtyObjectVisitor;

impl<'de> Visitor<'de> for DirtyObjectVisitor {
    type Value = DirtyObject;

    fn expecting(&self) -> Document {
        <()>::reflection()
    }

    fn visit_object<T>(self, mut object: T) -> Result<Self::Value, Report<VisitorError>>
    where
        T: ObjectAccess<'de>,
    {
        // simulate dirty by taking one item
        _ = object.next::<Option<()>, Option<()>>();

        object.into_bound(3).change_context(VisitorError)?;

        unreachable!()
    }
}

impl<'de> Deserialize<'de> for DirtyObject {
    type Reflection = <() as Deserialize<'de>>::Reflection;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_array(DirtyObjectVisitor)
            .change_context(DeserializeError)
    }
}

#[test]
fn object_access_on_dirty_err() {
    let tokens = [
        Token::Object { length: Some(2) },
        Token::BorrowedStr("a"),
        Token::Null,
        Token::BorrowedStr("b"),
        Token::Null,
        Token::ObjectEnd,
    ];

    assert_tokens_error::<DirtyObject>(
        &error!([{
            ns: "deer",
            id: ["internal", "access", "bound"],
            properties: {
                "location": []
            }
        }]),
        &tokens,
    );
}

#[test]
fn object_access_called_twice_err() {
    let tokens = [
        Token::Object { length: Some(2) },
        Token::BorrowedStr("a"),
        Token::Null,
        Token::BorrowedStr("b"),
        Token::Null,
        Token::ObjectEnd,
    ];

    assert_tokens_error::<DirtyObject>(
        &error!([{
            ns: "deer",
            id: ["internal", "access", "bound"],
            properties: {
                "location": []
            }
        }]),
        &tokens,
    );
}
