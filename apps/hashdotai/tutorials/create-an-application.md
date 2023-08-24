---
title: Creating a simple application
slug: hash/getting-started/creating-an-application
objectId: ???
description: Creating a simple application in HASH
---

# Create a simple application {#create-a-simple-application}

Let’s explore how HASH works by building a simple application. We’re going to model our business’ projects in HASH and render our project data in a Table Block.

1.  Sign up at [https://alpha.hash.ai/signup](https://alpha.hash.ai/signup).

**Creating the “Project” Entity Type**

1.  Click the + button next to TYPES in the left side-bar to create a new Type.
1.  Name your Type “Project” and give it the description “A set of tasks which deliver a bigger business goal.” Click “Create new entity type”.

**Creating Property Type and Data Types**

1.  Click to “Add a property +” and add Text properties for:
    1.  Title
    1.  Description

**Creating Link Types**

1.  Click to “Add a link +” and add an “Owns” link type. Set the expected Entity Type as “User”.
1.  Click “Create” in the top right corner to save this new Entity Type. \

**Creating the “Sub-Task” Entity Type**

1.  Click + next to Types in the side-bar again to create a 2nd Type
1.  Call this one “Sub-task” and give it a description.
1.  Again, add Text properties for Title and Description.
1.  Click “Create” to save your type.

**Creating the “Blocked by” Link Type**

1.  Now use the menu under TYPES on the left to navigate back to your “Project” Type.
1.  Click “Add a link +” and create a “Blocked by” Link Type, selecting the “Sub-Task” Type we just created as the expected link type.
1.  Click to save your updated Entity Type.

!["Entity Types and Link Types"](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/de5efac3-19c2-47af-6eff-cbe5b4efc400/public)

_We now have a data model looking roughly like this (left). The circles represent Entity Types (the User type already existed). The arrows represent Link Types._

**Creating the “Project” Entity**

1.  Click the “Create new entity” button in the top right of the “Project” Entity Type page.
1.  Fill in the details according to the Property and Data Types you defined.
1.  Click “Create” to save the new entity.

**Creating the “Sub-task” Entities**

1.  Navigate to the “Sub-task” Entity Type and click the “Create new entity” button in the top right.
1.  Fill in the details according to the Property and Data Types you defined.
1.  Click “Create” to save the new entity.
1.  Repeat steps 18-20 two more times so you have three “Sub-task” entities. \

**Link your “Sub-tasks” to your “Project” entity**

1.  Navigate back to your “Project” Entity Type.
1.  Click to open the “Entities” tab.
1.  And click into your single “Project” Entity.
1.  Scroll down and click into the “No entities” field next to the “Sub-tasks” Link Type.
1.  Select the three “Sub-task” Entities you just created to link them to this Project.
1.  Click “Save changes”.

!["Entities and Links, as defined by their Entity and Link Types"](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/de8bd0a8-37d3-40e9-2162-6897fd7dc500/public)

_We now have some Entities and Links (on the right) defined by their Entity and Link Types respectively (on the left)._

**Creating a Page**

1.  Find the “PAGES” section in the left side-panel and click the + button to its right.
1.  You’re now editing a new Pages. Pages have titles, icons, and are made up of blocks. Comments are also supported, for collaboration purposes.
1.  Give your Page a title, e.g. “Project Status”.

**Inserting the Table Block**

1.  Click your cursor into the center of the Page and type “/” to bring up the Block Selector.
1.  The Block Selector lets you insert any block from the Block Protocol. Select the Table Block.
1.  The Table block can display Entities of any Entity Type. Use the {Data Selection or in-block UX} to select our “Project” Entity Type to render into the table.
1.  {tbc re. Data Selection, in particular whether Selection/Mapping will enable rendering of the linked Sub-Tasks}... For each of the “Project” Entity Type’s properties, you should now see a column, along with rows for each of the “Project” Entities we created. \

You have just rendered some arbitrary data into a third-party-developed Table Block. The Table Block had no knowledge of the shape of your data, but the Block Protocol enabled it to communicate with HASH to render your data as desired.
