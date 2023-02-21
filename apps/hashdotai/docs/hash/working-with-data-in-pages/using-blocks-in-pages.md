---
title: Using Blocks in Pages
slug: hash/working-with-data-in-pages/using-blocks-in-pages
objectId: ???
description: Using Blocks in Pages
---

# Using Blocks in Pages {#using-blocks-in-pages}

In order to view, create, or manipulate data or information in HASH, you’ll need to use blocks.

## How Blocks work with Entities, Links, and Entity Types {#how-blocks-work-with-entities-links-and-entity-types}

Blocks can be render, create, update and delete entities, properties and links, as well as (less commonly) types.

You might use a Block which renders some Entities and Links which already exist in your HASH Workspace. Or you might use a Block to create new Entities of an Entity Type which doesn’t exist yet. Since Blocks are developed by third-parties, there is a huge range of possible data workflows which they enable.

## The default Block: Paragraph Block {#the-default-block-paragraph-block}

When you create a new Page in HASH, a Paragraph Block will automatically be inserted at the top of the page and your cursor will be placed inside the block, ready to type. HASH does this so that Pages can be used to quickly capture some writing.

The paragraph block creates a `Text` entity in your workspace. The `Text` entity conforms to the `Text` entity type, which is a non-editable _system type_. As you write in the paragraph block, the ‘Tokens’ property on the `Text` entity is updated to capture your text.

Hitting the return key `⮐` in the paragraph block will create a new paragraph block below the original. Each paragraph on a page exists an individual block. You can tell this from the [...] context menu on the left of the block, from the comment button on the right of the block, and from the —[+]— button which appears above and below the paragraph when you hover.

![alt_text](insert_block_button.png "The insert block button")

## The Block context menu {#the-block-context-menu}

The [...] button on the left of the block is its context menu, providing a set of options:

1.  **Load block from URL**: allows _block developers_ to load in blocks from a URL to test them out during development. This option will be hidden in 'production' deployments of HASH (including that found on `hash.ai`) and will only be present when running HASH locally in development mode.
1.  **Copy Link**: copies a link to this specific block to your clipboard. Opening this link will open the page and show a visual highlight next to the block which was linked to.
1.  **Edit Block**: opens the "editor" for the entity attached to this block in a side-bar overlay on the right of the screen. Edits you make to the entity will be reflected in the block immediately.
1.  **Configure**: opens the block’s configuration menu, if available. Not all blocks have configuration options. Those that do allow for things like the customization of the block’s UI or the toggling of different features.
1.  **Delete**: removes a block from the current version of a page.

## Inserting a Block {#inserting-a-block}

The easiest way to insert a new block is to press the `/` key on your keyboard. This will open a menu of all the different types of blocks available in HASH. You can scroll through this list or continue typing to search. Hitting return will insert the currently selected block in that menu, but you can also click on the block you want. The `/` command works in almost any text-based block.

The [+] button, which appears above and below a Block on hover, also lets you insert new blocks. Depending on whether it’s above or below the current block when you click it will insert a new block in the corresponding position.

## Lifecycle of a Block {#lifecycle-of-a-block}

Since each block is different, and published by a different developer, they each have unique user experiences. However, they will typically follow one of two life cycles:

1.  **Operating on existing data lifecycle**
    1.  The block will query your Workspace and ask you to select which Entity Types, Entities, or Links you want to use with it.
    1.  After you have selected which data to use, the block will render that data and give you further manipulation and rendering options, depending on what the block is for.

1.  **Creating new data lifecycle**
    1.  The block will query your Workspace for the relevant Entity Type(s) it needs to create new data, creating them if it doesn’t find them.
    1.  The block will then go into an editing mode (e.g. writing, drawing, creating a diagram), creating and updating new Entities and Links as necessary to save the data which you create.

Some blocks combine these approaches.

## Reordering Blocks {#reordering-blocks}

Clicking and dragging on the [...] block context menu lets you reorder the blocks on your page. As you drag, you’ll notice a line will appear which indicates where the drop will move to in the order of blocks on the page if you drop it.

## Commenting on a Block {#commenting-on-a-block}

You can comment on a block by clicking the speech bubble icon, which appears as you hover on the right. Comments are attached to the whole block. You cannot comment on segments of text.

## Mentioning other users {#mentioning-other-users}

In addition to the `/` command, you can type `@` inside the Paragraph, Heading, and Callout blocks, as well as while writing a Comment, to _mention_ other users. A menu will open showing all users on HASH, not just those within your Workspace. Selecting one of these users will insert their name after an `@` symbol in the text you were writing. This name will be clickable, taking you to their profile, and the user will be notified that they’ve been mentioned.
