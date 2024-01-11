use std::fmt::Write;

use bytes::BytesMut;
use heck::AsLowerCamelCase;
use specta::{NamedType, Type};

use crate::{
    codegen::{
        context::{GlobalContext, Statement},
        inline::Inline,
    },
    harpc::{procedure::RemoteProcedure, service::Service},
    types::{Empty, Stack},
};

fn render_procedure<P>(buffer: &mut BytesMut, context: &mut GlobalContext) -> std::fmt::Result
where
    P: RemoteProcedure + NamedType,
    P::Response: NamedType,
{
    let request = P::reference(&mut context.types, &[]);
    let response = P::Response::reference(&mut context.types, &[]);

    buffer.write_str(".procedure(")?;

    buffer.write_fmt(format_args!(r#""{}""#, AsLowerCamelCase(P::NAME)))?;
    buffer.write_char(',')?;
    buffer.write_fmt(format_args!("Procedure.Id({:#x})", P::ID.value()))?;
    buffer.write_char(',')?;

    let mut scope = context.scoped(Statement(P::SID));
    let mut inline = Inline::new(&mut scope, buffer);
    inline.process(&request.inner)?;

    buffer.write_char(',')?;

    let mut scope = context.scoped(Statement(P::Response::SID));
    let mut inline = Inline::new(&mut scope, buffer);
    inline.process(&response.inner)?;

    buffer.write_str(")")
}

trait ExportProcedures {
    fn output(buffer: &mut BytesMut, context: &mut GlobalContext) -> std::fmt::Result;
}

impl ExportProcedures for Empty {
    fn output(_: &mut BytesMut, _: &mut GlobalContext) -> std::fmt::Result {
        Ok(())
    }
}

impl<P, Tail> ExportProcedures for Stack<P, Tail>
where
    P: RemoteProcedure + NamedType,
    P::Response: NamedType,
    Tail: ExportProcedures,
{
    fn output(buffer: &mut BytesMut, context: &mut GlobalContext) -> std::fmt::Result {
        render_procedure::<P>(buffer, context)?;

        Tail::output(buffer, context)
    }
}

fn render_service<S>(buffer: &mut BytesMut, context: &mut GlobalContext) -> std::fmt::Result
where
    S: Service,
    S::Procedures: ExportProcedures,
{
    buffer.write_fmt(format_args!("export const {} = Service.create(", S::NAME))?;
    buffer.write_fmt(format_args!("Service.Id({:#x})", S::ID.value()))?;
    buffer.write_char(',')?;
    buffer.write_fmt(format_args!("Service.Version({:#x})", S::VERSION.value()))?;
    buffer.write_char(')')?;

    S::Procedures::output(buffer, context)?;

    buffer.write_str(";\n")
}

pub trait ExportServices {
    fn output(buffer: &mut BytesMut, context: &mut GlobalContext) -> std::fmt::Result;
}

impl ExportServices for Empty {
    fn output(_: &mut BytesMut, _: &mut GlobalContext) -> std::fmt::Result {
        Ok(())
    }
}

impl<S, Tail> ExportServices for Stack<S, Tail>
where
    S: Service,
    S::Procedures: ExportProcedures,
    Tail: ExportServices,
{
    fn output(buffer: &mut BytesMut, context: &mut GlobalContext) -> std::fmt::Result {
        render_service::<S>(buffer, context)?;

        Tail::output(buffer, context)
    }
}
