//! Secrets as clap arguments.

use alloc::{borrow::ToOwned as _, boxed::Box, format, string::String};
use core::{fmt, pin::Pin};
use std::ffi::OsStr;

use clap_builder::{
    Arg, Command, Error,
    builder::{TypedValueParser, ValueParserFactory},
    error::ErrorKind,
};

use crate::Secret;

/// Parses a text secret.
#[derive(Debug, Copy, Clone)]
struct TextValueParser;

impl TypedValueParser for TextValueParser {
    type Value = Pin<Box<Secret<str>>>;

    fn parse_ref(
        &self,
        cmd: &Command,
        arg: Option<&Arg>,
        value: &OsStr,
    ) -> Result<Self::Value, Error> {
        let text = utf8(cmd, arg, value)?;
        Ok(Secret::from_string(String::from(text)))
    }
}

/// Reads a text secret from a clap argument or its environment variable.
///
/// A value that is not valid UTF-8 is rejected. The error names the argument and its environment
/// variable and leaves out the value.
///
/// # Examples
///
/// ```
/// use core::pin::Pin;
///
/// use clap::Parser;
/// use hash_crypto::Secret;
///
/// #[derive(Parser)]
/// struct Args {
///     #[arg(long, env = "SERVICE_SECRET", hide_env_values = true)]
///     service_secret: Pin<Box<Secret<str>>>,
/// }
///
/// let args = Args::try_parse_from(["server", "--service-secret", "hunter2"])?;
/// assert_eq!(&*args.service_secret, "hunter2");
/// # Ok::<(), clap::Error>(())
/// ```
impl ValueParserFactory for Pin<Box<Secret<str>>> {
    type Parser = impl TypedValueParser<Value = Self>;

    fn value_parser() -> Self::Parser {
        TextValueParser
    }
}

/// Parses `N` secret bytes from `2 * N` hexadecimal digits.
#[derive(Debug, Copy, Clone)]
struct HexValueParser<const N: usize>;

impl<const N: usize> TypedValueParser for HexValueParser<N> {
    type Value = Pin<Box<Secret<[u8; N]>>>;

    fn parse_ref(
        &self,
        cmd: &Command,
        arg: Option<&Arg>,
        value: &OsStr,
    ) -> Result<Self::Value, Error> {
        let text = utf8(cmd, arg, value)?;
        Secret::<[u8; N]>::from_hex(String::from(text)).map_err(|report| {
            rejection(
                cmd,
                arg,
                ErrorKind::ValueValidation,
                report.current_context(),
            )
        })
    }
}

/// Reads `N` secret bytes from `2 * N` hexadecimal digits in a clap argument or its environment
/// variable.
///
/// The error names the argument, its environment variable and the reason, a
/// [`HexError`](crate::HexError) or invalid UTF-8, and leaves out the value.
///
/// # Examples
///
/// ```
/// use core::pin::Pin;
///
/// use clap::Parser;
/// use hash_crypto::Secret;
///
/// #[derive(Debug, Parser)]
/// struct Args {
///     #[arg(long, env = "ENCRYPTION_KEY", hide_env_values = true)]
///     encryption_key: Option<Pin<Box<Secret<[u8; 4]>>>>,
/// }
///
/// let args = Args::try_parse_from(["server", "--encryption-key", "deadbeef"])?;
/// let key = args.encryption_key.expect("the key should be set");
/// assert_eq!(&*key, b"\xDE\xAD\xBE\xEF".as_slice());
///
/// let error = Args::try_parse_from(["server", "--encryption-key", "deadbeeg"])
///     .expect_err("`g` is not a hexadecimal digit");
/// assert!(!error.to_string().contains("deadbee"));
/// # Ok::<(), clap::Error>(())
/// ```
impl<const N: usize> ValueParserFactory for Pin<Box<Secret<[u8; N]>>> {
    type Parser = impl TypedValueParser<Value = Self>;

    fn value_parser() -> Self::Parser {
        HexValueParser::<N>
    }
}

/// Parses secret bytes from an even number of hexadecimal digits.
#[derive(Debug, Copy, Clone)]
struct HexSliceValueParser;

impl TypedValueParser for HexSliceValueParser {
    type Value = Pin<Box<Secret<[u8]>>>;

    fn parse_ref(
        &self,
        cmd: &Command,
        arg: Option<&Arg>,
        value: &OsStr,
    ) -> Result<Self::Value, Error> {
        let text = utf8(cmd, arg, value)?;
        Secret::<[u8]>::from_hex(String::from(text)).map_err(|report| {
            rejection(
                cmd,
                arg,
                ErrorKind::ValueValidation,
                report.current_context(),
            )
        })
    }
}

/// Reads secret bytes from an even number of hexadecimal digits in a clap argument or its
/// environment variable.
///
/// The error names the argument, its environment variable and the reason, a
/// [`HexError`](crate::HexError) or invalid UTF-8, and leaves out the value.
///
/// # Examples
///
/// ```
/// use core::pin::Pin;
///
/// use clap::Parser;
/// use hash_crypto::Secret;
///
/// #[derive(Parser)]
/// struct Args {
///     #[arg(long, env = "SIGNING_KEY", hide_env_values = true)]
///     signing_key: Pin<Box<Secret<[u8]>>>,
/// }
///
/// let args = Args::try_parse_from(["server", "--signing-key", "deadbeef"])?;
/// assert_eq!(&*args.signing_key, b"\xDE\xAD\xBE\xEF".as_slice());
/// # Ok::<(), clap::Error>(())
/// ```
impl ValueParserFactory for Pin<Box<Secret<[u8]>>> {
    type Parser = impl TypedValueParser<Value = Self>;

