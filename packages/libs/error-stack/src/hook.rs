use std::{
    error::Error,
    fmt,
    sync::{RwLock, RwLockReadGuard},
};

use once_cell::sync::{Lazy, OnceCell};

use crate::{
    fmt::{Call, Emit, HookContext, Hooks},
    Frame, Report, Result,
};

type FormatterHook = Box<dyn Fn(&Report<()>, &mut fmt::Formatter<'_>) -> fmt::Result + Send + Sync>;

static FMT_HOOK: Lazy<RwLock<Hooks>> = Lazy::new(|| RwLock::new(Hooks::new()));
static DEBUG_HOOK: OnceCell<FormatterHook> = OnceCell::new();
static DISPLAY_HOOK: OnceCell<FormatterHook> = OnceCell::new();

/// A hook can only be set once.
///
/// Returned by [`Report::set_debug_hook()`] or [`Report::set_display_hook()`] if a hook was already
/// set.
#[derive(Debug, Copy, Clone)]
#[non_exhaustive]
pub struct HookAlreadySet;

impl fmt::Display for HookAlreadySet {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Hook can only be set once")
    }
}

impl Error for HookAlreadySet {}

impl Report<()> {
    /// Can be used to globally set a [`Debug`] format hook, for a specific type `T`, this [`Hook`]
    /// will be called on every [`Debug`] call, if an attachment with the same type has been found.
    ///
    /// [`Debug`]: core::fmt::Debug
    ///
    /// # Example
    ///
    /// ```
    /// use std::io::{Error, ErrorKind};
    ///
    /// use error_stack::{
    ///     fmt::{self, Emit},
    ///     report, Report,
    /// };
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|val, ctx| {
    ///     Emit::Next(format!("Suggestion: {}", val.0))
    /// });
    ///
    /// let report =
    ///     report!(Error::from(ErrorKind::InvalidInput)).attach(Suggestion("O no, try again"));
    /// assert!(format!("{report:?}").starts_with("Suggestion: O no, try again"));
    /// ```
    #[cfg(feature = "hooks")]
    pub fn install_debug_hook<T>(hook: impl Fn(&T, &mut HookContext<T>) -> Emit) {
        let mut lock = FMT_HOOK.write().expect("should not be poisoned");
        lock.insert(hook);
    }

    /// Can be used to globally set the fallback [`Debug`] hook, which is called for every
    /// attachment for which a hook wasn't registered using [`install_debug_hook`].
    ///
    /// You can refer to the `debug_stack` for a more in-depth look, as to how to potentially
    /// exploit the fallback for more advanced use-cases, like using a, immutable builder pattern
    /// instead, or a trait based approach.
    ///
    /// [`Debug`]: core::fmt::Debug
    /// [`install_debug_hook`]: Self::install_debug_hook
    ///
    /// # Example
    ///
    /// ```
    /// use std::io::{Error, ErrorKind};
    ///
    /// use error_stack::{
    ///     fmt::{self, Call, Emit},
    ///     report, Report,
    /// };
    ///
    /// struct Suggestion(&'static str);
    ///
    /// // This will remove all formatting for `Backtrace` and `SpanTrace`!
    /// // The example after this once calls `builtin()`, which makes sure that we always print
    /// // `Backtrace` and `SpanTrace`.
    /// Report::install_debug_hook_fallback(|val, ctx| Call::Find(Emit::next("unknown")));
    ///
    /// let report =
    ///     report!(Error::from(ErrorKind::InvalidInput)).attach(Suggestion("O no, try again"));
    /// assert!(format!("{report:?}").starts_with("Suggestion: O no, try again"));
    ///
    /// Report::install_debug_hook_fallback(|val, ctx| {
    ///     // first run all builtin hooks to make sure that we print backtrace and spantrace
    ///     match fmt::builtin(val, ctx) {
    ///         Call::Miss(_) => Call::Find(Emit::next("unknown")),
    ///         Call::Find(emit) => Call::Find(emit),
    ///     }
    /// });
    ///
    /// let report =
    ///     report!(Error::from(ErrorKind::InvalidInput)).attach(Suggestion("O no, try again"));
    /// assert!(format!("{report:?}").starts_with("Suggestion: O no, try again"));
    /// ```
    pub fn install_debug_hook_fallback(
        hook: impl for<'a> Fn(&Frame, HookContext<'a, Frame>) -> Call<'a, Frame>,
    ) {
        let mut lock = FMT_HOOK.write().expect("should not be poisoned");
        lock.fallback(hook);
    }

