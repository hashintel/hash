//! Uninhabited marker types identifying concrete CST nodes and tokens.

use core::marker::PhantomData;

use crate::syntax_kind::SyntaxKind;

/// Kind marker identifying a single concrete CST node variant.
pub trait NodeKind {
    /// Exact [`SyntaxKind`] represented by this marker.
    const KIND: SyntaxKind;
    /// Display name used in [`core::fmt::Debug`] output for [`super::TypedNode`].
    const NAME: &'static str;
}

/// Kind marker identifying a concrete CST token wrapper.
pub trait TokenKind {
    /// Display name used in [`core::fmt::Debug`] output for [`super::TypedToken`].
    const NAME: &'static str;

    /// Reports whether `kind` matches this token marker.
    #[must_use]
    fn can_cast(kind: SyntaxKind) -> bool;
}

/// Marker for a JSON string literal token.
pub struct String(!);

impl TokenKind for String {
    const NAME: &'static str = "StringToken";

    #[inline]
    fn can_cast(kind: SyntaxKind) -> bool {
        kind == SyntaxKind::String
    }
}

/// Marker for a JSON number literal token.
pub struct Number(!);

impl TokenKind for Number {
    const NAME: &'static str = "NumberToken";

    #[inline]
    fn can_cast(kind: SyntaxKind) -> bool {
        kind == SyntaxKind::Number
    }
}

/// Marker for a JSON boolean literal token (`true` or `false`).
pub struct Bool(!);

impl TokenKind for Bool {
    const NAME: &'static str = "BoolToken";

    #[inline]
    fn can_cast(kind: SyntaxKind) -> bool {
        matches!(kind, SyntaxKind::True | SyntaxKind::False)
    }
}

/// Marker for a JSON `null` literal token.
pub struct Null(!);

impl TokenKind for Null {
    const NAME: &'static str = "NullToken";

    #[inline]
    fn can_cast(kind: SyntaxKind) -> bool {
        kind == SyntaxKind::Null
    }
}

/// Marker for a [`SyntaxKind::Root`] node yielding top-level item `T`.
pub struct Root<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Root<T> {
    const KIND: SyntaxKind = SyntaxKind::Root;
    const NAME: &'static str = "Root";
}

/// Marker for a [`SyntaxKind::TypeField`] node.
pub struct TypeField(!);

impl NodeKind for TypeField {
    const KIND: SyntaxKind = SyntaxKind::TypeField;
    const NAME: &'static str = "TypeField";
}

/// Marker for a [`SyntaxKind::TypeAnnotation`] node.
pub struct TypeAnnotation(!);

impl NodeKind for TypeAnnotation {
    const KIND: SyntaxKind = SyntaxKind::TypeAnnotation;
    const NAME: &'static str = "TypeAnnotation";
}

/// Marker for a [`SyntaxKind::UnknownField`] node.
pub struct UnknownField(!);

impl NodeKind for UnknownField {
    const KIND: SyntaxKind = SyntaxKind::UnknownField;
    const NAME: &'static str = "UnknownField";
}

/// Marker for a [`SyntaxKind::PathExpr`] node.
pub struct PathExpr(!);

impl NodeKind for PathExpr {
    const KIND: SyntaxKind = SyntaxKind::PathExpr;
    const NAME: &'static str = "PathExpr";
}

/// Marker for a [`SyntaxKind::CallExpr`] node.
pub struct CallExpr(!);

impl NodeKind for CallExpr {
    const KIND: SyntaxKind = SyntaxKind::CallExpr;
    const NAME: &'static str = "CallExpr";
}

/// Marker for a [`SyntaxKind::PositionalArg`] node.
pub struct PositionalArg(!);

impl NodeKind for PositionalArg {
    const KIND: SyntaxKind = SyntaxKind::PositionalArg;
    const NAME: &'static str = "PositionalArg";
}

/// Marker for a [`SyntaxKind::LabeledArg`] node.
pub struct LabeledArg(!);

impl NodeKind for LabeledArg {
    const KIND: SyntaxKind = SyntaxKind::LabeledArg;
    const NAME: &'static str = "LabeledArg";
}

/// Marker for a [`SyntaxKind::LabeledArgEntry`] node.
pub struct LabeledArgEntry(!);

impl NodeKind for LabeledArgEntry {
    const KIND: SyntaxKind = SyntaxKind::LabeledArgEntry;
    const NAME: &'static str = "LabeledArgEntry";
}

/// Marker for a [`SyntaxKind::ShorthandLabeledArg`] node.
pub struct ShorthandLabeledArg(!);

impl NodeKind for ShorthandLabeledArg {
    const KIND: SyntaxKind = SyntaxKind::ShorthandLabeledArg;
    const NAME: &'static str = "ShorthandLabeledArg";
}

/// Marker for a [`SyntaxKind::Literal`] node.
pub struct Literal(!);

impl NodeKind for Literal {
    const KIND: SyntaxKind = SyntaxKind::Literal;
    const NAME: &'static str = "Literal";
}

/// Marker for a [`SyntaxKind::LiteralField`] node.
pub struct LiteralField(!);

impl NodeKind for LiteralField {
    const KIND: SyntaxKind = SyntaxKind::LiteralField;
    const NAME: &'static str = "LiteralField";
}

