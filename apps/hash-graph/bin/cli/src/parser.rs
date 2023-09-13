use std::{ffi::OsStr, str::FromStr};

use clap::{builder::TypedValueParser, error::ErrorKind, Arg, Command, Error};

#[derive(Clone)]
pub struct OptionalSentryDsnParser;

impl TypedValueParser for OptionalSentryDsnParser {
    type Value = Option<sentry::types::Dsn>;

    fn parse_ref(
        &self,
        cmd: &Command,
        _: Option<&Arg>,
        value: &OsStr,
    ) -> Result<Self::Value, Error> {
        if value.is_empty() {
            Ok(None)
        } else {
            let Some(value) = value.to_str() else {
                return Err(Error::new(ErrorKind::InvalidValue).with_cmd(cmd));
            };

            sentry::types::Dsn::from_str(value)
                .map(Some)
                .map_err(|_error| Error::new(ErrorKind::InvalidValue))
        }
    }
}
