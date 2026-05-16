export interface KnowledgeBase {
  id: string;
  name: string;
  docCount: number;
  updateTime: string;
  description?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  references?: number[];
}

export interface SourceDocument {
  id: number;
  title: string;
  type: 'pdf' | 'doc' | 'txt' | 'md';
  snippet: string;
  similarity: 'high' | 'medium' | 'low';
  updateTime: string;
}

export type SearchMode = 'semantic' | 'keyword' | 'hybrid';

export interface ChatSession {
  id: string;
  title: string;
  knowledgeBaseId: string;
  messages: Message[];
  createTime: Date;
}