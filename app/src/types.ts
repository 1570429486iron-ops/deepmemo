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
