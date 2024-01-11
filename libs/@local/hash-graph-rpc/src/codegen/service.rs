use std::fmt::Write;

use error_stack::Result;
use heck::{AsLowerCamelCase, ToLowerCamelCase};
use specta::{DataTypeReference, NamedDataType, NamedType, TypeMap};
use thiserror::Error;

use crate::{
    harpc::{
        procedure::{ProcedureCall, RemoteProcedure},
        service::Service,
    },
    types::{Empty, Stack},
};

#[derive(Debug, Copy, Clone, Error)]
pub enum ServiceError {
    #[error("collect() must be called before render()")]
    RenderCalledBeforeCollect,
    #[error("Buffer error")]
    Buffer,
}

fn prepare_procedure<P>(
    types: &mut TypeMap,
) -> Result<(&NamedDataType, &NamedDataType), ServiceError>
where
    P: RemoteProcedure + NamedType,
    P::Response: NamedType,
{
    let request = types
        .get(P::SID)
        .ok_or(ServiceError::RenderCalledBeforeCollect)?;
    let response = types
        .get(P::Response::SID)
        .ok_or(ServiceError::RenderCalledBeforeCollect)?;

    // TODO: DataTypeReference instead!

    Ok((request, response))
}

fn render_reference(buffer: &mut impl Write, reference: &DataTypeReference) -> std::fmt::Result {
    buffer.write_str(reference.name())?;

    if reference.generics().is_empty() {
        return Ok(());
    }

    buffer.write_char('(')?;

    for (index, (_, generic)) in reference.generics().iter().enumerate() {
        if index > 0 {
            buffer.write_char(',')?;
        }

        // make the data type concrete through inline (needs the scope tho!)
    }

    buffer.write_char(')')
}

fn render_procedure<P>(
    buffer: &mut impl Write,
    request: &DataTypeReference,
    response: &DataTypeReference,
) -> std::fmt::Result
where
    P: RemoteProcedure + NamedType,
    P::Response: NamedType,
{
    buffer.write_str(".procedure(")?;

    buffer.write_fmt(format_args!(r#""{}""#, AsLowerCamelCase(P::NAME)))?;
    buffer.write_char(',')?;
    buffer.write_fmt(format_args!("Procedure.Id({:#x})", P::ID.value()))?;
    buffer.write_char(',')?;

    buffer.write_str(")")
}

fn render_service<S>(buffer: &mut impl Write) -> std::fmt::Result
where
    S: Service,
{
    buffer.write_fmt(format_args!("export const {} = Service.create(", S::NAME))?;
    buffer.write_fmt(format_args!("Service.Id({:#x})", S::ID.value()))?;
    buffer.write_char(',')?;
    buffer.write_fmt(format_args!("Service.Version({:#x})", S::VERSION.value()))?;
    buffer.write_char(')')?;

    todo!()
}

pub(crate) trait OutputServices {
    fn output<B: Write>(buffer: &mut B) -> std::fmt::Result;
}

impl OutputServices for Empty {
    fn output<B: Write>(_: &mut B) -> std::fmt::Result {
        Ok(())
    }
}

impl<S, Next> OutputServices for Stack<S, Next>
where
    S: Service,
    Next: OutputServices,
{
    fn output<B: Write>(buffer: &mut B) -> std::fmt::Result {
        render_service::<S>(buffer)?;

        Next::output(buffer)
    }
}
