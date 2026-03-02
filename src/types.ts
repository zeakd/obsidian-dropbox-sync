/** 로컬 파일 정보 (vault에서 수집) */
export interface FileInfo {
  /** vault 내 경로 */
  path: string;
  /** Dropbox path_lower 형식 (비교 키) */
  pathLower: string;
  /** content_hash */
  hash: string;
  /** 수정 시각 (Unix ms) */
  mtime: number;
  /** 파일 크기 (bytes) */
  size: number;
}

/** 원격 파일 엔트리 (Dropbox에서 수집) */
export interface RemoteEntry {
  /** Dropbox path_lower */
  pathLower: string;
  /** Dropbox path_display */
  pathDisplay: string;
  /** content_hash (파일일 때만) */
  hash: string | null;
  /** 서버 수정 시각 (Unix ms) */
  serverModified: number;
  /** Dropbox rev */
  rev: string;
  /** 파일 크기 (bytes) */
  size: number;
  /** 삭제된 엔트리인지 */
  deleted: boolean;
}

/** 동기화 상태 엔트리 (state store에 저장) */
export interface SyncEntry {
  /** Dropbox path_lower (정규화된 키) */
  pathLower: string;
  /** vault 내 경로 (표시용) */
  localPath: string;
  /** 마지막 동기화 시점의 로컬 content_hash */
  baseLocalHash: string | null;
  /** 마지막 동기화 시점의 원격 content_hash */
  baseRemoteHash: string | null;
  /** Dropbox rev */
  rev: string | null;
  /** 마지막 동기화 시각 */
  lastSynced: number;
}

/** 동기화 액션 */
export type SyncAction =
  | { type: "upload"; reason: string }
  | { type: "download"; reason: string }
  | { type: "deleteLocal"; reason: string }
  | { type: "deleteRemote"; reason: string }
  | { type: "conflict"; localHash: string; remoteHash: string }
  | { type: "noop"; reason: string };

/** 동기화 계획 항목 */
export interface SyncPlanItem {
  pathLower: string;
  localPath: string;
  action: SyncAction;
}

/** 동기화 계획 */
export interface SyncPlan {
  items: SyncPlanItem[];
  stats: {
    upload: number;
    download: number;
    deleteLocal: number;
    deleteRemote: number;
    conflict: number;
    noop: number;
  };
}

/** Executor 실행 결과 */
export interface SyncResult {
  succeeded: SyncPlanItem[];
  failed: { item: SyncPlanItem; error: Error }[];
}

/** 원격 변경 목록 응답 */
export interface ListChangesResult {
  entries: RemoteEntry[];
  cursor: string;
  hasMore: boolean;
}

/** 다운로드 결과 */
export interface DownloadResult {
  data: Uint8Array;
  metadata: RemoteEntry;
}
