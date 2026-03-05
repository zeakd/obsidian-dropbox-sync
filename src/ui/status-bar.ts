export type SyncStatus = "idle" | "syncing" | "success" | "error";

export class StatusBar {
  private el: HTMLElement;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private _lastStatus: SyncStatus = "idle";
  private _lastDetail: string | undefined;
  private _enabled = false;

  constructor(statusBarEl: HTMLElement) {
    this.el = statusBarEl;
  }

  get lastStatus(): SyncStatus { return this._lastStatus; }
  get lastDetail(): string | undefined { return this._lastDetail; }

  set enabled(value: boolean) {
    this._enabled = value;
    if (this._lastStatus === "idle") {
      this.render();
    }
  }

  onClick(callback: () => void): void {
    this.el.style.cursor = "pointer";
    this.el.addEventListener("click", callback);
  }

  onContextMenu(callback: (evt: MouseEvent) => void): void {
    this.el.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      callback(evt);
    });
  }

  update(status: SyncStatus, detail?: string): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this._lastStatus = status;
    this._lastDetail = detail;
    this.render();

    if (status === "success") {
      this.timerId = setTimeout(() => this.update("idle"), 5000);
    }
  }

  destroy(): void {
    if (this.timerId) clearTimeout(this.timerId);
  }

  private render(): void {
    this.el.empty();
    this.el.style.color = "";

    switch (this._lastStatus) {
      case "idle":
        if (this._enabled) {
          this.el.setText("Dropbox: idle");
        } else {
          this.el.setText("Dropbox: off");
          this.el.style.color = "var(--text-muted)";
        }
        break;
      case "syncing":
        this.el.setText(this._lastDetail ? `⟳ ${this._lastDetail}` : "⟳ syncing...");
        break;
      case "success":
        this.el.setText(`Dropbox: ${this._lastDetail ?? "synced"}`);
        break;
      case "error":
        this.el.setText(`Dropbox: ${this._lastDetail ?? "error"}`);
        this.el.style.color = "var(--text-error)";
        break;
    }
  }
}
