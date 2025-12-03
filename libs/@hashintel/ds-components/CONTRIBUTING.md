# Contributing to @hashintel/ds-components

**⚙️ This guide is optimized for LLM coding assistants (GitHub Copilot, Claude, etc.)**

This document provides technical instructions for adding or updating components in the HASH Design System. All guidance is structured for automated code generation and modification by AI assistants.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Component Development Workflow](#component-development-workflow)
- [Adding a New Component](#adding-a-new-component)
- [Updating an Existing Component](#updating-an-existing-component)
- [Design Token System](#design-token-system)
- [Component Structure](#component-structure)
- [Testing and Quality](#testing-and-quality)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

1. **Figma Desktop App** - Must be running with the design file open
2. **Figma MCP Server** - Set up in the Figma app
3. **ArkUI MCP Server** - Configured in your User MCP config (do not commit to repo)
4. **Node.js** - For running the development environment
5. **Yarn** - Package manager used in this monorepo

### Required Knowledge

- **React & TypeScript** - Component framework
- **Ark UI** - Base component library for accessibility and behavior
- **PandaCSS** - CSS-in-JS styling system with design tokens
  - Reference the LLM documentation: https://panda-css.com/llms.txt
  - Use PandaCSS Recipes (cva) for component variants: https://panda-css.com/docs/concepts/recipes
- **Storybook** - Component documentation and testing

### Design System Context

- **Design Tokens**: Defined in `@hashintel/ds-theme/src/index.ts`
- **Figma Mapping**: Available in `@hashintel/ds-theme/src/figma-to-panda-mapping.json`
- **Component Base**: Built on top of Ark UI components from `@ark-ui/react`

## Component Development Workflow

### High-Level Process

```markdown
1. Select component in Figma
   ↓
2. Retrieve design context via Figma MCP
   ↓
3. Get Ark UI examples via ArkUI MCP
   ↓
4. Map Figma variables to PandaCSS tokens
   ↓
5. Implement component following patterns
   ↓
6. Create Storybook stories
   ↓
7. Add Figma Code Connect mapping
   ↓
8. Test and validate
```

## Adding a New Component

### Step 1: Gather Design Context

Open the Figma design file and select the component you want to implement.

**Using Figma MCP:**

```typescript
// Get the design context for the selected component
mcp_figma_get_design_context({
  clientFrameworks: "react",
  clientLanguages: "typescript",
});

// Get a screenshot for visual reference
mcp_figma_get_screenshot({
  clientFrameworks: "react",
  clientLanguages: "typescript",
});

// Get variable definitions (design tokens)
mcp_figma_get_variable_defs({
  clientFrameworks: "react",
  clientLanguages: "typescript",
});
```

**What to extract from Figma:**

- Component variants (e.g., default, card, sizes)
- Spacing values (padding, gap, margin)
- Border radius values
- Color usage (which Figma variables are used)
- Typography (font size, weight, line height)
- States (hover, active, disabled, focus)
- Component structure and hierarchy

### Step 2: Get Ark UI Pattern

**Using ArkUI MCP:**

```typescript
// List available examples for the component
mcp_ark -
  ui_list_examples({
    component: "radio-group", // Change to your component
    framework: "react",
  });

// Get the basic example
mcp_ark -
  ui_get_example({
    component: "radio-group",
    exampleId: "basic",
    framework: "react",
  });

// Get component props documentation
mcp_ark -
  ui_get_component_props({
    component: "radio-group",
    framework: "react",
  });
```

**Key elements to identify:**

- Base component import path (e.g., `@ark-ui/react/radio-group`)
- Component structure (Root, Item, Control, Label, etc.)
- Required props and types
- Event handlers
- Accessibility features

### Step 3: Map Design Tokens

Review the design token mapping to translate Figma variables to PandaCSS tokens:

**Read the mapping file:**

```bash
# Location of token definitions
libs/@hashintel/ds-theme/src/index.ts

# Location of Figma to Panda mapping
libs/@hashintel/ds-theme/src/figma-to-panda-mapping.json
```

**Common token mappings:**

| Figma Variable                | PandaCSS Token              | Value Example |
| ----------------------------- | --------------------------- | ------------- |
| `--spacing/default/4`         | `spacing.4`                 | 6px           |
| `--spacing/default/5`         | `spacing.5`                 | 8px           |
| `--spacing/default/6`         | `spacing.6`                 | 12px          |
| `--border-radius/rounded-lg`  | `radius.4`                  | 8px           |
| `--border/neutral/default`    | `border.neutral.default`    | #e5e5e5       |
| `--bg/neutral/subtle/default` | `bg.neutral.subtle.default` | white         |
| `--text/primary`              | `text.primary`              | #171717       |
| `size.textsm`                 | `size.textsm`               | 14px          |
| `size.textxs`                 | `size.textxs`               | 12px          |

**Token categories:**

- **Spacing**: `spacing.0` through `spacing.12`
- **Radius**: `radius.2` (4px), `radius.3` (6px), `radius.4` (8px), `radius.full` (100px)
- **Colors**: `border.*`, `bg.*`, `text.*`, `core.*`
- **Typography**: `size.*` (font sizes), `leading.*` (line heights)

**For custom values not in token system:**
Use bracket notation: `[10px]`, `[316px]`, `[#ffffff]`

**Styling with PandaCSS:**

- Use `css()` for one-off styles or base component styling
- Use `cva()` (PandaCSS Recipes) for components with variants
  - Reference: https://panda-css.com/docs/concepts/recipes

### Step 4: Create Component Files

Create a new directory under `src/components/` with the component name in PascalCase:

```bash
libs/@hashintel/ds-components/src/components/ComponentName/
├── component-name.tsx          # Main component implementation
├── component-name.stories.tsx  # Storybook stories
└── component-name.figma.tsx    # Figma Code Connect mapping
```

**Note:** Do NOT create `index.ts` files - this codebase uses direct exports.

### Step 5: Implement Component

**Template structure:**

**For components with variants, use PandaCSS Recipes (cva):**

```tsx
import { ComponentName as BaseComponentName } from "@ark-ui/react/component-name";
import { cva } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

export interface ComponentNameProps {
  // Controlled state
  value?: string;
  defaultValue?: string;

  // Common props
  disabled?: boolean;
  name?: string;
  form?: string;
  id?: string;

  // Event handlers
  onChange?: (value: string) => void;

  // Variant props
  variant?: "default" | "alternative";
  size?: "sm" | "md" | "lg";
}

// Define recipes for styling variants
const componentRootRecipe = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "spacing.4",
  },
  variants: {
    variant: {
      default: {
        backgroundColor: "bg.neutral.subtle.default",
        borderColor: "border.neutral.default",
      },
      alternative: {
        backgroundColor: "bg.neutral.bold.default",
        borderColor: "border.neutral.bold",
      },
    },
    size: {
      sm: {
        padding: "spacing.2",
        fontSize: "size.textxs",
      },
      md: {
        padding: "spacing.4",
        fontSize: "size.textsm",
      },
      lg: {
        padding: "spacing.6",
        fontSize: "size.textmd",
      },
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
});

export const ComponentName: React.FC<ComponentNameProps> = ({
  value,
  defaultValue,
  disabled = false,
  name,
  form,
  id,
  onChange,
  variant = "default",
  size = "md",
}) => {
  return (
    <BaseComponentName.Root
      {...(value !== undefined ? { value } : { defaultValue })}
      disabled={disabled}
      name={name}
      form={form}
      id={id}
      onValueChange={(details) => {
        if (details.value) {
          onChange?.(details.value);
        }
      }}
      className={componentRootRecipe({ variant, size })}
    >
      {/* Component children */}
    </BaseComponentName.Root>
  );
};
```

**For simple components without variants, use css():**

```tsx
import { ComponentName as BaseComponentName } from "@ark-ui/react/component-name";
import { css } from "@hashintel/ds-helpers/css";

export const ComponentName: React.FC<ComponentNameProps> = (props) => {
  return (
    <BaseComponentName.Root
      className={css({
        display: "flex",
        padding: "spacing.4",
        borderRadius: "radius.4",
      })}
    >
      {/* Component children */}
    </BaseComponentName.Root>
  );
};
```

**Key patterns:**

1. **Controlled vs Uncontrolled:**

   ```tsx
   {...(value !== undefined ? { value } : { defaultValue })}
   ```

2. **Styling with data attributes:**

   ```tsx
   "&[data-state='checked']": {
     backgroundColor: "bg.neutral.bold.default",
   },
   "&[data-disabled]": {
     opacity: "[0.5]",
     cursor: "not-allowed",
   },
   "&:hover:not([data-disabled])": {
     backgroundColor: "bg.neutral.subtle.hover",
   },
   ```

3. **Using design tokens:**

   ```tsx
   className={css({
     padding: "spacing.4",          // Use tokens
     borderRadius: "radius.4",      // Use tokens
     width: "[316px]",              // Use brackets for custom values
     border: "1px solid",           // Standard CSS
     borderColor: "border.neutral.default", // Use tokens
   })}
   ```

4. **Conditional styling:**

   ```tsx
   className={css(
     variant === "default" ? {
       // Default styles
     } : {
       // Alternative variant styles
     }
   )}
   ```

### Step 6: Register Component in Vite Config

**CRITICAL:** Add an entry point for the new component in `vite.config.ts` to make it exportable from the package.

**Location:** `libs/@hashintel/ds-components/vite.config.ts`

Add a new entry in the `build.lib.entry` object in alphabetical order:

```typescript
build: {
  lib: {
    entry: {
      // ... existing entries ...
      "component-name": path.resolve(
        __dirname,
        "src/components/ComponentName/component-name.tsx",
      ),
      // ... more entries ...
    },
  },
},
```

**Example:**

```typescript
// If adding a "radio-group" component
entry: {
  button: path.resolve(__dirname, "src/components/Button/button.tsx"),
  "radio-group": path.resolve(
    __dirname,
    "src/components/RadioGroup/radio-group.tsx",
  ),
  // ... rest of entries
}
```

**Key points:**

- Entry key should be in kebab-case: `"radio-group"`, `"component-name"`
- Path should point to the main component file (`.tsx`)
- Maintain alphabetical order for consistency
- Use `path.resolve(__dirname, "src/components/...")` pattern

Without this entry, the component will not be accessible when importing from `@hashintel/ds-components`.

### Step 7: Create Storybook Stories

Create comprehensive examples in `component-name.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ComponentName, type ComponentNameProps } from "./component-name";

const meta: Meta<ComponentNameProps> = {
  title: "Components/ComponentName",
  component: ComponentName,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
# ComponentName

Brief description of the component.

## Variants
- **Variant 1**: Description
- **Variant 2**: Description

## States
- Selected
- Disabled
- Hover
        `,
      },
    },
  },
  argTypes: {
    variant: {
      control: "radio",
      options: ["default", "alternative"],
    },
    disabled: {
      control: "boolean",
    },
  },
};

export default meta;
type Story = StoryObj<ComponentNameProps>;

export const Default: Story = {
  args: {
    // Default props
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const Controlled: Story = {
  render: (args) => {
    const [value, setValue] = useState("");

    return (
      <ComponentName
        {...args}
        value={value}
        onChange={(newValue) => setValue(newValue)}
      />
    );
  },
};
```

**Required stories:**

- `Default` - Basic usage
- `Disabled` - Disabled state
- `Controlled` - Controlled state example
- One story per variant

### Step 8: Add Figma Code Connect

Create `component-name.figma.tsx` to link the component to Figma:

```tsx
import figma from "@figma/code-connect";

import { ComponentName } from "./component-name";

figma.connect(
  ComponentName,
  "https://www.figma.com/design/WmnosvOvi4Blw0HK0jh1mG/Design-System?node-id=XXXX-XXXX",
  {
    props: {
      variant: figma.enum("variant", {
        default: "default",
        alternative: "alternative",
      }),
      disabled: figma.enum("_state", {
        disabled: true,
      }),
    },
    example: (props) => (
      <ComponentName variant={props.variant} disabled={props.disabled} />
    ),
  }
);
```

**To get the node-id:**

```typescript
// Get metadata to find the node ID
mcp_figma_get_metadata({
  clientFrameworks: "react",
  clientLanguages: "typescript",
});
```

The node-id will be in the format `18731-77299`. Convert `:` to `-` for the URL.

## Updating an Existing Component

### Step 1: Review Current Implementation

1. **Read existing component files:**

   ```bash
   libs/@hashintel/ds-components/src/components/ComponentName/
   ```

2. **Check current design tokens used:**

   - Look for `spacing.*`, `radius.*`, `border.*`, `bg.*`, `text.*` references
   - Note any bracket notation values `[10px]`

3. **Identify what needs updating:**
   - New variants?
   - Different spacing/sizing?
   - Color changes?
   - New states?

### Step 2: Get Updated Design Context

Select the component in Figma and retrieve the latest design:

```typescript
mcp_figma_get_design_context({
  clientFrameworks: "react",
  clientLanguages: "typescript",
});
```

### Step 3: Compare and Update

1. **Map new design tokens:**

   - Check if new Figma variables need to be mapped
   - Verify existing tokens are still correct
   - Update to newer token versions if available

2. **Update component implementation:**

   - Use `replace_string_in_file` for precise edits
   - Include 3-5 lines of context before/after changes
   - Preserve existing functionality

3. **Update stories:**

   - Add stories for new variants
   - Update existing stories if props changed

4. **Update Figma Code Connect:**
   - Add mappings for new variants
   - Update node-ids if Figma structure changed

### Step 4: Validate Changes

1. **Check for TypeScript errors:**

   ```typescript
   get_errors({ filePaths: ["path/to/component.tsx"] });
   ```

2. **Run Storybook:**

   ```bash
   yarn storybook
   ```

3. **Test all variants and states**

## Design Token System

### Token Hierarchy

```bash
@hashintel/ds-theme
├── colors
│   ├── core.*        # Raw color values
│   ├── border.*      # Border colors
│   ├── bg.*          # Background colors
│   └── text.*        # Text colors
├── spacing           # Spacing scale
├── radii             # Border radius values
├── fontSizes         # Font size scale
└── lineHeights       # Line height scale
```

### How to Use Tokens

**✅ DO:**

```tsx
// Use semantic tokens
padding: "spacing.4";
backgroundColor: "bg.neutral.subtle.default";
borderColor: "border.neutral.default";

// Use bracket notation for custom values
width: "[316px]";
gap: "[10px]";
color: "[#ffffff]";
```

**❌ DON'T:**

```tsx
// Don't use raw values without brackets
padding: "6px"; // ❌ Type error

// Don't use undefined tokens
backgroundColor: "bg.neutral.default"; // ❌ Doesn't exist
```

### Finding the Right Token

1. **Check Figma variable name** from design context
2. **Look up in mapping file:** `figma-to-panda-mapping.json`
3. **Verify token exists** in `@hashintel/ds-theme/src/index.ts`
4. **Use grep to search** for similar usages in existing components

```bash
# Search for token usage examples
grep -r "spacing.4" src/components/

# Search for color token patterns
grep -r "bg.neutral" src/components/
```

## Component Structure

### File Organization

```bash
src/components/ComponentName/
├── component-name.tsx          # 150-300 lines typically
│   ├── Imports
│   ├── Type definitions
│   ├── Component implementation
│   └── Export
├── component-name.stories.tsx  # 100-200 lines
│   ├── Meta configuration
│   ├── Story definitions
│   └── Interactive examples
└── component-name.figma.tsx    # 30-60 lines
    └── Figma Code Connect mappings
```

### Component Anatomy

```tsx
// 1. Imports
import { BaseComponent } from "@ark-ui/react/component";
import { css } from "@hashintel/ds-helpers/css";

// 2. Type Definitions
export interface ComponentProps {
  // Props interface
}

// 3. Constants (if needed)
const ICON_SVG = <svg>...</svg>;

// 4. Component
export const Component: React.FC<ComponentProps> = (props) => {
  // Implementation
};
```

### Naming Conventions

- **Files**: `kebab-case.tsx`
- **Components**: `PascalCase`
- **Props**: `PascalCase` + `Props` suffix
- **Directories**: `PascalCase`

## Testing and Quality

### Automated Validation Checklist

- [ ] Component entry added to `vite.config.ts` (for new components)
- [ ] No TypeScript errors (`get_errors`)
- [ ] Component has all required stories
- [ ] All variants are tested in Storybook
- [ ] Figma Code Connect is configured
- [ ] Design tokens are used correctly
- [ ] Controlled and uncontrolled modes work
- [ ] Disabled state works correctly
- [ ] Accessibility is preserved (from Ark UI)

### Running Tests

```bash
# Type check
yarn lint:tsc

# ESLint
yarn lint:eslint

# Fix linting issues
yarn fix:eslint

# Run Storybook
yarn storybook

# Build the package
yarn build
```

### Common Linting Errors

**1. `index.js files are not allowed`**

- Don't create `index.ts` files in component directories
- Components are exported directly via `package.json` exports

**2. Type errors with PandaCSS tokens**

- Use bracket notation for custom values: `[10px]`
- Verify token exists in theme
- Check spelling (e.g., `bg.neutral.subtle.default` not `bg.neutral.default`)

## Common Patterns

### Pattern 1: Controlled vs Uncontrolled

```tsx
// Props
interface ComponentProps {
  value?: string; // Controlled
  defaultValue?: string; // Uncontrolled
  onChange?: (value: string) => void;
}

// Usage in component
<BaseComponent.Root
  {...(value !== undefined ? { value } : { defaultValue })}
  onValueChange={(details) => {
    if (details.value) {
      onChange?.(details.value);
    }
  }}
/>;
```

### Pattern 2: Variant Styling

```tsx
className={css(
  variant === "default"
    ? {
        // Default variant styles
        padding: "spacing.3",
        backgroundColor: "bg.neutral.subtle.default",
      }
    : {
        // Alternative variant styles
        padding: "spacing.6",
        backgroundColor: "bg.neutral.bold.default",
      }
)}
```

### Pattern 3: Data Attribute States

```tsx
className={css({
  // Base styles
  color: "text.primary",

  // State: checked/selected
  "&[data-state='checked']": {
    backgroundColor: "bg.neutral.bold.default",
  },

  // State: disabled
  "&[data-disabled]": {
    opacity: "[0.5]",
    cursor: "not-allowed",
  },

  // State: hover (excluding disabled)
  "&:hover:not([data-disabled])": {
    backgroundColor: "bg.neutral.subtle.hover",
  },

  // State: focus visible
  "&[data-focus-visible]": {
    outline: "2px solid",
    outlineColor: "border.neutral.default",
  },
})}
```

### Pattern 4: Hidden Input for Forms

```tsx
// Always include HiddenInput for form compatibility
<BaseComponent.Item>
  <BaseComponent.ItemControl />
  <BaseComponent.ItemText>{label}</BaseComponent.ItemText>
  <BaseComponent.ItemHiddenInput />
</BaseComponent.Item>
```

### Pattern 5: Optional Icon/Description

```tsx
{
  variant === "card" && option.icon && (
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "[32px]",
        height: "[32px]",
      })}
    >
      {option.icon}
    </div>
  );
}
```

## Troubleshooting

### Issue: TypeScript errors with PandaCSS tokens

**Problem:** `Type '"value"' is not assignable to type 'Token | undefined'`

**Solution:**

1. Use bracket notation for custom values: `[10px]`
2. Verify the token exists in `@hashintel/ds-theme/src/index.ts`
3. Check for typos (e.g., `bg.neutral.default` doesn't exist, use `bg.neutral.subtle.default`)

### Issue: Component not appearing in Storybook

**Problem:** Component doesn't show up in Storybook sidebar

**Solution:**

1. Check `title` in story meta matches pattern: `"Components/ComponentName"`
2. Ensure story file ends with `.stories.tsx`
3. Restart Storybook: `yarn storybook`

### Issue: Figma MCP not returning data

**Problem:** `mcp_figma_get_design_context` returns empty or error

**Solution:**

1. Ensure Figma Desktop app is running
2. Select the component/frame in Figma
3. Verify Figma MCP server is set up in Figma app
4. Try `mcp_figma_get_metadata` first to check connection

### Issue: Design token mapping not clear

**Problem:** Don't know which PandaCSS token to use for a Figma variable

**Solution:**

1. Check `figma-to-panda-mapping.json` for the mapping
2. Search for similar usage in existing components
3. Use `grep_search` to find token patterns:

   ```typescript
   grep_search({
     query: "spacing.4|spacing.5|spacing.6",
     isRegexp: true,
     includePattern: "src/components/**/*.tsx",
   });
   ```

### Issue: Ark UI component structure unclear

**Problem:** Don't know which Ark UI subcomponents to use

**Solution:**

1. Use `mcp_ark-ui_list_examples` to see available examples
2. Get the basic example with `mcp_ark-ui_get_example`
3. Check existing similar components (e.g., Checkbox for RadioGroup)
4. Review Ark UI documentation: https://ark-ui.com

### Issue: Controlled state not working

**Problem:** Component doesn't update when value prop changes

**Solution:**

1. Ensure you're using the ternary for controlled vs uncontrolled:

   ```tsx
   {...(value !== undefined ? { value } : { defaultValue })}
   ```

2. Check that `onValueChange` is calling the user's `onChange`:

   ```tsx
   onValueChange={(details) => {
     if (details.value) {
       onChange?.(details.value);
     }
   }}
   ```

3. Verify the story properly manages state with `useState`

## Additional Resources

### Internal Documentation

- [Design System README](./README.md)
- [Theme Package](../ds-theme/README.md)
- [Root `CLAUDE.md`](../../CLAUDE.md)

### External Documentation

- [Ark UI Documentation](https://ark-ui.com)
- [Ark UI MCP Server](https://ark-ui.com/docs/ai/mcp-server)
- [Figma MCP Server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [PandaCSS Documentation](https://panda-css.com)
- [Storybook Documentation](https://storybook.js.org)

### Example Components

Reference these well-implemented components:

- **Checkbox**: Complete example with all patterns
- **RadioGroup**: Multiple variants, card layout
- **Badge**: Simple component with size/color variants
- **Button**: Complex interactions and states

## LLM Assistant Guidelines

When working with this codebase as an LLM assistant:

1. **Context gathering is critical**: Read this guide completely before starting any implementation
2. **Use MCP tools first**: Always gather design context from Figma and Ark UI examples before writing code
3. **Follow existing patterns**: Check existing components for established patterns before creating new approaches
4. **Validate token availability**: Always verify that design tokens exist in the theme before using them
5. **Test incrementally**: Use `get_errors` after each significant change to catch issues early
6. **Ask for clarification**: If design requirements or token mappings are unclear, request clarification from the user
