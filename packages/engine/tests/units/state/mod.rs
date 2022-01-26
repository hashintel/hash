mod edit;

mod js {
    crate::run_test!(behavior_index, JavaScript);
}

mod py {
    crate::run_test!(behavior_index, Python);
}