    fn value_parser() -> Self::Parser {
        HexSliceValueParser
    }
}

/// The value as text, or an error that leaves the value out.
fn utf8<'value>(
    cmd: &Command,
    arg: Option<&Arg>,
    value: &'value OsStr,
) -> Result<&'value str, Error> {
    value
        .to_str()
        .ok_or_else(|| rejection(cmd, arg, ErrorKind::InvalidUtf8, "it is not valid UTF-8"))
}

/// An error that names the argument, its environment variable and the `reason`, but not the
/// value.
fn rejection(
    cmd: &Command,
    arg: Option<&Arg>,
    kind: ErrorKind,
    reason: impl fmt::Display,
) -> Error {
    let argument = arg.map_or_else(
        || "'...'".to_owned(),
        |arg| {
            arg.get_env().map_or_else(
                || format!("'{arg}'"),
                |variable| format!("'{arg}' ({})", variable.display()),
            )
        },
    );
    Error::raw(kind, format!("invalid value for {argument}: {reason}\n")).with_cmd(cmd)
}

#[cfg(test)]
mod tests {
    use alloc::{boxed::Box, string::ToString as _};
    use core::pin::Pin;
    use std::ffi::OsString;
    #[cfg(unix)]
    use std::os::unix::ffi::OsStringExt as _;

    use clap::{Arg, Command, error::ErrorKind};
    use rstest::rstest;

    use crate::{HexError, Secret};

    fn command() -> Command {
        Command::new("server")
            .arg(
                Arg::new("password")
                    .long("password")
                    .value_parser(clap::value_parser!(Pin<Box<Secret<str>>>)),
            )
            .arg(
                Arg::new("key")
                    .long("key")
                    .env("HASH_SECRET_TEST_KEY")
                    .value_parser(clap::value_parser!(Pin<Box<Secret<[u8; 4]>>>)),
            )
            .arg(
                Arg::new("bytes")
                    .long("bytes")
                    .value_parser(clap::value_parser!(Pin<Box<Secret<[u8]>>>)),
            )
    }

    #[test]
    fn text_parsed() {
        let matches = command()
            .try_get_matches_from(["server", "--password", "hunter2"])
            .expect("the password should parse");

        let password = matches
            .get_one::<Pin<Box<Secret<str>>>>("password")
            .expect("the password should be set");
        assert_eq!(&**password, "hunter2", "the secret should hold the text");
    }

    #[test]
    fn hex_parsed() {
        let matches = command()
            .try_get_matches_from(["server", "--key", "deadBEEF"])
            .expect("the key should parse");

        let key = matches
            .get_one::<Pin<Box<Secret<[u8; 4]>>>>("key")
            .expect("the key should be set");
        assert_eq!(
            &**key,
            b"\xDE\xAD\xBE\xEF".as_slice(),
            "the secret should hold the decoded bytes"
        );
    }

    #[test]
    fn hex_slice_parsed() {
        let matches = command()
            .try_get_matches_from(["server", "--bytes", "deadBEEF"])
            .expect("the bytes should parse");

        let bytes = matches
            .get_one::<Pin<Box<Secret<[u8]>>>>("bytes")
            .expect("the bytes should be set");
        assert_eq!(
            &**bytes,
            b"\xDE\xAD\xBE\xEF".as_slice(),
            "the secret should hold the decoded bytes"
        );
    }

    #[rstest]
    #[case::digit("--key", "deadbeeg", HexError::Digit)]
    #[case::odd_length("--key", "deadbee", HexError::Length { expected: 8 })]
    #[case::trailing_newline("--key", "deadbeef\n", HexError::Length { expected: 8 })]
    #[case::slice_digit("--bytes", "deadbeeg", HexError::Digit)]
    #[case::slice_odd_length("--bytes", "deadbee", HexError::OddLength)]
    fn hex_rejected(#[case] argument: &str, #[case] value: &str, #[case] reason: HexError) {
        let error = command()
            .try_get_matches_from(["server", argument, value])
            .expect_err("the value should be rejected");
        let message = error.to_string();

        assert_eq!(
            error.kind(),
            ErrorKind::ValueValidation,
            "the error should be a validation error"
        );
        assert!(
            message.contains(argument) && message.contains(&reason.to_string()),
            "the error should name the argument and the reason: {message}"
        );
        assert!(
            !message.contains(value.trim_end()),
            "the error should leave out the value: {message}"
        );
    }

    #[test]
    fn rejection_names_variable() {
        let error = command()
            .try_get_matches_from(["server", "--key", "deadbee"])
            .expect_err("the value should be rejected");

        assert!(
            error
                .to_string()
                .contains("'--key <key>' (HASH_SECRET_TEST_KEY)"),
            "the error should name the argument and its environment variable: {error}"
        );
    }

    #[cfg(unix)]
    #[rstest]
    #[case::text("--password")]
    #[case::hex("--key")]
    #[case::hex_slice("--bytes")]
    fn utf8_rejected(#[case] argument: &str) {
        let value = OsString::from_vec(b"hunter\xFF2".to_vec());
        let error = command()
            .try_get_matches_from([OsString::from("server"), OsString::from(argument), value])
            .expect_err("the value should be rejected");
        let message = error.to_string();

        assert_eq!(
            error.kind(),
            ErrorKind::InvalidUtf8,
            "the error kind should be InvalidUtf8"
        );
        assert!(
            !message.contains("hunter"),
            "the error should leave out the value: {message}"
        );
    }
}
