mod edit;
mod empty;

mod js {
    crate::run_test!(behavior_index, JavaScript);
    crate::run_test!(nullable_fixed_size_list, JavaScript);
    crate::run_test!(immutability, JavaScript);
}

mod py {
    crate::run_test!(behavior_index, Python);
    crate::run_test!(nullable_fixed_size_list, Python);
    crate::run_test!(immutability, Python);
}
