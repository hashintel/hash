use core::marker::PhantomData;

use crate::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet};

pub trait NodeKind {
    const KIND: SyntaxKind;
    /// Type name emitted in [`core::fmt::Debug`] output for [`super::SyntaxNode`].
    const NAME: &'static str;
}

pub trait TokenKind {
    /// Type name emitted in [`core::fmt::Debug`] output for [`super::SyntaxToken`].
    const NAME: &'static str;
    const SYNTAX_KINDS: SyntaxKindSet;
}

pub struct String(!);

impl TokenKind for String {
    const NAME: &'static str = "StringToken";
    const SYNTAX_KINDS: SyntaxKindSet = SyntaxKindSet::from_slice(&[SyntaxKind::String]);
}

pub struct Number(!);

impl TokenKind for Number {
    const NAME: &'static str = "NumberToken";
    const SYNTAX_KINDS: SyntaxKindSet = SyntaxKindSet::from_slice(&[SyntaxKind::Number]);
}

pub struct Bool(!);

impl TokenKind for Bool {
    const NAME: &'static str = "BoolToken";
    const SYNTAX_KINDS: SyntaxKindSet =
        SyntaxKindSet::from_slice(&[SyntaxKind::True, SyntaxKind::False]);
}

pub struct Null(!);

impl TokenKind for Null {
    const NAME: &'static str = "NullToken";
    const SYNTAX_KINDS: SyntaxKindSet = SyntaxKindSet::from_slice(&[SyntaxKind::Null]);
}

pub struct Root<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Root<T> {
    const KIND: SyntaxKind = SyntaxKind::Root;
    const NAME: &'static str = "Root";
}

pub struct TypeField(!);

impl NodeKind for TypeField {
    const KIND: SyntaxKind = SyntaxKind::TypeField;
    const NAME: &'static str = "TypeField";
}

pub struct TypeAnnotation(!);

impl NodeKind for TypeAnnotation {
    const KIND: SyntaxKind = SyntaxKind::TypeAnnotation;
    const NAME: &'static str = "TypeAnnotation";
}

pub struct UnknownField(!);

impl NodeKind for UnknownField {
    const KIND: SyntaxKind = SyntaxKind::UnknownField;
    const NAME: &'static str = "UnknownField";
}

pub struct PathExpr(!);

impl NodeKind for PathExpr {
    const KIND: SyntaxKind = SyntaxKind::PathExpr;
    const NAME: &'static str = "PathExpr";
}

pub struct CallExpr(!);

impl NodeKind for CallExpr {
    const KIND: SyntaxKind = SyntaxKind::CallExpr;
    const NAME: &'static str = "CallExpr";
}

pub struct PositionalArg(!);

impl NodeKind for PositionalArg {
    const KIND: SyntaxKind = SyntaxKind::PositionalArg;
    const NAME: &'static str = "PositionalArg";
}

pub struct LabeledArg(!);

impl NodeKind for LabeledArg {
    const KIND: SyntaxKind = SyntaxKind::LabeledArg;
    const NAME: &'static str = "LabeledArg";
}

pub struct LabeledArgEntry(!);

impl NodeKind for LabeledArgEntry {
    const KIND: SyntaxKind = SyntaxKind::LabeledArgEntry;
    const NAME: &'static str = "LabeledArgEntry";
}

pub struct ShorthandLabeledArg(!);

impl NodeKind for ShorthandLabeledArg {
    const KIND: SyntaxKind = SyntaxKind::ShorthandLabeledArg;
    const NAME: &'static str = "ShorthandLabeledArg";
}

pub struct Literal(!);

impl NodeKind for Literal {
    const KIND: SyntaxKind = SyntaxKind::Literal;
    const NAME: &'static str = "Literal";
}

pub struct LiteralField(!);

impl NodeKind for LiteralField {
    const KIND: SyntaxKind = SyntaxKind::LiteralField;
    const NAME: &'static str = "LiteralField";
}

pub struct LiteralValue(!);

impl NodeKind for LiteralValue {
    const KIND: SyntaxKind = SyntaxKind::LiteralValue;
    const NAME: &'static str = "LiteralValue";
}

pub struct Struct<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Struct<T> {
    const KIND: SyntaxKind = SyntaxKind::Struct;
    const NAME: &'static str = "Struct";
}

pub struct StructField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for StructField<T> {
    const KIND: SyntaxKind = SyntaxKind::StructField;
    const NAME: &'static str = "StructField";
}

pub struct StructBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for StructBody<T> {
    const KIND: SyntaxKind = SyntaxKind::StructBody;
    const NAME: &'static str = "StructBody";
}

pub struct StructEntry<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for StructEntry<T> {
    const KIND: SyntaxKind = SyntaxKind::StructEntry;
    const NAME: &'static str = "StructEntry";
}

pub struct Tuple<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Tuple<T> {
    const KIND: SyntaxKind = SyntaxKind::Tuple;
    const NAME: &'static str = "Tuple";
}

pub struct TupleField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for TupleField<T> {
    const KIND: SyntaxKind = SyntaxKind::TupleField;
    const NAME: &'static str = "TupleField";
}

pub struct TupleBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for TupleBody<T> {
    const KIND: SyntaxKind = SyntaxKind::TupleBody;
    const NAME: &'static str = "TupleBody";
}

pub struct TupleElement<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for TupleElement<T> {
    const KIND: SyntaxKind = SyntaxKind::TupleElement;
    const NAME: &'static str = "TupleElement";
}

pub struct List<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for List<T> {
    const KIND: SyntaxKind = SyntaxKind::List;
    const NAME: &'static str = "List";
}

pub struct ListField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for ListField<T> {
    const KIND: SyntaxKind = SyntaxKind::ListField;
    const NAME: &'static str = "ListField";
}

pub struct ListBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for ListBody<T> {
    const KIND: SyntaxKind = SyntaxKind::ListBody;
    const NAME: &'static str = "ListBody";
}

pub struct ListElement<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for ListElement<T> {
    const KIND: SyntaxKind = SyntaxKind::ListElement;
    const NAME: &'static str = "ListElement";
}

pub struct Dict<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for Dict<T> {
    const KIND: SyntaxKind = SyntaxKind::Dict;
    const NAME: &'static str = "Dict";
}

pub struct DictField<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictField<T> {
    const KIND: SyntaxKind = SyntaxKind::DictField;
    const NAME: &'static str = "DictField";
}

pub struct DictObjectBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictObjectBody<T> {
    const KIND: SyntaxKind = SyntaxKind::DictObjectBody;
    const NAME: &'static str = "DictObjectBody";
}

pub struct DictObjectEntry<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictObjectEntry<T> {
    const KIND: SyntaxKind = SyntaxKind::DictObjectEntry;
    const NAME: &'static str = "DictObjectEntry";
}

pub struct DictArrayBody<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictArrayBody<T> {
    const KIND: SyntaxKind = SyntaxKind::DictArrayBody;
    const NAME: &'static str = "DictArrayBody";
}

pub struct DictArrayEntry<T>(!, PhantomData<fn() -> T>);

impl<T> NodeKind for DictArrayEntry<T> {
    const KIND: SyntaxKind = SyntaxKind::DictArrayEntry;
    const NAME: &'static str = "DictArrayEntry";
}
