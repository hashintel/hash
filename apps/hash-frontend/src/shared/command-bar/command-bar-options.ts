import type { ReactNode } from "react";

export type CommandBarOptionCommand = {
  href?: string;
  // Used to render a custom screen inside the popup when the option is selected
  renderCustomScreen?: (option: CommandBarOption) => ReactNode;
  // Used to render a submenu when the option is selected
  options?: CommandBarMenu;
  // Used to trigger a command when the option is selected
  command?: (option: CommandBarOption) => void;

  asyncCommand?: (input: string) => Promise<CommandBarOption | null>;
};

export class CommandBarOption {
  private command: CommandBarOptionCommand | null = null;
  private active = false;

  constructor(
    public readonly menu: CommandBarMenu | null,
    public readonly label: string,
    public readonly group: string,
    public readonly keysList?: string[],
  ) {}

  setCommand(command: CommandBarOptionCommand) {
    this.command = command;
    this.menu?.update();

    return this;
  }

  activate(command?: CommandBarOptionCommand) {
    if (command) {
      this.command = command;
    }

    this.active = true;
    this.menu?.update();

    let removed = false;

    return () => {
      if (!removed) {
        this.active = false;
        if (command) {
          this.command = null;
        }

        this.menu?.update();
      }

      removed = true;
    };
  }

  isActive() {
    return !!this.command && this.active;
  }

  getCommand() {
    return this.command;
  }
}

class CommandBarMenu {
  public subOptions: CommandBarOption[] = [];
  public options: CommandBarOption[] = [];

  protected listeners: (() => void)[] = [];

  private readonly root: CommandBarMenu;

  constructor(root?: CommandBarMenu) {
    this.root = root ?? this;
  }

  addOption(label: string, group: string, keysList?: string[]) {
    const option = new CommandBarOption(this, label, group, keysList);

    this.subOptions.push(option);
    this.root.options.push(option);

    return option;
  }

  addUpdateListener(listener: () => void) {
    this.root.listeners.push(listener);

    return () => {
      this.root.listeners.splice(this.root.listeners.indexOf(listener), 1);
    };
  }

  update() {
    this.root.triggerListeners();
  }

  protected triggerListeners() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const menu = new CommandBarMenu();

export const createEntityOption = menu.addOption("Create Entity", "General", [
  "Meta",
  "e",
]);

export const createTypeOption = menu.addOption("Create Type", "General", [
  "Meta",
  "t",
]);

export const createPageOption = menu.addOption("Create Page", "General", [
  "Meta",
  "p",
]);

/** @todo: introduce other menu options when relevant commands can be implemented */
// export const childMenu = new CommandBarMenu(menu);

// export const secondOption = menu
//   .addOption("Second", "Page", ["Meta", "s"])
//   .setCommand({
//     options: childMenu,
//   });
