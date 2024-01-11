use std::fmt::Write;

use bytes::BytesMut;
use heck::AsLowerCamelCase;
use specta::{NamedType, Type};
use thiserror::Error;

use crate::{
    codegen::{
        context::{GlobalContext, Statement},
        inline::Inline,
    },
    harpc::{procedure::RemoteProcedure, service::Service},
    types::{Empty, Stack},
};

#[derive(Debug, Copy, Clone, Error)]
pub enum ServiceError {
    #[error("collect() must be called before render()")]
    RenderCalledBeforeCollect,
    #[error("Buffer error")]
    Buffer,
}

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

    let mut inline = Inline::new(&mut context.scoped(Statement(P::SID)), buffer);
    inline.process(&request.inner)?;

    buffer.write_char(',')?;

    let mut inline = Inline::new(&mut context.scoped(Statement(P::SID)), buffer);
    inline.process(&response.inner)?;

    buffer.write_str(")")
}

trait OutputProcedures {
    fn output(buffer: &mut BytesMut, context: &mut GlobalContext) -> std::fmt::Result;
}

impl OutputProcedures for Empty {
    fn output(_: &mut BytesMut, _: &mut GlobalContext) -> std::fmt::Result {
        Ok(())
    }
}

impl<P, Next> OutputProcedures for Stack<P, Next>
where
    P: RemoteProcedure + NamedType,
    P::Response: NamedType,
    Next: OutputProcedures,
{
    fn output(buffer: &mut BytesMut, context: &mut GlobalContext) -> std::fmt::Result {
        render_procedure::<P>(buffer, context)?;

        Next::output(buffer, context)
    }
}

fn render_service<S>(buffer: &mut BytesMut, context: &mut GlobalContext) -> std::fmt::Result
where
    S: Service,
    S::Procedures: OutputProcedures,
{
    buffer.write_fmt(format_args!("export const {} = Service.create(", S::NAME))?;
    buffer.write_fmt(format_args!("Service.Id({:#x})", S::ID.value()))?;
    buffer.write_char(',')?;
    buffer.write_fmt(format_args!("Service.Version({:#x})", S::VERSION.value()))?;
    buffer.write_char(')')?;

    S::Procedures::output(buffer, context)?;

    buffer.write_str(";\n")
}

pub(crate) trait OutputServices {
    fn output(buffer: &mut BytesMut, context: &mut GlobalContext) -> std::fmt::Result;
}

impl OutputServices for Empty {
    fn output(_: &mut BytesMut, _: &mut GlobalContext) -> std::fmt::Result {
        Ok(())
    }
}

impl<S, Next> OutputServices for Stack<S, Next>
where
    S: Service,
    S::Procedures: OutputProcedures,
    Next: OutputServices,
{
    fn output(buffer: &mut BytesMut, context: &mut GlobalContext) -> std::fmt::Result {
        render_service::<S>(buffer, context)?;

        Next::output(buffer, context)
    }
}
