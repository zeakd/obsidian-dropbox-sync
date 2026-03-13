/** Augment Obsidian's App with undocumented internal APIs used by this plugin. */
import "obsidian";

declare module "obsidian" {
  interface App {
    setting?: {
      open(): void;
      openTabById(id: string): void;
    };
  }
}