/// Marker for a [`SyntaxKind::LiteralValue`] node.
pub struct LiteralValue(!);

impl NodeKind for LiteralValue {
    const KIND: SyntaxKind = SyntaxKind::LiteralValue;
    const NAME: &'static str = "LiteralValue";
}

/// Marker for a [`SyntaxKind::Struct`] node parameterized by its field value type `T`.
pub struct Struct<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Struct<T> {
    const KIND: SyntaxKind = SyntaxKind::Struct;
    const NAME: &'static str = "Struct";
}

/// Marker for a [`SyntaxKind::StructField`] node parameterized by its field value type `T`.
pub struct StructField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for StructField<T> {
    const KIND: SyntaxKind = SyntaxKind::StructField;
    const NAME: &'static str = "StructField";
}

/// Marker for a [`SyntaxKind::StructBody`] node parameterized by its field value type `T`.
pub struct StructBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for StructBody<T> {
    const KIND: SyntaxKind = SyntaxKind::StructBody;
    const NAME: &'static str = "StructBody";
}

/// Marker for a [`SyntaxKind::StructEntry`] node parameterized by its field value type `T`.
pub struct StructEntry<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for StructEntry<T> {
    const KIND: SyntaxKind = SyntaxKind::StructEntry;
    const NAME: &'static str = "StructEntry";
}

/// Marker for a [`SyntaxKind::Tuple`] node parameterized by its element type `T`.
pub struct Tuple<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Tuple<T> {
    const KIND: SyntaxKind = SyntaxKind::Tuple;
    const NAME: &'static str = "Tuple";
}

/// Marker for a [`SyntaxKind::TupleField`] node parameterized by its element type `T`.
pub struct TupleField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for TupleField<T> {
    const KIND: SyntaxKind = SyntaxKind::TupleField;
    const NAME: &'static str = "TupleField";
}

/// Marker for a [`SyntaxKind::TupleBody`] node parameterized by its element type `T`.
pub struct TupleBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for TupleBody<T> {
    const KIND: SyntaxKind = SyntaxKind::TupleBody;
    const NAME: &'static str = "TupleBody";
}

/// Marker for a [`SyntaxKind::TupleElement`] node parameterized by its element type `T`.
pub struct TupleElement<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for TupleElement<T> {
    const KIND: SyntaxKind = SyntaxKind::TupleElement;
    const NAME: &'static str = "TupleElement";
}

/// Marker for a [`SyntaxKind::List`] node parameterized by its element type `T`.
pub struct List<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for List<T> {
    const KIND: SyntaxKind = SyntaxKind::List;
    const NAME: &'static str = "List";
}

/// Marker for a [`SyntaxKind::ListField`] node parameterized by its element type `T`.
pub struct ListField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for ListField<T> {
    const KIND: SyntaxKind = SyntaxKind::ListField;
    const NAME: &'static str = "ListField";
}

/// Marker for a [`SyntaxKind::ListBody`] node parameterized by its element type `T`.
pub struct ListBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for ListBody<T> {
    const KIND: SyntaxKind = SyntaxKind::ListBody;
    const NAME: &'static str = "ListBody";
}

/// Marker for a [`SyntaxKind::ListElement`] node parameterized by its element type `T`.
pub struct ListElement<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for ListElement<T> {
    const KIND: SyntaxKind = SyntaxKind::ListElement;
    const NAME: &'static str = "ListElement";
}

/// Marker for a [`SyntaxKind::Dict`] node parameterized by its entry item type `T`.
pub struct Dict<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Dict<T> {
    const KIND: SyntaxKind = SyntaxKind::Dict;
    const NAME: &'static str = "Dict";
}

/// Marker for a [`SyntaxKind::DictField`] node parameterized by its entry item type `T`.
pub struct DictField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictField<T> {
    const KIND: SyntaxKind = SyntaxKind::DictField;
    const NAME: &'static str = "DictField";
}

/// Marker for a [`SyntaxKind::DictObjectBody`] node parameterized by its entry item type `T`.
pub struct DictObjectBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictObjectBody<T> {
    const KIND: SyntaxKind = SyntaxKind::DictObjectBody;
    const NAME: &'static str = "DictObjectBody";
}

/// Marker for a [`SyntaxKind::DictObjectEntry`] node parameterized by its entry item type `T`.
pub struct DictObjectEntry<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictObjectEntry<T> {
    const KIND: SyntaxKind = SyntaxKind::DictObjectEntry;
    const NAME: &'static str = "DictObjectEntry";
}

/// Marker for a [`SyntaxKind::DictArrayBody`] node parameterized by its entry item type `T`.
pub struct DictArrayBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictArrayBody<T> {
    const KIND: SyntaxKind = SyntaxKind::DictArrayBody;
    const NAME: &'static str = "DictArrayBody";
}

/// Marker for a [`SyntaxKind::DictArrayEntry`] node parameterized by its entry item type `T`.
pub struct DictArrayEntry<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictArrayEntry<T> {
    const KIND: SyntaxKind = SyntaxKind::DictArrayEntry;
    const NAME: &'static str = "DictArrayEntry";
}
