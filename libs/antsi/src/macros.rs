#[cfg(nightly)]
macro_rules! impl_const {
    (
        impl $(< $($arg:ident),* $(,)? >)? const?
        $trait:ident$(< $($targ:ident),* $(,)? >)? for
        $target:ty $(where
            $($type:ident : $(~$const:tt)? $bound:path),*
        )?
        { $($body:tt)* }
    ) => {
        impl $(< $($arg),* >)? const $trait $(< $($targ),* >)? for $target
        $(where
            $($type : $(~$const)? $bound),*
        )?
        {
             $($body)*
        }
    };

    (
        #[nightly]
        $(#[$meta:meta])*
        $vis:vis const fn $name:ident($($args:tt)*) -> $ret:ty {
            $($body:tt)*
        }
    ) => {
        $(#[$meta])*
        $vis const fn $name($($args)+) -> $ret {
            $($body)*
        }
    };

    (
        #[stable]
        $(#[$meta:meta])*
        $vis:vis const fn $name:ident($($args:tt)*) -> $ret:ty {
            $($body:tt)*
        }
    ) => {
    };
}

#[cfg(not(nightly))]
macro_rules! impl_const {
    (
        impl $(< $($arg:ident),* $(,)? >)? const?
        $trait:ident$(< $($targ:ident),* $(,)? >)? for
        $target:ty $(where
            $($type:ident : $(~$const:tt)? $bound:path),*
        )?
        { $($body:tt)* }
    ) => {
        impl $(< $($arg),* >)? $trait $(< $($targ),* >)? for $target
        $(where
            $($type : $bound),*
        )?
        {
             $($body)*
        }
    };

    (
        #[nightly]
        $(#[$meta:meta])*
        $vis:vis const fn $name:ident($($args:tt)*) -> $ret:ty {
            $($body:tt)*
        }
    ) => {
    };

    (
        #[stable]
        $(#[$meta:meta])*
        $vis:vis const fn $name:ident($($args:tt)*) -> $ret:ty {
            $($body:tt)*
        }
    ) => {
        $(#[$meta])*
        $vis const fn $name($($args)+) -> $ret {
            $($body)*
        }
    };
}

pub(crate) use impl_const;
