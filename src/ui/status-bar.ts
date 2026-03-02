export type SyncStatus = "idle" | "syncing" | "success" | "error";

export class StatusBar {
  private el: HTMLElement;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  constructor(statusBarEl: HTMLElement) {
    this.el = statusBarEl;
  }

  update(status: SyncStatus, detail?: string): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.el.empty();
    this.el.style.color = "";

    switch (status) {
      case "idle":
        this.el.setText("Dropbox: idle");
        break;
      case "syncing":
        this.el.setText("Dropbox: syncing...");
        break;
      case "success":
        this.el.setText(`Dropbox: ${detail ?? "synced"}`);
        this.timerId = setTimeout(() => this.update("idle"), 5000);
        break;
      case "error":
        this.el.setText(`Dropbox: ${detail ?? "error"}`);
        this.el.style.color = "var(--text-error)";
        break;
    }
  }

  destroy(): void {
    if (this.timerId) clearTimeout(this.timerId);
  }
}
