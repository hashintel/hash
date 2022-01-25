mod js {
    use crate::run_test;

    run_test!(helper, JavaScript);
    run_test!(no_recipient, JavaScript);
    run_test!(one_recipient, JavaScript);
    run_test!(multiple_recipients, JavaScript);

    run_test!(all_types, JavaScript);
    // TODO: Make mapbox work
    //   see https://app.asana.com/0/1199548034582004/1200329934588478/f
    run_test!(mapbox, JavaScript, #[ignore]);

    run_test!(create_agent, JavaScript);
    run_test!(remove_agent, JavaScript);
    run_test!(remove_self, JavaScript);
    // TODO: Handle stop messages
    //   see https://app.asana.com/0/1199550852792314/1201630005867419/f
    run_test!(stop_simulation, JavaScript, #[ignore]);
}
