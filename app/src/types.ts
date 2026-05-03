export type Session = {
  sessionId: string;
  sessionName: string;
  messageIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type SyncStatus = 'synced' | 'dirty' | 'draft' | 'processing' | 'error';

export type FsNode = {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  syncStatus: SyncStatus;
  children?: FsNode[];
};

export type ApiSessionResponse = {
  session_id: string;
  session_name: string;
  message_ids: string[];
  created_at: string;
  updated_at: string;
};

export type ApiMessageResponse = {
  message_id: string;
  session_id: string;
  role: 'user' | 'ai';
  content: string;
  created_at: string;
};

export type ApiSyncStatus = SyncStatus;

export type ApiFsNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  sync_status: ApiSyncStatus;
  children?: ApiFsNode[];
};

export type ApiFileContentResponse = {
  path: string;
  content: string;
};

export type ApiFileWriteResponse = {
  message: string;
  file_path: string;
  file_hash: string;
  sync_status: ApiSyncStatus;
  last_modified: string;
};

export type ApiFileMoveResponse = {
  message: string;
  old_path: string;
  new_path: string;
  file_hash: string;
  sync_status: ApiSyncStatus;
};

export type ApiSyncStatusResponse = {
  message: string;
  path: string;
  sync_status: ApiSyncStatus;
};

export type AutoDraftResponse = {
  sourceFile?: string;
  draft: string;
  message: string;
};
