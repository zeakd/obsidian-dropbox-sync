export type SyncStatus = "idle" | "syncing" | "success" | "error";

export class StatusBar {
  private el: HTMLElement;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private _lastStatus: SyncStatus = "idle";
  private _lastDetail: string | undefined;

  constructor(statusBarEl: HTMLElement) {
    this.el = statusBarEl;
  }

  get lastStatus(): SyncStatus { return this._lastStatus; }
  get lastDetail(): string | undefined { return this._lastDetail; }

  onClick(callback: () => void): void {
    this.el.style.cursor = "pointer";
    this.el.addEventListener("click", callback);
  }

  update(status: SyncStatus, detail?: string): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this._lastStatus = status;
    this._lastDetail = detail;

    this.el.empty();
    this.el.style.color = "";

    switch (status) {
      case "idle":
        this.el.setText("Dropbox: idle");
        break;
      case "syncing":
        this.el.setText(detail ? `Dropbox: ${detail}` : "Dropbox: syncing...");
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
