use deer::{
    error::{ArrayAccessError, DeserializeError, VisitorError},
    schema::Reference,
    ArrayAccess, Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
};
use deer_desert::{assert_tokens, assert_tokens_error, error, Token};
use error_stack::{Result, ResultExt};
use serde::{ser::SerializeMap, Serialize, Serializer};
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

    fn visit_array<T>(self, array: T) -> Result<Self::Value, VisitorError>
    where
        T: ArrayAccess<'de>,
    {
        let mut array = array.into_bound(3).change_context(VisitorError)?;
        let mut stats = ArrayStats { total: 0, some: 0 };

        let mut errors: Result<(), ArrayAccessError> = Ok(());

        while let Some(value) = array.next::<Option<u8>>() {
            match value {
                Ok(value) => {
                    stats.total += 1;

                    if value.is_some() {
                        stats.some += 1;
                    }
                }
                Err(error) => match &mut errors {
                    Err(errors) => errors.extend_one(error),
                    errors => *errors = Err(error),
                },
            }
        }

        let error = array.end();

        match (errors, error) {
            (Err(errors), Ok(_)) | (Ok(_), Err(errors)) => Err(errors.change_context(VisitorError)),
            (Err(mut errors), Err(error)) => {
                errors.extend_one(error);

                Err(errors.change_context(VisitorError))
            }
            (Ok(_), Ok(_)) => Ok(stats),
        }
    }
}

impl<'de> Deserialize<'de> for ArrayStats {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_array(ArrayStatsVisitor)
            .change_context(DeserializeError)
    }
}

#[test]
fn array_access_ok() {
    assert_tokens(&ArrayStats { total: 3, some: 3 }, &[
        Token::Array { length: Some(3) },
        Token::Number(0.into()),
        Token::Number(0.into()),
        Token::Number(0.into()),
        Token::ArrayEnd,
    ]);
}

#[test]
fn array_access_not_enough_ok() {
    assert_tokens(&ArrayStats { total: 3, some: 2 }, &[
        Token::Array { length: Some(3) },
        Token::Number(0.into()),
        Token::Number(0.into()),
        Token::ArrayEnd,
    ]);
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

    fn visit_array<T>(self, mut array: T) -> Result<Self::Value, VisitorError>
    where
        T: ArrayAccess<'de>,
    {
        // simulate dirty by taking one item
        let _ = array.next::<Option<u8>>();

        array.into_bound(2).change_context(VisitorError)?;

        unreachable!();
    }
}

impl<'de> Deserialize<'de> for DirtyArray {
    type Reflection = <() as Deserialize<'de>>::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_array(DirtyArrayVisitor)
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

#[derive(Debug)]
struct CalledTwiceArray;

struct CalledTwiceArrayVisitor;

impl<'de> Visitor<'de> for CalledTwiceArrayVisitor {
    type Value = CalledTwiceArray;

    fn expecting(&self) -> Document {
        <()>::reflection()
    }

    fn visit_array<T>(self, array: T) -> Result<Self::Value, VisitorError>
    where
        T: ArrayAccess<'de>,
    {
        let array = array.into_bound(2).change_context(VisitorError)?;
        array.into_bound(1).change_context(VisitorError)?;

        unreachable!();
    }
}

impl<'de> Deserialize<'de> for CalledTwiceArray {
    type Reflection = <() as Deserialize<'de>>::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_array(CalledTwiceArrayVisitor)
            .change_context(DeserializeError)
    }
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
