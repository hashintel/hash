// permit (
//   principal == ?principal,
//   action    == Action::"view",
//   resource  == Photo::"VacationPhoto94.jpg"
// );

permit (
  principal == HASH::User::"tim",
  action    == HASH::Action::"View",
  resource  == HASH::Entity::"photo"
);

permit (
  principal in HASH::OrganizationRole::"HASH::member",
  action    == HASH::Action::"View",
  resource  is HASH::Entity in HASH::Organization::"HASH"
);

permit (
  principal in HASH::OrganizationRole::"HASH::member",
  action    == HASH::Action::"View",
  resource  is HASH::Entity in HASH::Organization::"HASH"
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
