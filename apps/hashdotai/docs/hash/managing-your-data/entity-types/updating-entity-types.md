---
title: Updating Entity Types
slug: hash/managing-your-data/entity-types/updating-entity-types
objectId: ???
description: Updating Entity Types
---

# Updating an Entity Type {#updating-an-entity-type}

Entity Types in HASH are versioned, enabling your schemas to evolve with your knowledge. Updating an Entity Type creates a new version of that type, making it easy for you to inspect and update that type’s Entities to its new version.

1.  First, navigate to the Entity Type you wish to update. You can use the search feature under “TYPES” in the left-sidebar or scroll through the list to select it.

1.  You can make changes to the Entity Type’s Property Types and Link Types, but you cannot change its name or description.

1.  Click to ‘Add a property type’ or change whether an existing Property Type allows multiple values or is required, or click to ‘Add a link type’ or change an existing Link Type’s allowed number of links.

1.  Once you have made a change, a blue banner at the top of the screen will indicate that this Entity Type is now being edited. You’ll see the current version number of the Entity Type and the new version number and will see buttons for discarding the edits or publishing them.

1.  Click ‘Publish update’ to save your edits. Importantly, any Entities which conform to this Entity Type will not have been updated to the new version of the schema.

1.  Click the ‘Entities’ tab to view this Entity Type’s Entities. For each Entity, you’ll see its current Entity Type version in the Entity Type Version column. You’ll notice that they are all still on the previous version of the Entity Type.

1.  Click into one of those Entities and you’ll see a “Types” heading indicating that there’s a newer version of the Entity Type available. You can click the name of the Entity Type to go to its page and inspect the new version.

1.  Click the update button to update this Entity to the new Entity Type version. A modal will pop up to make sure you understand the potential consequences of this update:
    1.  If Property Types or Link Types have been removed in the new version of the Entity Type, they will be removed from this Entity, along with any Data values.
    1.  If any Property Types’ Data Types have been changed, any existing Data values which don’t conform to the new Data Type will be removed or unset.
    1.  If existing Property Types have been changed from not required to required and the Entity doesn’t have a Data value set for those Property Types, you will still be able to upgrade the Entity Type. Data values will not be set automatically and no problems occur, but you should manually add values to make sure the Entity is compliant with its Entity Type.
    1.  If the expected Entity Types or allowed number of links on any of the Link Types has been changed in the new version of the Entity Type and the Entity’s existing links don’t follow the new schema, they will be unaffected but should be updated.
    1.  If new Property Types or Links Types have been added to the new version of the Entity Type, the Entity will have those new Property and Link Types, but no Data values or Links will be created.

1.  Click ‘Update entity type’ to upgrade your Entity. You’ll notice the updated Property, Link, and Data Types are now reflected on your Entity and you can make any necessary changes so that this Entity follows its new schema.
