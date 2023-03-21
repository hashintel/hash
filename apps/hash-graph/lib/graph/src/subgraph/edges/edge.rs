use serde::{ser::SerializeStruct, Serialize, Serializer};
use utoipa::{openapi, ToSchema};

#[derive(Debug, Hash, PartialEq, Eq)]
pub struct OutwardEdge<K, E> {
    pub kind: K,
    pub direction: EdgeDirection,
    pub right_endpoint: E,
}

impl<K, E> Serialize for OutwardEdge<K, E>
where
    K: Serialize,
    E: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("OutwardEdge", 3)?;
        state.serialize_field("kind", &self.kind)?;
        state.serialize_field("reversed", &(self.direction == EdgeDirection::Incoming))?;
        state.serialize_field("rightEndpoint", &self.right_endpoint)?;
        state.end()
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EdgeDirection {
    Outgoing,
    Incoming,
}

impl EdgeDirection {
    #[must_use]
    pub const fn reversed(self) -> Self {
        match self {
            Self::Outgoing => Self::Incoming,
            Self::Incoming => Self::Outgoing,
        }
    }
}

// Utoipa doesn't seem to be able to generate sensible interfaces for this, it gets confused by
// the generic
impl<'s, K, E> OutwardEdge<K, E>
where
    K: ToSchema<'s>,
    E: ToSchema<'s>,
{
    pub(crate) fn generate_schema(title: impl Into<String>) -> openapi::RefOr<openapi::Schema> {
        openapi::ObjectBuilder::new()
            .title(Some(title))
            .property("kind", openapi::Ref::from_schema_name(K::schema().0))
            .required("kind")
            .property(
                "reversed",
                openapi::Object::with_type(openapi::SchemaType::Boolean),
            )
            .required("reversed")
            .property(
                "rightEndpoint",
                openapi::Ref::from_schema_name(E::schema().0),
            )
            .required("rightEndpoint")
            .into()
    }
}
