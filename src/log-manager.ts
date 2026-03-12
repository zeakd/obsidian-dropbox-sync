/** Vault adapter의 파일 I/O 인터페이스 (obsidian 의존 최소화) */
export interface LogStorage {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
}

/**
 * 동기화 로그 관리.
 *
 * 버퍼링하여 디스크 쓰기를 줄이고, 최대 줄 수를 초과하면 오래된 로그를 삭제한다.
 */
export interface LogManagerOptions {
  maxLines?: number;
  flushSize?: number;
  /** false로 설정하면 console.debug 출력을 억제 */
  consoleOutput?: boolean;
}

export class LogManager {
  private buffer: string[] = [];
  private maxLines: number;
  private flushSize: number;
  private consoleOutput: boolean;

  constructor(
    private storage: LogStorage,
    private getLogPath: () => string,
    options?: LogManagerOptions | number,
    flushSize?: number,
  ) {
    if (typeof options === "number") {
      // 하위 호환: (storage, getLogPath, maxLines, flushSize)
      this.maxLines = options;
      this.flushSize = flushSize ?? 10;
      this.consoleOutput = true;
    } else {
      this.maxLines = options?.maxLines ?? 200;
      this.flushSize = options?.flushSize ?? 10;
      this.consoleOutput = options?.consoleOutput ?? true;
    }
  }

  async log(msg: string, data?: unknown): Promise<void> {
    const ts = new Date().toISOString();
    const detail = data instanceof Error
      ? `${data.name}: ${data.message}` + (data.stack ? `\n${data.stack}` : "")
      : data !== undefined ? JSON.stringify(data) : "";
    const line = detail ? `[${ts}] ${msg} ${detail}` : `[${ts}] ${msg}`;
    if (this.consoleOutput) console.debug("[Dropbox Sync]", msg, data ?? "");
    this.buffer.push(line);
    if (this.buffer.length >= this.flushSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const toWrite = this.buffer.splice(0);
    try {
      const logPath = this.getLogPath();
      let existing = "";
      if (await this.storage.exists(logPath)) {
        existing = await this.storage.read(logPath);
      }
      const lines = existing ? existing.split("\n").filter(Boolean) : [];
      lines.push(...toWrite);
      const trimmed = lines.slice(-this.maxLines);
      await this.storage.write(logPath, trimmed.join("\n") + "\n");
    } catch { /* ignore log write failures */ }
  }

  async read(): Promise<string> {
    await this.flush();
    try {
      const logPath = this.getLogPath();
      if (await this.storage.exists(logPath)) {
        return await this.storage.read(logPath);
      }
    } catch { /* ignore */ }
    return "(no logs)";
  }
}
