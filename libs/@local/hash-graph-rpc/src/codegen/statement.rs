use std::{borrow::Borrow, fmt::Write};

use bytes::BytesMut;
use specta::{
    DataType, EnumType, GenericType, NamedDataType, PrimitiveType, SpectaID, StructFields,
    StructType,
};

use crate::codegen::{
    context::{GlobalContext, ScopedContext, StatementId},
    inline::Inline,
};

pub(crate) struct StatementBuilder<'a> {
    pub(crate) context: ScopedContext<'a>,
    pub(crate) id: SpectaID,
    pub(crate) buffer: BytesMut,
}

impl<'a> StatementBuilder<'a> {
    pub(crate) fn new(context: &'a mut GlobalContext, ast: &'a NamedDataType) -> Self {
        let ext = ast
            .ext()
            .expect("NamedDataType must be gathered by TypeMap");

        let id = *ext.sid();

        Self {
            context: context.scoped(StatementId::local(id)),
            id,
            buffer: BytesMut::new(),
        }
    }

    fn export_interface(&mut self, name: &str) -> std::fmt::Result {
        self.buffer.write_fmt(format_args!(
            "export interface {name} extends S.Schema.To<typeof {name}> {{}}\n",
        ))?;

        self.buffer.write_fmt(format_args!(
            "export interface {name}From extends S.Schema.From<typeof {name}> {{}}\n",
        ))
    }

    fn function<'item>(
        &mut self,
        generics: impl Iterator<Item = &'item GenericType> + Clone,
    ) -> std::fmt::Result {
        self.buffer.write_char('<')?;
        for (index, generic) in generics.clone().enumerate() {
            let name: &str = generic.borrow();

            if index > 0 {
                self.buffer.write_char(',')?;
            }

            self.buffer.write_fmt(format_args!("{name}From, "))?;
            self.buffer.write_fmt(format_args!("{name}To, "))?;
        }
        self.buffer.write_char('>')?;
        self.buffer.write_char('(')?;

        for (index, generic) in generics.enumerate() {
            let name: &str = generic.borrow();

            if index > 0 {
                self.buffer.write_char(',')?;
            }

            self.buffer.write_str(name)?;
            self.buffer.write_str(": S.Schema<")?;
            self.buffer
                .write_fmt(format_args!("{name}From, {name}To"))?;
            self.buffer.write_char('>')?;
        }

        self.buffer.write_str(") => ")
    }

    fn struct_concrete(&mut self, ast: &StructType, export_interface: bool) -> std::fmt::Result {
        // we have a concrete type
        let mut inline = Inline::new(&mut self.context, &mut self.buffer);
        // we don't need to hoist or create a reference
        inline.anonymous_struct(ast)?;

        self.buffer.write_str(";\n")?;

        if export_interface {
            // generate an interface as well
            self.export_interface(ast.name())?;
        }

        Ok(())
    }

    fn struct_brand(&mut self, name: &str, inner: &DataType) -> std::fmt::Result {
        let mut inline = Inline::new(&mut self.context, &mut self.buffer);
        inline.process(inner)?;

        self.buffer.write_str(".pipe(S.brand('")?;
        self.buffer.write_str(name)?;
        self.buffer.write_str("'))")?;

        Ok(())
    }

    fn struct_(&mut self, ast: &StructType) -> std::fmt::Result {
        self.buffer
            .write_fmt(format_args!("export const {} = ", ast.name()))?;

        if ast.generics().is_empty() {
            // we also need to check if it is a single field, in that case we generate a nominal
            // brand
            if let StructFields::Unnamed(unnamed) = ast.fields() {
                if let [field] = unnamed.fields().as_slice() {
                    if let Some(ty) = field.ty() {
                        return self.struct_brand(ast.name(), ty);
                    }
                }
            }

            return self.struct_concrete(ast, true);
        }

        self.function(ast.generics().iter())?;
        self.struct_concrete(ast, false)
    }

    fn enum_concrete(&mut self, ast: &EnumType, export_interface: bool) -> std::fmt::Result {
        let mut inline = Inline::new(&mut self.context, &mut self.buffer);
        inline.enum_(ast)?;

        self.buffer.write_str(";\n")?;

        if export_interface {
            self.export_interface(ast.name())?;
        }

        Ok(())
    }

    fn enum_(&mut self, ast: &EnumType) -> std::fmt::Result {
        self.buffer
            .write_fmt(format_args!("export const {} = ", ast.name()))?;

        if !ast.generics().is_empty() {
            self.function(ast.generics().iter())?;
        }

        self.enum_concrete(ast, false)
    }

    fn branded(&mut self, name: &str, ast: &DataType) -> std::fmt::Result {
        // this is only possible if we have a branded type
        self.buffer
            .write_fmt(format_args!("export const {name} = "))?;

        let mut inline = Inline::new(&mut self.context, &mut self.buffer);
        inline.process(ast)?;

        self.buffer.write_str(".pipe(S.brand('")?;
        self.buffer.write_str(name)?;
        self.buffer.write_str("'));")?;

        self.buffer.write_fmt(format_args!(
            "export interface {name} extends S.Schema.To<typeof {name}> {{}}\n"
        ))?;
        self.buffer.write_fmt(format_args!(
            "export interface {name}From extends S.Schema.From<typeof {name}> {{}}\n"
        ))
    }

    // This is not perfect! We should be able to do this without taking ast or doing it in a single
    // step!
    #[allow(clippy::panic_in_result_fn)]
    pub(crate) fn process(mut self, ast: &NamedDataType) -> std::fmt::Result {
        assert_eq!(self.id, *ast.ext().expect("from typemap").sid());
        let id = self.id;

        match &ast.inner {
            DataType::Struct(struct_) => self.struct_(struct_)?,
            DataType::Enum(enum_) => self.enum_(enum_)?,
            other => self.branded(ast.name(), other)?,
        };

        self.context
            .global
            .statements
            .insert(StatementId::local(id), self.buffer.freeze());

        Ok(())
    }
}
