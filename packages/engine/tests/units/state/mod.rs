mod edit;
mod empty;

mod js {
    crate::run_test!(behavior_index, JavaScript);
    crate::run_test!(nullable_fixed_size_list, JavaScript);
}

mod py {
    crate::run_test!(behavior_index, Python, #[ignore]);
    crate::run_test!(nullable_fixed_size_list, Python, #[ignore]);
}
