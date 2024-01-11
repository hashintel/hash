use std::fmt::Write;

use bytes::{Bytes, BytesMut};
use error_stack::{Report, Result, ResultExt};
use specta::TypeMap;
use thiserror::Error;

use crate::{
    codegen::{
        context::{GlobalContext, Statement},
        service::OutputServices,
        statement::StatementBuilder,
    },
    harpc::service::Service,
    types::{Empty, Stack},
};

mod context;
mod inline;
mod service;
mod statement;

#[derive(Debug, Copy, Clone, Error)]
pub enum Error {
    #[error("Invalid statement")]
    InvalidStatement,
    #[error("Statement not found")]
    StatementNotFound,
    #[error("Buffer error")]
    Buffer,
    #[error("Ordering Incomplete")]
    OrderingIncomplete,
}

fn render_imports(buffer: &mut BytesMut) -> std::fmt::Result {
    buffer.write_str(r#"import * as S from "@effect/schema/Schema";"#)?;
    buffer.write_char('\n')?;

    buffer.write_str(r#"import * as R from "@local/schema/Rust;"#)?;
    buffer.write_char('\n')?;

    // TODO: name?!
    buffer.write_str(r#"import * as E from "@local/schema/Extra";"#)?;
    buffer.write_char('\n')
}

// TODO: flatten should work properly, although that is a lot more complicated.
fn render_type_map(map: TypeMap) -> Result<BytesMut, Error> {
    let mut context = GlobalContext::new(map);

    while let Some(ast) = context.queue.pop() {
        let statement = StatementBuilder::new(&mut context, &ast);

        statement
            .process(&ast)
            .change_context(Error::InvalidStatement)?;
    }

    let mut buffer = BytesMut::new();
    render_imports(&mut buffer).change_context(Error::Buffer)?;

    for id in context.ordering.iter() {
        let statement = context
            .statements
            .remove(id)
            .ok_or(Error::StatementNotFound)?;

        buffer.extend_from_slice(&statement);
    }

    if !context.statements.is_empty() {
        return Err(Report::new(Error::OrderingIncomplete));
    }

    Ok(buffer)
}

pub fn render<S>(map: TypeMap) -> Result<Bytes, Error>
where
    S: OutputServices,
{
    let mut buffer = render_type_map(map)?;

    buffer.write_str("\n\n").change_context(Error::Buffer)?;
    S::output(&mut buffer).change_context(Error::Buffer)?;

    Ok(buffer.freeze())
}
