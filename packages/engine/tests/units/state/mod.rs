mod edit;
mod empty;

mod js {
    crate::run_test!(behavior_index, JavaScript);
    // Regression test for https://app.asana.com/0/1201893074552404/1201893568192898/f
    crate::run_test!(nullable_fixed_size_list, JavaScript, #[ignore]);
}

mod py {
    crate::run_test!(behavior_index, Python, #[ignore]);
    crate::run_test!(nullable_fixed_size_list, Python, #[ignore]);
}
