use core::fmt::Debug;

/// A fully quantified span.
///
/// A span, which has all of its parent spans resolved.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SpanNode<S> {
    pub value: S,
    #[cfg_attr(feature = "serde", serde(skip_serializing_if = "Option::is_none"))]
    pub parent: Option<Box<SpanNode<S>>>,
}
