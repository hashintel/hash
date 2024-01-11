use std::{
    borrow::{Borrow, Cow},
    fmt::{Display, Write},
    iter::TrustedLen,
};

use bytes::BytesMut;
use specta::{
    DataType, DataTypeReference, EnumRepr, EnumType, EnumVariant, EnumVariants, Field, GenericType,
    List, LiteralType, NamedFields, PrimitiveType, SpectaID, StructFields, StructType, TupleType,
    UnnamedFields,
};

use crate::codegen::context::{HoistAction, ScopedContext, StatementId};

fn struct_statement_id(_type: &StructType) -> StatementId {
    // cannot get sid yet, therefore global escape
    StatementId::global()
}

pub(crate) struct Inline<'a, 'b: 'a> {
    context: &'a mut ScopedContext<'b>,
    buffer: &'a mut BytesMut,
}

impl<'a, 'b: 'a> Inline<'a, 'b> {
    pub(crate) fn new(context: &'a mut ScopedContext<'b>, buffer: &'a mut BytesMut) -> Self {
        Self { context, buffer }
    }

    pub(crate) fn primitive(&mut self, ast: &PrimitiveType) -> std::fmt::Result {
        let value = match ast {
            PrimitiveType::i8 => "R.i8",
            PrimitiveType::i16 => "R.i16",
            PrimitiveType::i32 => "R.i32",
            PrimitiveType::i64 | PrimitiveType::isize => "R.i64",
            PrimitiveType::i128 => "R.i128",
            PrimitiveType::u8 => "R.u8",
            PrimitiveType::u16 => "R.u16",
            PrimitiveType::u32 => "R.u32",
            PrimitiveType::u64 | PrimitiveType::usize => "R.u64",
            PrimitiveType::u128 => "R.u128",
            PrimitiveType::f32 | PrimitiveType::f64 => "S.number",
            PrimitiveType::bool => "S.boolean",
            PrimitiveType::char => "R.char",
            PrimitiveType::String => "S.string",
        };

        self.buffer.write_str(value)
    }

    fn bare_literal(&mut self, value: &impl Display) -> std::fmt::Result {
        self.buffer.write_str("S.literal(")?;
        self.buffer.write_fmt(format_args!("{value}"))?;
        self.buffer.write_str(")")
    }

    fn literal(&mut self, ast: &LiteralType) -> std::fmt::Result {
        match ast {
            LiteralType::i8(value) => self.bare_literal(value),
            LiteralType::i16(value) => self.bare_literal(value),
            LiteralType::i32(value) => self.bare_literal(value),
            LiteralType::u8(value) => self.bare_literal(value),
            LiteralType::u16(value) => self.bare_literal(value),
            LiteralType::u32(value) => self.bare_literal(value),
            LiteralType::f32(value) => self.bare_literal(value),
            LiteralType::f64(value) => self.bare_literal(value),
            LiteralType::bool(value) => self.bare_literal(value),
            LiteralType::String(value) => self.bare_literal(&format_args!(r#""{value}""#)),
            LiteralType::char(value) => self.bare_literal(&format_args!(r#""{value}""#)),
            LiteralType::None => self.buffer.write_str("S.none"),
            _ => unreachable!("Unsupported literal type: {ast:?}"),
        }
    }

    fn tuple_iter<'item>(
        &mut self,
        mut elements: impl Iterator<Item = &'item DataType> + TrustedLen,
    ) -> std::fmt::Result {
        if elements.size_hint().0 == 0 {
            return self.buffer.write_str("S.null");
        }

        if elements.size_hint().0 == 1 {
            return self.process(elements.next().expect("infallible"));
        }

        self.buffer.write_str("S.tuple(")?;

        for (index, element) in elements.enumerate() {
            if index > 0 {
                self.buffer.write_str(", ")?;
            }

            self.process(element)?;
        }

        self.buffer.write_str(")")
    }

    fn list(&mut self, ast: &List) -> std::fmt::Result {
        let item = ast.ty();

        if let Some(length) = ast.length() {
            self.tuple_iter(std::iter::repeat(item).take(length))
        } else {
            self.buffer.write_str("S.array(")?;
            self.process(item)?;
            self.buffer.write_str(")")
        }
    }

    fn nullable(&mut self, ast: &DataType) -> std::fmt::Result {
        self.buffer.write_str("S.optional(")?;
        self.process(ast)?;
        self.buffer.write_str(")")
    }

    fn map(&mut self, key: &DataType, value: &DataType) -> std::fmt::Result {
        self.buffer.write_str("S.record(")?;
        self.process(key)?;
        self.buffer.write_str(", ")?;
        self.process(value)?;
        self.buffer.write_str(")")
    }

    fn unnamed_fields(&mut self, fields: &UnnamedFields) -> std::fmt::Result {
        if fields.fields().iter().any(Field::flatten) {
            unimplemented!("Flattened unnamed fields are not supported");
        }

        let fields: Vec<_> = fields
            .fields()
            .iter()
            .filter_map(|field| field.ty())
            .collect();

        self.tuple_iter(fields.iter().copied())
    }

    fn named_fields(&mut self, fields: &NamedFields) -> std::fmt::Result {
        self.buffer.write_str("S.struct({")?;

        for (name, field) in fields.fields() {
            let Some(ty) = field.ty() else {
                continue;
            };

            if field.flatten() {
                unimplemented!("Flattened named fields are not supported");
            }

            self.buffer.write_fmt(format_args!(r#""{name}": "#))?;
            self.process(ty)?;
            self.buffer.write_str(", ")?;
        }

        self.buffer.write_str("})")
    }

    pub(crate) fn anonymous_struct(&mut self, ast: &StructType) -> std::fmt::Result {
        match ast.fields() {
            StructFields::Unit => self.buffer.write_str("S.null"),
            StructFields::Unnamed(fields) => self.unnamed_fields(fields),
            StructFields::Named(fields) => self.named_fields(fields),
        }
    }

    #[allow(clippy::panic_in_result_fn)]
    fn struct_(&mut self, ast: &StructType) -> std::fmt::Result {
        let id = struct_statement_id(ast);
        let Some(specta_id) = id.specta_id() else {
            // anonymous struct
            return self.anonymous_struct(ast);
        };

        let Some(named) = self.context.global.types.get(specta_id) else {
            // anonymous struct
            // panic if generics
            assert_eq!(
                ast.generics().len(),
                0,
                "Anonymous struct with generics is not supported"
            );
            return self.anonymous_struct(ast);
        };

        let named = named.clone();
        let action = self.context.hoist(id, named.clone());

        match action {
            HoistAction::Hoisted => {
                // this becomes a reference
                let name = ast.name();
                assert!(
                    ast.generics().is_empty(),
                    "Cannot define generics on an inlined struct"
                );

                self.buffer.write_str(name)
            }
            HoistAction::DirectRecursion | HoistAction::ParentRecursion => {
                assert!(
                    ast.generics().is_empty(),
                    "Cannot define generics on an inlined struct"
                );

                self.buffer.write_str("S.suspend(() => ")?;
                self.buffer.write_str(named.name())?;
                self.buffer.write_str(")")
            }
        }
    }

    fn enum_variant(&mut self, variant: &EnumVariants) -> std::fmt::Result {
        match variant {
            EnumVariants::Unit => self.buffer.write_str("S.null"),
            EnumVariants::Named(named) => self.named_fields(named),
            EnumVariants::Unnamed(unnamed) => self.unnamed_fields(unnamed),
        }
    }

    fn enum_untagged<'item>(
        &mut self,
        variants: impl Iterator<Item = &'item (Cow<'static, str>, EnumVariant)>,
    ) -> std::fmt::Result {
        self.buffer.write_str("S.union(")?;

        let mut offset = 0;
        for (index, (_, variant)) in variants.enumerate() {
            if variant.skip() {
                offset += 1;
                continue;
            }

            // TODO: deprecated?!

            if index - offset > 0 {
                self.buffer.write_str(", ")?;
            }

            self.enum_variant(variant.inner())?;
        }

        self.buffer.write_str(")")
    }

    fn enum_external<'item>(
        &mut self,
        variants: impl Iterator<Item = &'item (Cow<'static, str>, EnumVariant)>,
    ) -> std::fmt::Result {
        self.buffer.write_str("S.union(")?;

        let mut offset = 0;
        for (index, (name, variant)) in variants.enumerate() {
            if variant.skip() {
                offset += 1;
                continue;
            }

            if index - offset > 0 {
                self.buffer.write_str(", ")?;
            }

            self.buffer.write_str("S.struct({")?;
            self.buffer.write_fmt(format_args!(r#""{name}": "#))?;
            self.enum_variant(variant.inner())?;
            self.buffer.write_str("})")?;
        }

        self.buffer.write_str(")")
    }

    fn enum_internal_struct_tag(&mut self, key: &str, value: &str) -> std::fmt::Result {
        self.buffer.write_str("S.struct({")?;
        self.buffer.write_fmt(format_args!(r#""{key}": "#))?;
        self.buffer
            .write_fmt(format_args!(r#"S.literal("{value}")"#))?;
        self.buffer.write_str("})")
    }

    fn enum_internal<'item>(
        &mut self,
        tag: &str,
        variants: impl Iterator<Item = &'item (Cow<'static, str>, EnumVariant)>,
    ) -> std::fmt::Result {
        self.buffer.write_str("S.union(")?;

        let mut offset = 0;
        for (index, (name, variant)) in variants.enumerate() {
            if variant.skip() {
                offset += 1;
                continue;
            }

            if index - offset > 0 {
                self.buffer.write_str(", ")?;
            }

            match variant.inner() {
                EnumVariants::Unit => {
                    self.enum_internal_struct_tag(tag, name)?;
                }
                EnumVariants::Named(fields) => {
                    self.buffer.write_str("S.compose(")?;
                    self.enum_internal_struct_tag(tag, name)?;
                    self.buffer.write_str(", ")?;
                    self.named_fields(fields)?;
                    self.buffer.write_str(")")?;
                }
                EnumVariants::Unnamed(_) => {
                    unreachable!("Unnamed enum variants are not supported")
                }
            }
        }

        self.buffer.write_str(")")
    }

    fn enum_adjacent<'item>(
        &mut self,
        tag: &str,
        content: &str,
        variants: impl Iterator<Item = &'item (Cow<'static, str>, EnumVariant)>,
    ) -> std::fmt::Result {
        self.buffer.write_str("S.union(")?;

        let mut offset = 0;
        for (index, (name, variant)) in variants.enumerate() {
            if variant.skip() {
                offset += 1;
                continue;
            }

            if index - offset > 0 {
                self.buffer.write_str(", ")?;
            }

            self.buffer.write_str("S.struct({")?;
            self.buffer.write_fmt(format_args!(r#""{tag}": "#))?;
            self.buffer
                .write_fmt(format_args!(r#"S.literal("{name}")"#))?;
            self.buffer.write_str(", ")?;
            self.buffer.write_fmt(format_args!(r#""{content}": "#))?;
            self.enum_variant(variant.inner())?;
            self.buffer.write_str("})")?;
        }

        self.buffer.write_str(")")
    }

    pub(crate) fn enum_(&mut self, ast: &EnumType) -> std::fmt::Result {
        match ast.repr() {
            EnumRepr::Untagged => self.enum_untagged(ast.variants().iter()),
            EnumRepr::External => self.enum_external(ast.variants().iter()),
            EnumRepr::Internal { tag } => self.enum_internal(tag, ast.variants().iter()),
            EnumRepr::Adjacent { tag, content } => {
                self.enum_adjacent(tag, content, ast.variants().iter())
            }
        }
    }

    fn tuple(&mut self, ast: &TupleType) -> std::fmt::Result {
        self.tuple_iter(ast.elements().iter())
    }

    fn result(&mut self, ok: &DataType, err: &DataType) -> std::fmt::Result {
        self.buffer.write_str("R.result(")?;
        self.process(ok)?;
        self.buffer.write_str(", ")?;
        self.process(err)?;
        self.buffer.write_str(")")
    }

    fn reference(&mut self, ast: &DataTypeReference) -> std::fmt::Result {
        self.buffer.write_str(ast.name())?;

        if ast.generics().is_empty() {
            return Ok(());
        }

        self.buffer.write_str("(")?;

        for (index, (_, generic)) in ast.generics().iter().enumerate() {
            if index > 0 {
                self.buffer.write_str(", ")?;
            }

            self.process(generic)?;
        }

        self.buffer.write_str(")")
    }

    fn generic(&mut self, ast: &GenericType) -> std::fmt::Result {
        self.buffer.write_str(Borrow::<str>::borrow(ast))
    }

    pub(crate) fn process(&mut self, ast: &DataType) -> std::fmt::Result {
        match ast {
            DataType::Any => self.buffer.write_str("S.any"),
            DataType::Unknown => self.buffer.write_str("S.unknown"),
            DataType::Primitive(primitive) => self.primitive(primitive),
            DataType::Literal(literal) => self.literal(literal),
            DataType::List(list) => self.list(list),
            DataType::Nullable(inner) => self.nullable(inner),
            DataType::Map(entry) => self.map(&entry.0, &entry.1),
            DataType::Struct(struct_) => self.struct_(struct_),
            DataType::Enum(enum_) => self.enum_(enum_),
            DataType::Tuple(tuple_) => self.tuple(tuple_),
            DataType::Result(result) => self.result(&result.0, &result.1),
            DataType::Reference(value) => self.reference(value),
            DataType::Generic(generic) => self.generic(generic),
        }
    }
}
