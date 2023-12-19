pub mod account;

macro_rules! service {
    (@collect
        $(rpc $name:ident($($args:tt)*) $(-> $output:ty)?;)*
    ) => {
        $crate::types::stack![$($name ,)*]
    };

    (@procedure[$vis:vis]) => {};

    (@procedure[$vis:vis] rpc $name:ident() $(-> $output:ty)?; $($rest:tt)*) => {
        #[derive(serde::Serialize, serde::Deserialize)]
        $vis struct $name;

        impl $crate::rpc::RemoteProcedure for $name {
            #[allow(unused_parens)]
            type Response = ($($output)?);

            const ID: $crate::rpc::ProcedureId = $crate::rpc::ProcedureId::derive(stringify!($name));
        }

        service!(@procedure[$vis] $($rest)*);
    };

    (@procedure[$vis:vis] rpc $name:ident($($fields:tt)+) $(-> $output:ty)?; $($rest:tt)*) => {
        #[derive(serde::Serialize, serde::Deserialize)]
        $vis struct $name {
            $($fields)+
        }

        impl $crate::rpc::RemoteProcedure for $name {
            #[allow(unused_parens)]
            type Response = ($($output)?);

            const ID: $crate::rpc::ProcedureId = $crate::rpc::ProcedureId::derive(stringify!($name));
        }

        service!(@procedure[$vis] $($rest)*);
    };



    ($vis:vis service $name:ident {
        $($procedures:tt)*
    }) => {
        $vis struct $name;

        impl $crate::rpc::ServiceSpecification for $name {
            type Procedures = service!(@collect $($procedures)*);

            const ID: $crate::rpc::ServiceId = $crate::rpc::ServiceId::derive(stringify!($name));
        }

        service!(@procedure[$vis] $($procedures)*);
    };
}

pub(crate) use service;
