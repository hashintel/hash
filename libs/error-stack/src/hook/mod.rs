pub(crate) mod context;

#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::vec::Vec;

use crate::{
    fmt::{install_builtin_hooks, Hooks},
    Report,
};

#[cfg(feature = "std")]
type RwLock<T> = std::sync::RwLock<T>;

// Generally the std mutex is faster than spin, so if both `std` and `hooks` is enabled we use the
// std variant.
#[cfg(all(not(feature = "std"), feature = "hooks"))]
type RwLock<T> = spin::rwlock::RwLock<T>;

static FMT_HOOK: RwLock<Hooks> = RwLock::new(Hooks { inner: Vec::new() });

impl Report<()> {
    /// Can be used to globally set a [`Debug`] format hook, for a specific type `T`.
    ///
    /// This hook will be called on every [`Debug`] call, if an attachment with the same type has
    /// been found.
    ///
    /// [`Debug`]: core::fmt::Debug
    ///
    /// # Examples
    ///
    /// ```rust
    /// # // we only test the snapshot on nightly, therefore report is unused (so is render)
    /// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::{Error, ErrorKind};
    ///
    /// use error_stack::{
    ///     report, Report,
    /// };
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|value, context| {
    ///     context.push_body(format!("suggestion: {}", value.0));
    /// });
    ///
    /// let report =
    ///     report!(Error::from(ErrorKind::InvalidInput)).attach(Suggestion("oh no, try again"));
    ///
    /// # Report::set_color_mode(error_stack::fmt::ColorMode::Emphasis);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
    /// #
    /// #     ansi_to_html::convert(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(nightly)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/hook__debug_hook.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// Which will result in something like:
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/hook__debug_hook.snap"))]
    /// </pre>
    ///
    /// This example showcases the ability of hooks to be invoked for values provided via the
    /// Provider API using [`Error::provide`].
    ///
    /// ```rust
    /// # // this is a lot of boilerplate, if you find a better way, please change this!
    /// # // with #![cfg(nightly)] docsrs will complain that there's no main in non-nightly
    /// # #![cfg_attr(nightly, feature(error_in_core, error_generic_member_access))]
    /// # const _: &'static str = r#"
    /// #![feature(error_generic_member_access)]
    /// # "#;
    ///
    /// # #[cfg(nightly)]
    /// # mod nightly {
    /// use std::error::{Request, Error};
    /// use std::fmt::{Display, Formatter};
    /// use error_stack::{Report, report};
    ///
    /// struct Suggestion(&'static str);
    ///
    /// #[derive(Debug)]
    /// struct ErrorCode(u64);
    ///
    ///
    /// #[derive(Debug)]
    /// struct UserError {
    ///     code: ErrorCode
    /// }
    ///
    /// impl Display for UserError {
    ///     fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
    ///         f.write_str("invalid user input")
    ///     }
    /// }
    ///
    /// impl Error for UserError {
    ///  fn provide<'a>(&'a self, req: &mut Request<'a>) {
    ///    req.provide_value(Suggestion("try better next time!"));
    ///    req.provide_ref(&self.code);
    ///  }
    /// }
    ///
    /// # pub fn main() {
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(value), context| {
    ///     context.push_body(format!("suggestion: {value}"));
    /// });
    /// Report::install_debug_hook::<ErrorCode>(|ErrorCode(value), context| {
    ///     context.push_body(format!("error code: {value}"));
    /// });
    ///
    /// let report = report!(UserError {code: ErrorCode(420)});
    ///
    /// # Report::set_color_mode(error_stack::fmt::ColorMode::Emphasis);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
    /// #
    /// #     ansi_to_html::convert(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/hook__debug_hook_provide.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// # }
    /// # }
    /// # #[cfg(not(nightly))]
    /// # fn main() {}
    /// # #[cfg(nightly)]
    /// # fn main() {nightly::main()}
    /// ```
    ///
    /// Which will result in something like:
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/hook__debug_hook_provide.snap"))]
    /// </pre>
    ///
    /// `error-stack` comes with some built-in hooks which can be overwritten. This is useful if you
    /// want to change the output of the built-in hooks, or if you want to add additional
    /// information to the output. For example, you can override the built-in hook for [`Location`]
    /// to hide the file path:
    ///
    /// ```rust
    /// # // we only test the snapshot on nightly, therefore report is unused (so is render)
    /// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
    /// use std::{
    ///     io::{Error, ErrorKind},
    ///     panic::Location,
    /// };
    ///
    /// error_stack::Report::install_debug_hook::<Location>(|_location, _context| {
    ///     // Intentionally left empty so nothing will be printed
    /// });
    ///
    /// let report = error_stack::report!(Error::from(ErrorKind::InvalidInput));
    ///
    /// # error_stack::Report::set_color_mode(error_stack::fmt::ColorMode::Emphasis);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
    /// #
    /// #     ansi_to_html::convert(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(nightly)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/hook__location_hook.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// Which will result in something like:
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/hook__location_hook.snap"))]
    /// </pre>
    ///
    /// [`Location`]: std::panic::Location
    /// [`Error::provide`]: std::error::Error::provide
    #[cfg(any(feature = "std", feature = "hooks"))]
    pub fn install_debug_hook<T: Send + Sync + 'static>(
        hook: impl Fn(&T, &mut crate::fmt::HookContext<T>) + Send + Sync + 'static,
    ) {
        install_builtin_hooks();

        // TODO: Use `let ... else` when MSRV is 1.65
        #[cfg(feature = "std")]
        let mut lock = FMT_HOOK.write().unwrap_or_else(|_| {
            unreachable!(
                "Hook is poisoned. This is considered a bug and should be reported to \
                https://github.com/hashintel/hash/issues/new/choose"
            )
        });

        // The spin RwLock cannot panic
        #[cfg(all(not(feature = "std"), feature = "hooks"))]
        let mut lock = FMT_HOOK.write();

        lock.insert(hook);
    }

    /// Returns the hook that was previously set by [`install_debug_hook`]
    ///
    /// [`install_debug_hook`]: Self::install_debug_hook
    #[cfg(any(feature = "std", feature = "hooks"))]
    pub(crate) fn invoke_debug_format_hook<T>(closure: impl FnOnce(&Hooks) -> T) -> T {
        install_builtin_hooks();

        // TODO: Use `let ... else` when MSRV is 1.65
        #[cfg(feature = "std")]
        let hook = FMT_HOOK.read().unwrap_or_else(|_| {
            unreachable!(
                "Hook is poisoned. This is considered a bug and should be reported to \
                https://github.com/hashintel/hash/issues/new/choose"
            )
        });

        // The spin RwLock cannot panic
        #[cfg(all(not(feature = "std"), feature = "hooks"))]
        let hook = FMT_HOOK.read();

        closure(&hook)
    }
}
