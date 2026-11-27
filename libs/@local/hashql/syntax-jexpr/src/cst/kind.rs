use core::marker::PhantomData;

use crate::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet};

pub(crate) trait NodeKind {
    const KIND: SyntaxKind;
    /// Type name emitted in [`core::fmt::Debug`] output for [`super::SyntaxNode`].
    const NAME: &'static str;
}

pub(crate) trait TokenKind {
    /// Type name emitted in [`core::fmt::Debug`] output for [`super::SyntaxToken`].
    const NAME: &'static str;
    const SYNTAX_KINDS: SyntaxKindSet;
}

pub(crate) struct String(!);

impl TokenKind for String {
    const NAME: &'static str = "StringToken";
    const SYNTAX_KINDS: SyntaxKindSet = SyntaxKindSet::from_slice(&[SyntaxKind::String]);
}

pub(crate) struct Number(!);

impl TokenKind for Number {
    const NAME: &'static str = "NumberToken";
    const SYNTAX_KINDS: SyntaxKindSet = SyntaxKindSet::from_slice(&[SyntaxKind::Number]);
}

pub(crate) struct Bool(!);

impl TokenKind for Bool {
    const NAME: &'static str = "BoolToken";
    const SYNTAX_KINDS: SyntaxKindSet =
        SyntaxKindSet::from_slice(&[SyntaxKind::True, SyntaxKind::False]);
}

pub(crate) struct Null(!);

impl TokenKind for Null {
    const NAME: &'static str = "NullToken";
    const SYNTAX_KINDS: SyntaxKindSet = SyntaxKindSet::from_slice(&[SyntaxKind::Null]);
}

pub(crate) struct Root<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Root<T> {
    const KIND: SyntaxKind = SyntaxKind::Root;
    const NAME: &'static str = "Root";
}

pub(crate) struct TypeField(!);

impl NodeKind for TypeField {
    const KIND: SyntaxKind = SyntaxKind::TypeField;
    const NAME: &'static str = "TypeField";
}

pub(crate) struct TypeAnnotation(!);

impl NodeKind for TypeAnnotation {
    const KIND: SyntaxKind = SyntaxKind::TypeAnnotation;
    const NAME: &'static str = "TypeAnnotation";
}

pub(crate) struct PathExpr(!);

impl NodeKind for PathExpr {
    const KIND: SyntaxKind = SyntaxKind::PathExpr;
    const NAME: &'static str = "PathExpr";
}

pub(crate) struct CallExpr(!);

impl NodeKind for CallExpr {
    const KIND: SyntaxKind = SyntaxKind::CallExpr;
    const NAME: &'static str = "CallExpr";
}

pub(crate) struct PositionalArg(!);

impl NodeKind for PositionalArg {
    const KIND: SyntaxKind = SyntaxKind::PositionalArg;
    const NAME: &'static str = "PositionalArg";
}

pub(crate) struct LabeledArg(!);

impl NodeKind for LabeledArg {
    const KIND: SyntaxKind = SyntaxKind::LabeledArg;
    const NAME: &'static str = "LabeledArg";
}

pub(crate) struct LabeledArgEntry(!);

impl NodeKind for LabeledArgEntry {
    const KIND: SyntaxKind = SyntaxKind::LabeledArgEntry;
    const NAME: &'static str = "LabeledArgEntry";
}

pub(crate) struct ShorthandLabeledArg(!);

impl NodeKind for ShorthandLabeledArg {
    const KIND: SyntaxKind = SyntaxKind::ShorthandLabeledArg;
    const NAME: &'static str = "ShorthandLabeledArg";
}

pub(crate) struct Literal(!);

impl NodeKind for Literal {
    const KIND: SyntaxKind = SyntaxKind::Literal;
    const NAME: &'static str = "Literal";
}

pub(crate) struct LiteralField(!);

impl NodeKind for LiteralField {
    const KIND: SyntaxKind = SyntaxKind::LiteralField;
    const NAME: &'static str = "LiteralField";
}

pub(crate) struct LiteralValue(!);

impl NodeKind for LiteralValue {
    const KIND: SyntaxKind = SyntaxKind::LiteralValue;
    const NAME: &'static str = "LiteralValue";
}

pub(crate) struct Struct<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Struct<T> {
    const KIND: SyntaxKind = SyntaxKind::Struct;
    const NAME: &'static str = "Struct";
}

pub(crate) struct StructField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for StructField<T> {
    const KIND: SyntaxKind = SyntaxKind::StructField;
    const NAME: &'static str = "StructField";
}

pub(crate) struct StructBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for StructBody<T> {
    const KIND: SyntaxKind = SyntaxKind::StructBody;
    const NAME: &'static str = "StructBody";
}

pub(crate) struct StructEntry<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for StructEntry<T> {
    const KIND: SyntaxKind = SyntaxKind::StructEntry;
    const NAME: &'static str = "StructEntry";
}

pub(crate) struct Tuple<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Tuple<T> {
    const KIND: SyntaxKind = SyntaxKind::Tuple;
    const NAME: &'static str = "Tuple";
}

pub(crate) struct TupleField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for TupleField<T> {
    const KIND: SyntaxKind = SyntaxKind::TupleField;
    const NAME: &'static str = "TupleField";
}

pub(crate) struct TupleBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for TupleBody<T> {
    const KIND: SyntaxKind = SyntaxKind::TupleBody;
    const NAME: &'static str = "TupleBody";
}

pub(crate) struct TupleElement<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for TupleElement<T> {
    const KIND: SyntaxKind = SyntaxKind::TupleElement;
    const NAME: &'static str = "TupleElement";
}

pub(crate) struct List<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for List<T> {
    const KIND: SyntaxKind = SyntaxKind::List;
    const NAME: &'static str = "List";
}

pub(crate) struct ListField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for ListField<T> {
    const KIND: SyntaxKind = SyntaxKind::ListField;
    const NAME: &'static str = "ListField";
}

pub(crate) struct ListBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for ListBody<T> {
    const KIND: SyntaxKind = SyntaxKind::ListBody;
    const NAME: &'static str = "ListBody";
}

pub(crate) struct ListElement<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for ListElement<T> {
    const KIND: SyntaxKind = SyntaxKind::ListElement;
    const NAME: &'static str = "ListElement";
}

pub(crate) struct Dict<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Dict<T> {
    const KIND: SyntaxKind = SyntaxKind::Dict;
    const NAME: &'static str = "Dict";
}

pub(crate) struct DictField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictField<T> {
    const KIND: SyntaxKind = SyntaxKind::DictField;
    const NAME: &'static str = "DictField";
}

pub(crate) struct DictObjectBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictObjectBody<T> {
    const KIND: SyntaxKind = SyntaxKind::DictObjectBody;
    const NAME: &'static str = "DictObjectBody";
}

pub(crate) struct DictObjectEntry<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictObjectEntry<T> {
    const KIND: SyntaxKind = SyntaxKind::DictObjectEntry;
    const NAME: &'static str = "DictObjectEntry";
}

pub(crate) struct DictArrayBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictArrayBody<T> {
    const KIND: SyntaxKind = SyntaxKind::DictArrayBody;
    const NAME: &'static str = "DictArrayBody";
}

pub(crate) struct DictArrayEntry<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictArrayEntry<T> {
    const KIND: SyntaxKind = SyntaxKind::DictArrayEntry;
    const NAME: &'static str = "DictArrayEntry";
}
