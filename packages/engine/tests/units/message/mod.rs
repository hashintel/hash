use crate::run_test;

run_test!(helper);
run_test!(no_recipient);
run_test!(one_recipient);
run_test!(multiple_recipients);

run_test!(all_types);
// TODO: Make mapbox work
//   see https://app.asana.com/0/1199548034582004/1200329934588478/f
run_test!(mapbox, #[ignore]);

run_test!(create_agent);
run_test!(remove_agent);
run_test!(remove_self);
// TODO: Handle stop messages
//   see https://app.asana.com/0/1199550852792314/1201630005867419/f
run_test!(stop_simulation, #[ignore]);
