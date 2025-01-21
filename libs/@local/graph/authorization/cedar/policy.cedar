// permit (
//   principal == ?principal,
//   action    == Action::"view",
//   resource  == Photo::"VacationPhoto94.jpg"
// );

permit (
  principal in HASH::OrgRole::"HASH::member",
  action    == HASH::Action::"Update",
  resource  is HASH::Entity in HASH::Org::"HASH"
);

// permit (
//   principal in Org::"HASH::member",
//   action    == Action::"view",
//   resource  == Entity::"VacationPhoto94.jpg"
// );


// permit (
//   principal in Org::"HASH::members",
//   action    == Action::"view",
//   resource  == Entity::"VacationPhoto94.jpg"
// );
