use std::fmt::Write;

use bytes::{Bytes, BytesMut};
use error_stack::{Report, Result, ResultExt};
use specta::TypeMap;
use thiserror::Error;

pub(crate) use self::service::ExportServices;
use crate::codegen::{context::GlobalContext, statement::StatementBuilder};

mod context;
mod inline;
mod service;
mod statement;

#[derive(Debug, Copy, Clone, Error)]
pub enum ExportError {
    #[error("Invalid statement")]
    InvalidStatement,
    #[error("Statement not found")]
    StatementNotFound,
    #[error("Buffer error")]
    Buffer,
    #[error("Ordering Incomplete")]
    OrderingIncomplete,
}

fn export_imports(buffer: &mut BytesMut) -> std::fmt::Result {
    buffer.write_str(r#"import * as S from "@effect/schema/Schema";"#)?;
    buffer.write_char('\n')?;

    buffer.write_str(r#"import * as R from "@local/schema/Rust;"#)?;
    buffer.write_char('\n')?;

    // TODO: name?!
    buffer.write_str(r#"import * as E from "@local/schema/Extra";"#)?;
    buffer.write_char('\n')?;

    // TODO: rename package
    buffer.write_str(r#"import * as Service from "@local/hash-graph-rpc-ts-client/Service";"#)?;
    buffer.write_char('\n')?;

    buffer
        .write_str(r#"import * as Procedure from "@local/hash-graph-rpc-ts-client/Procedure";"#)?;
    buffer.write_char('\n')
}

// TODO: flatten should work properly, although that is a lot more complicated.
// takes ownership of context to prevent that we accidentally add something to the queue later
fn export_types(mut context: GlobalContext) -> Result<BytesMut, ExportError> {
    while let Some(ast) = context.queue.pop() {
        let statement = StatementBuilder::new(&mut context, &ast);

        statement
            .process(&ast)
            .change_context(ExportError::InvalidStatement)?;
    }

    let mut buffer = BytesMut::new();
    export_imports(&mut buffer).change_context(ExportError::Buffer)?;

    for id in context.ordering.iter() {
        let statement = context
            .statements
            .remove(id)
            .ok_or(ExportError::StatementNotFound)?;

        buffer.extend_from_slice(&statement);
    }

    if !context.statements.is_empty() {
        return Err(Report::new(ExportError::OrderingIncomplete));
    }

    Ok(buffer)
}

#[allow(clippy::missing_errors_doc)]
pub fn export<S>(map: TypeMap) -> Result<Bytes, ExportError>
where
    S: ExportServices,
{
    let mut trailer = BytesMut::new();
    let mut context = GlobalContext::new(map);

    S::output(&mut trailer, &mut context).change_context(ExportError::Buffer)?;

    let mut buffer = export_types(context)?;

    buffer
        .write_str("\n\n")
        .change_context(ExportError::Buffer)?;

    buffer.extend_from_slice(&trailer);

    Ok(buffer.freeze())
}
