use alloc::{boxed::Box, collections::BTreeMap};
use core::any::{Any, TypeId};

pub(crate) type Storage = BTreeMap<TypeId, BTreeMap<TypeId, Box<dyn Any>>>;

/// Private struct which is used to hold the information about the current count for every type.
/// This is used so that others cannot interfere with the counter and ensure that there's no
/// unexpected behavior.
pub(crate) struct Counter(isize);

impl Counter {
    pub(crate) const fn new(value: isize) -> Self {
        Self(value)
    }

    pub(crate) const fn as_inner(&self) -> isize {
        self.0
    }

    pub(crate) fn increment(&mut self) {
        self.0 += 1;
    }

    pub(crate) fn decrement(&mut self) {
        self.0 -= 1;
    }
}

pub(crate) struct Inner<T> {
    storage: Storage,
    extra: T,
}

impl<T> Inner<T> {
    pub(crate) fn new(extra: T) -> Self {
        Self {
            storage: Storage::new(),
            extra,
        }
    }
}

impl<T> Inner<T> {
    pub(crate) const fn storage(&self) -> &Storage {
        &self.storage
    }

    pub(crate) fn storage_mut(&mut self) -> &mut Storage {
        &mut self.storage
    }

    pub(crate) const fn extra(&self) -> &T {
        &self.extra
    }

    pub(crate) fn extra_mut(&mut self) -> &mut T {
        &mut self.extra
    }
}

