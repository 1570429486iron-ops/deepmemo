import { useState, useCallback } from 'react';
import { Sidebar, TopBar, ChatPanel, Composer, SourcesPanel } from './components';
import { Message, KnowledgeBase, SearchMode, SourceDocument } from './types';
import { mockKnowledgeBases, mockResponses, generateMockSession } from './data/mockData';
import './styles/global.css';

function App() {
  const [selectedKbId, setSelectedKbId] = useState<string>(mockKnowledgeBases[0]?.id || '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sourcesVisible, setSourcesVisible] = useState(true);
  const [searchMode, setSearchMode] = useState<SearchMode>('semantic');

  const selectedKb = mockKnowledgeBases.find((kb) => kb.id === selectedKbId) || null;

  const getMockResponse = (question: string) => {
    const lowerQ = question.toLowerCase();
    if (lowerQ.includes('部署') || lowerQ.includes('deploy')) {
      return mockResponses.deployment;
    }
    if (lowerQ.includes('权限') || lowerQ.includes('permission')) {
      return mockResponses.permission;
    }
    return mockResponses.default;
  };

  const handleSend = useCallback((text: string) => {
    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setSources([]);

    setTimeout(() => {
      const { answer, sources: newSources } = getMockResponse(text);
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: answer,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setSources(newSources);
      setIsLoading(false);
    }, 1000);
  }, []);

  const handleExampleClick = useCallback((question: string) => {
    handleSend(question);
  }, [handleSend]);

  const handleRefresh = useCallback(() => {
    if (messages.length > 0) {
      setIsLoading(true);
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMessage) {
        setTimeout(() => {
          const { answer, sources: newSources } = getMockResponse(lastUserMessage.content);
          const assistantMessage: Message = {
            id: `msg-${Date.now()}-assistant`,
            role: 'assistant',
            content: answer,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setSources(newSources);
          setIsLoading(false);
        }, 1000);
      }
    }
  }, [messages]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setSources([]);
  }, []);

  return (
    <div className="app-container">
      <Sidebar selectedKbId={selectedKbId} onKbSelect={setSelectedKbId} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar
          knowledgeBase={selectedKb}
          searchMode={searchMode}
          onSearchModeChange={setSearchMode}
          onRefresh={handleRefresh}
          onClear={handleClear}
          onToggleSources={() => setSourcesVisible((v) => !v)}
          sourcesVisible={sourcesVisible}
          isLoading={isLoading}
        />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <ChatPanel
              messages={messages}
              isLoading={isLoading}
              onExampleClick={handleExampleClick}
              hasKnowledgeBase={!!selectedKb}
            />
            <Composer
              onSend={handleSend}
              disabled={isLoading || !selectedKb}
              searchMode={searchMode}
              onSearchModeChange={setSearchMode}
            />
          </div>
          <SourcesPanel
            sources={sources}
            visible={sourcesVisible}
            onToggle={() => setSourcesVisible((v) => !v)}
          />
        </div>
      </div>
    </div>
  );
}

export default App;