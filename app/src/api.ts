import type { ApiMessageResponse, ApiSessionResponse, ChatMessage, Session } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      // Keep the HTTP status text when the backend does not return JSON.
    }
    throw new Error(detail || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function mapSession(session: ApiSessionResponse): Session {
  return {
    sessionId: session.session_id,
    sessionName: session.session_name,
    messageIds: session.message_ids,
    createdAt: formatTime(session.created_at),
    updatedAt: formatTime(session.updated_at),
  };
}

export function mapMessage(message: ApiMessageResponse): ChatMessage {
  return {
    id: message.message_id,
    sessionId: message.session_id,
    role: message.role === 'ai' ? 'assistant' : 'user',
    content: message.content,
    createdAt: formatTime(message.created_at),
  };
}

export async function getHealth(): Promise<{ message: string }> {
  return request<{ message: string }>('/');
}

export async function listSessions(): Promise<Session[]> {
  const sessions = await request<ApiSessionResponse[]>('/sessions');
  return sessions.map(mapSession);
}

export async function createSession(sessionName: string): Promise<Session> {
  const session = await request<ApiSessionResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ session_name: sessionName }),
  });
  return mapSession(session);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await request<{ message: string }>(`/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  const messages = await request<ApiMessageResponse[]>(`/chat/${sessionId}/messages`);
  return messages.map(mapMessage);
}

export async function sendMessage(sessionId: string, userMessage: string): Promise<ChatMessage> {
  const message = await request<ApiMessageResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      user_message: userMessage,
    }),
  });
  return mapMessage(message);
}