macro_rules! impl_hook_context {
    ($(#[$meta:meta])* $vis:vis struct HookContext<$extra:ident> {..}) => {

// TODO: add link to serde hooks once implemented
// TODO: ideally we would want to make `HookContextInner` private, as it is an implementation
//  detail, but "attribute privacy" as outlined in https://github.com/rust-lang/rust/pull/61969
//  is currently not implemented for repr(transparent).
$(#[$meta])*
#[cfg_attr(not(doc), repr(transparent))]
$vis struct HookContext<T> {
    inner: $crate::hook::context::Inner<$extra>,
    _marker: core::marker::PhantomData<fn(&T)>,
}

impl HookContext<()> {
    pub(crate) fn new(extra: $extra) -> Self {
        Self {
            inner: $crate::hook::context::Inner::new(extra),
            _marker: core::marker::PhantomData,
        }
    }
}

impl<T> HookContext<T> {
    pub(crate) const fn inner(&self) -> &$crate::hook::context::Inner<$extra> {
        &self.inner
    }

    pub(crate) fn inner_mut(&mut self) -> &mut $crate::hook::context::Inner<$extra> {
        &mut self.inner
    }

    fn storage(&self) -> &$crate::hook::context::Storage {
        self.inner().storage()
    }

    fn storage_mut(&mut self) -> &mut $crate::hook::context::Storage {
        self.inner_mut().storage_mut()
    }
}

#[cfg(any(feature = "std", feature = "hooks"))]
impl<T> HookContext<T> {
    /// Cast the [`HookContext`] to a new type `U`.
    ///
    /// The storage of [`HookContext`] is partitioned, meaning that if `T` and `U` are different
    /// types the values stored in [`HookContext<_, T>`] will be separated from values in
    /// [`HookContext<_, U>`].
    ///
    /// In most situations this functions isn't needed, as it transparently casts between different
    /// partitions of the storage. Only hooks that share storage with hooks of different types
    /// should need to use this function.
    ///
    /// ### Example
    ///
    /// ```rust
    /// # // we only test with Rust 1.65, which means that `render()` is unused on earlier version
    /// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::Report;
    ///
    /// struct Warning(&'static str);
    /// struct Error(&'static str);
    ///
    /// Report::install_debug_hook::<Error>(|Error(frame), context| {
    ///     let idx = context.increment_counter() + 1;
    ///
    ///     context.push_body(format!("[{idx}] [ERROR] {frame}"));
    /// });
    /// Report::install_debug_hook::<Warning>(|Warning(frame), context| {
    ///     // We want to share the same counter with `Error`, so that we're able to have
    ///     // a global counter to keep track of all errors and warnings in order, this means
    ///     // we need to access the storage of `Error` using `cast()`.
    ///     let context = context.cast::<Error>();
    ///     let idx = context.increment_counter() + 1;
    ///     context.push_body(format!("[{idx}] [WARN] {frame}"))
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Error("unable to reach remote host"))
    ///     .attach(Warning("disk nearly full"))
    ///     .attach(Error("cannot resolve example.com: unknown host"));
    ///
    /// # Report::set_color_mode(error_stack::fmt::ColorMode::Color);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_cast.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_cast.snap"))]
    /// </pre>
    #[must_use]
    pub fn cast<U>(&mut self) -> &mut HookContext<U> {
        // SAFETY: `HookContext` is marked as repr(transparent) and the changed generic is only used
        // inside of the `PhantomData`
        unsafe { &mut *(self as *mut Self).cast::<HookContext<U>>() }
    }
}

#[cfg(any(feature = "std", feature = "hooks"))]
impl<T: 'static> HookContext<T> {
    /// Return a reference to a value of type `U`, if a value of that type exists.
    ///
    /// Values returned are isolated and "bound" to `T`, this means that [`HookContext<_, Warning>`]
    /// and [`HookContext<_, Error>`] do not share the same values. Values are only valid during the
    /// invocation of the corresponding call (e.g. [`Debug`]).
    ///
    /// [`Debug`]: core::fmt::Debug
    #[must_use]
    pub fn get<U: 'static>(&self) -> Option<&U> {
        self.storage()
            .get(&TypeId::of::<T>())?
            .get(&TypeId::of::<U>())?
            .downcast_ref()
    }

    /// Return a mutable reference to a value of type `U`, if a value of that type exists.
    ///
    /// Values returned are isolated and "bound" to `T`, this means that [`HookContext<_, Warning>`]
    /// and [`HookContext<_, Error>`] do not share the same values. Values are only valid during the
    /// invocation of the corresponding call (e.g. [`Debug`]).
    ///
    /// [`Debug`]: core::fmt::Debug
    pub fn get_mut<U: 'static>(&mut self) -> Option<&mut U> {
        self.storage_mut()
            .get_mut(&TypeId::of::<T>())?
            .get_mut(&TypeId::of::<U>())?
            .downcast_mut()
    }

    /// Insert a new value of type `U` into the storage of [`HookContext`].
    ///
    /// The returned value will the previously stored value of the same type `U` scoped over type
    /// `T`, if it existed, did no such value exist it will return [`None`].
    pub fn insert<U: 'static>(&mut self, value: U) -> Option<U> {
        self.storage_mut()
            .entry(TypeId::of::<T>())
            .or_default()
            .insert(TypeId::of::<U>(), Box::new(value))?
            .downcast()
            .map(|boxed| *boxed)
            .ok()
    }

    /// Remove the value of type `U` from the storage of [`HookContext`] if it existed.
    ///
    /// The returned value will be the previously stored value of the same type `U` if it existed in
    /// the scope of `T`, did no such value exist, it will return [`None`].
    pub fn remove<U: 'static>(&mut self) -> Option<U> {
        self.storage_mut()
            .get_mut(&TypeId::of::<T>())?
            .remove(&TypeId::of::<U>())?
            .downcast()
            .map(|boxed| *boxed)
            .ok()
    }

    /// One of the most common interactions with [`HookContext`] is a counter to reference previous
    /// frames in an entry to the appendix that was added using [`HookContext::push_appendix`].
    ///
    /// This is a utility method, which uses the other primitive methods provided to automatically
    /// increment a counter, if the counter wasn't initialized this method will return `0`.
    ///
    /// ```rust
    /// # // we only test with Rust 1.65, which means that `render()` is unused on earlier version
    /// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::Report;
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(value), context| {
    ///     let idx = context.increment_counter();
    ///     context.push_body(format!("suggestion {idx}: {value}"));
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Suggestion("use a file you can read next time!"))
    ///     .attach(Suggestion("don't press any random keys!"));
    ///
    /// # Report::set_color_mode(error_stack::fmt::ColorMode::Color);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_increment.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_increment.snap"))]
    /// </pre>
    ///
    /// [`Debug`]: core::fmt::Debug
    pub fn increment_counter(&mut self) -> isize {
        let counter = self.get_mut::<$crate::hook::context::Counter>();

        // reason: This would fail as we cannot move out of `self` because it is borrowed
        #[allow(clippy::option_if_let_else)]
        match counter {
            None => {
                // if the counter hasn't been set yet, default to `0`
                self.insert($crate::hook::context::Counter::new(0));

                0
            }
            Some(ctr) => {
                ctr.increment();

                ctr.as_inner()
            }
        }
    }

    /// One of the most common interactions with [`HookContext`] is a counter to reference previous
    /// frames in an entry to the appendix that was added using [`HookContext::push_appendix`].
    ///
    /// This is a utility method, which uses the other primitive method provided to automatically
    /// decrement a counter, if the counter wasn't initialized this method will return `-1` to stay
    /// consistent with [`HookContext::increment_counter`].
    ///
    /// ```rust
    /// # // we only test with Rust 1.65, which means that `render()` is unused on earlier version
    /// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::Report;
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(value), context| {
    ///     let idx = context.decrement_counter();
    ///     context.push_body(format!("suggestion {idx}: {value}"));
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Suggestion("use a file you can read next time!"))
    ///     .attach(Suggestion("don't press any random keys!"));
    ///
    /// # Report::set_color_mode(error_stack::fmt::ColorMode::Color);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_decrement.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_decrement.snap"))]
    /// </pre>
    pub fn decrement_counter(&mut self) -> isize {
        let counter = self.get_mut::<$crate::hook::context::Counter>();

        // reason: This would fail as we cannot move out of `self` because it is borrowed
        #[allow(clippy::option_if_let_else)]
        match counter {
            None => {
                // given that increment starts with `0` (which is therefore the implicit default
                // value) decrementing the default value results in `-1`,
                // which is why we output that value.
                self.insert($crate::hook::context::Counter::new(-1));

                -1
            }
            Some(ctr) => {
                ctr.decrement();

                ctr.as_inner()
            }
        }
    }
}
    };
}

pub(crate) use impl_hook_context;
