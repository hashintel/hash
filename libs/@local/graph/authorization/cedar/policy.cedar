// permit (
//   principal == ?principal,
//   action    == Action::"view",
//   resource  == Photo::"VacationPhoto94.jpg"
// );

permit (
  principal in HASH::OrganizationRole::"HASH::member",
  action    == HASH::Action::"View",
  resource  is HASH::Entity in HASH::Organization::"HASH"
) unless {
    resource.type == "billing"
};

permit (
  principal in HASH::TeamRole::"HASH::finance::member",
  action    == HASH::Action::"View",
  resource  is HASH::Entity in HASH::Organization::"HASH"
) when {
    resource.type == "billing"
};

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
