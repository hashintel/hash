pub mod account;

macro_rules! service {
    ($vis:vis service $name:ident {
        $(rpc $method:ident($($input:ty)?) $(-> $output:ty)?;)*
    }) => {
        $vis struct $name;

        impl $crate::rpc::ServiceSpecification for $name {
            type Procedures = ($($method,)*);

            const ID: $crate::rpc::ServiceId = $crate::rpc::ServiceId::derive(stringify!($name));
        }

        $(
            $vis struct $method;

            impl $crate::rpc::ProcedureSpecification for $method {
                #[allow(unused_parens)]
                type Request = ($($input)?);
                #[allow(unused_parens)]
                type Response = ($($output)?);

                const ID: $crate::rpc::MethodId = $crate::rpc::MethodId::derive(stringify!($method));
            }
        )*
    };
}

pub(crate) use service;