    /// Returns the hook that was previously set by [`install_debug_hook`]
    ///
    /// [`install_hook`]: Self::install_debug_hook
    #[cfg(feature = "hooks")]
    pub(crate) fn format_hook() -> RwLockReadGuard<'static, Hooks> {
        FMT_HOOK.read().expect("should not be poisoned")
    }

    /// Globally sets a hook which is called when formatting [`Report`] with the [`Debug`] trait.
    ///
    /// By intercepting the default [`Debug`] implementation, this hook adds the possibility for
    /// downstream crates to provide their own formatting like colored output or a machine-readable
    /// output (i.e. JSON).
    ///
    /// If not set, [`Debug`] will print
    ///   * The latest error
    ///   * The errors causes
    ///   * The [`Backtrace`] and [`SpanTrace`] **if captured**
    ///
    /// [`Debug`]: fmt::Debug
    /// [`Backtrace`]: std::backtrace::Backtrace
    /// [`SpanTrace`]: tracing_error::SpanTrace
    ///
    /// # Errors
    ///
    /// - Returns an error if a debug hook was already set
    ///
    /// # Example
    ///
    /// ```
    /// use std::io::{Error, ErrorKind};
    ///
    /// use error_stack::{report, Report};
    ///
    /// # fn main() -> Result<(), Report<error_stack::HookAlreadySet>> {
    /// # #[allow(deprecated)]
    /// Report::set_debug_hook(|_, fmt| write!(fmt, "custom debug implementation"))?;
    ///
    /// let report = report!(Error::from(ErrorKind::InvalidInput));
    /// assert_eq!(format!("{report:?}"), "custom debug implementation");
    /// # Ok(()) }
    /// ```
    #[deprecated = "use Report::install_hook() instead"]
    #[cfg(feature = "hooks")]
    pub fn set_debug_hook<H>(hook: H) -> Result<(), HookAlreadySet>
    where
        H: Fn(&Self, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static,
    {
        DEBUG_HOOK
            .set(Box::new(hook))
            .map_err(|_| Report::new(HookAlreadySet))
    }

    /// Returns the hook that was previously set by [`set_debug_hook`], if any.
    ///
    /// [`set_debug_hook`]: Self::set_debug_hook
    #[cfg(feature = "hooks")]
    pub(crate) fn debug_hook()
    -> Option<&'static (impl Fn(&Self, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static)>
    {
        DEBUG_HOOK.get()
    }

    /// Globally sets a hook that is called when formatting [`Report`] with the [`Display`] trait.
    ///
    /// By intercepting the default [`Display`] implementation, this hook adds the possibility
    /// for downstream crates to provide their own formatting like colored output or a
    /// machine-readable output (i.e. JSON).
    ///
    /// If not set, [`Display`] will print the latest error and, if alternate formatting is enabled
    /// (`"{:#}"`) and it exists, its direct cause.
    ///
    /// [`Display`]: fmt::Display
    ///
    /// # Errors
    ///
    /// - Returns an error if a display hook was already set
    ///
    /// # Example
    ///
    /// ```
    /// use std::io::{Error, ErrorKind};
    ///
    /// use error_stack::{report, Report};
    ///
    /// # fn main() -> Result<(), Report<error_stack::HookAlreadySet>> {
    /// # #[allow(deprecated)]
    /// Report::set_display_hook(|_, fmt| write!(fmt, "custom display implementation"))?;
    ///
    /// let report = report!(Error::from(ErrorKind::InvalidInput));
    /// assert_eq!(report.to_string(), "custom display implementation");
    /// # Ok(()) }
    /// ```
    #[deprecated]
    #[cfg(feature = "hooks")]
    pub fn set_display_hook<H>(hook: H) -> Result<(), HookAlreadySet>
    where
        H: Fn(&Self, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static,
    {
        DISPLAY_HOOK
            .set(Box::new(hook))
            .map_err(|_| Report::new(HookAlreadySet))
    }

    /// Returns the hook that was previously set by [`set_display_hook`], if any.
    ///
    /// [`set_display_hook`]: Self::set_display_hook
    #[cfg(feature = "hooks")]
    pub(crate) fn display_hook()
    -> Option<&'static (impl Fn(&Self, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static)>
    {
        DISPLAY_HOOK.get()
    }
}

impl<T> Report<T> {
    /// Converts the `&Report<T>` to `&Report<()>` without modifying the frame stack.
    ///
    /// Changing `Report<T>` to `Report<()>` is only used internally for calling [`debug_hook`] and
    /// [`display_hook`] and is intentionally not exposed.
    ///
    /// [`debug_hook`]: Self::debug_hook
    /// [`display_hook`]: Self::display_hook
    pub(crate) const fn generalized(&self) -> &Report<()> {
        // SAFETY: `Report` is repr(transparent), so it's safe to cast between `Report<A>` and
        //         `Report<B>`
        unsafe { &*(self as *const Self).cast() }
    }
}
