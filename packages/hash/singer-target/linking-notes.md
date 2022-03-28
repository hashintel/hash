# Questions

Why are destinations versioned and not sources?
Entity versions being sequence (ordered for use in link ranges)

- Not an issue for sharding since sharding wouldn't be over versions, right?

# Asana Land

- AA

```js
{
  title: "AA";
}
```

- AB

```js
// current
entities += { title: "AB" }
links += { path: "$.blockedBy", source: { entityId }, to: { entityVersionId } }

// hypothetical
{
  title: "AA",
  version: 20,
}
{
  title: "AA",
  version: 21,
}
{
  title: "AB",
  version: 3,
}
{
  title: "AB",
  version: 4,
}

// links
{ title: "blockedBy-link",
  source: "AB",
  applicableForSourceStartingAt: 1278367861235671235786,
  endingAt: 12783678612356791209381,
  entityTypeId: "uuid-uuid--AsanaTask",
  keys: { id: "asana_812738971" } }

{ title: "AB",
  blockedBy: [],
  version: 5 }

{ title: "UC",
  blockedBy: [{ entityTypeId: "uuid-uuid", id: "asana_AB", version: 4 }]
  version: 0 }
find(a => a.entityTypeId = x && a.properties.id = id)
```

- --blocked by--> AA (outgoing)

## Integration results in import AA, AB

- AB
  - --blocked by--> AA (outgoing)
- AA
  - inverseOf: AB--blocked by--> (incoming)

## Asana Changes

AB not blocked by anything

- AB
  - --blocked by--> ()

## Integration results in update AB

! AB

- --blocked by--> AA
  ? AB
- --blocked by--> ()

- AB
  - --blocked by--> ()

? inverseOf

# Integrations Land

## Case 1 - Link was against unversioned Entities

Get new AB Data
Update AB entity

Now we have to say "Get all Outgoing Links"
Search through Outgoing links to find ones **missing** in the new AB Data and
Invalidate them

## Case 2 - Link was against Entities Versions

Get new AB Data
Update AB entity

but then what happens if AA updates? We have to
Get new AA data
Update AA entity
Find all Incoming Links against last version of AA
Somehow validate they still point to this newest one?
