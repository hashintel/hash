use core::fmt::Debug;

/// Represents a full span in a file.
///
/// This span is resolved unlike a normal span, where each parent is resolved to a full span.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SpanNode<S> {
    pub value: S,
    #[cfg_attr(feature = "serde", serde(skip_serializing_if = "Option::is_none"))]
    pub parent: Option<Box<SpanNode<S>>>,
}
