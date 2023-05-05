// In order to make declaring the options easier, we use a type that doesn't require the path to be specified.
// The path is added later by flattening the options
import { ReactNode, useMemo } from "react";

import { useActionsContext } from "../../pages/[shortname]/[page-slug].page/actions-context";

export type OptionWithoutPath = {
  group: string;
  label: string;
  href?: string;
  // Used to render a custom screen inside the popup when the option is selected
  renderCustomScreen?: (option: OptionWithoutPath) => ReactNode;
  // Used to render a submenu when the option is selected
  options?: OptionWithoutPath[];
  // Used to trigger a command when the option is selected
  command?: (option: OptionWithoutPath) => void;
};

export type Option = OptionWithoutPath & { path: string[] };

// Flattens the options into a single array, with a path property that contains the path to the option
const flattenOptions = (
  options: OptionWithoutPath[],
  parentOption?: Option,
): Option[] => {
  return options.flatMap((option) => {
    const nextOption = {
      ...option,
      path: parentOption ? [...parentOption.path, parentOption.label] : [],
    };

    return [
      nextOption,
      ...flattenOptions(nextOption.options ?? [], nextOption),
    ];
  });
};

export const useCommandBarOptions = () => {
  const { showActionsInterface } = useActionsContext();

  return useMemo<{
    allOptions: OptionWithoutPath[];
    flattenedOptions: Option[];
  }>(() => {
    const allOptions: OptionWithoutPath[] = [
      {
        group: "Blocks",
        label: "Find a block…",
        options: [
          {
            group: "General",
            label: "Option A",
            renderCustomScreen: ({ label }) => <div>You selected {label}</div>,
          },
          {
            group: "General",
            label: "Option B",
            renderCustomScreen: ({ label }) => <div>You selected {label}</div>,
          },
          {
            group: "Other",
            label: "Option C",
            href: "https://google.com/",
          },
          {
            group: "Other",
            label: "Option D",
            href: "/",
          },
        ],
      },
      {
        group: "Page",
        label: "Configure page variables…",
        renderCustomScreen: ({ label }) => <div>You selected {label}</div>,
      },
      {
        group: "Blocks",
        label: "Generate new block with AI…",
        command(option) {
          // eslint-disable-next-line no-alert
          alert(`You picked option ${option.label}`);
        },
      },
      {
        group: "Entities",
        label: "Search for an entity…",
        href: "/",
      },
      {
        group: "Entities",
        label: "Insert a link to an entity…",
        href: "/",
      },
      {
        group: "Entities",
        label: "Create new entity…",
        href: "/",
      },
      {
        group: "Types",
        label: "Create new type…",
        href: "/",
      },
      {
        group: "Apps",
        label: "Find an app…",
        href: "/",
      },
      {
        group: "Apps",
        label: "Create an app…",
        href: "/",
      },
      {
        group: "Apps",
        label: "Generate new app…",
        href: "/",
      },
    ];
    if (showActionsInterface) {
      allOptions.unshift({
        group: "Page",
        label: "Set page actions…",
        command() {
          showActionsInterface();
        },
      });
    }

    const flattenedOptions = flattenOptions(allOptions);

    return {
      allOptions,
      flattenedOptions,
    };
  }, [showActionsInterface]);
};
