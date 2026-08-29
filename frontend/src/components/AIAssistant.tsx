import React, { useState, useRef, useEffect } from 'react';
import { useI18n } from '@/i18n';
import { Sparkles, X, Send, Square, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAIChat, type AIChatMessage } from '@/hooks/useAIChat';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

const STORAGE_KEY = 'nexora_ai_assistant_messages';

const getSuggestedPrompts = (tt: (k: any) => string): string[] => [
  tt('ai_trend'),
  tt('ai_restock'),
  tt('ai_copy'),
  tt('ai_rfm'),
];

/** Load the persisted conversation history from sessionStorage. */
const loadHistory = (): ChatMessage[] => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * AIAssistant
 *
 * A floating AI chat widget that can be embedded on any page. It uses the
 * `useAIChat` hook to stream responses over SSE and persists the conversation
 * history to sessionStorage for the duration of the tab session.
 *
 * Multi-turn context: the full message history is passed to `send()` so the
 * backend receives the prior conversation as a `messages` array.
 *
 * Positioning note: the trigger button is stacked above the existing
 * FeedbackWidget (bottom-24) and BackToTop (bottom-6) floating buttons to
 * avoid overlapping them.
 */
export const AIAssistant: React.FC = () => {

  const { t: tt } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  // Live (in-progress) response text, mirrored from the hook while streaming.
  const [liveContent, setLiveContent] = useState('');
  const { content, streaming, error, send, stop, reset } = useAIChat();
  const messagesRef = useRef<HTMLDivElement>(null);
  const prevStreamingRef = useRef(false);

  // Persist conversation history to sessionStorage (keep the last 50 turns).
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
    } catch {
      // Ignore quota / serialization errors.
    }
  }, [messages]);

  // Auto-scroll to the latest content as it streams in.
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [content, messages, streaming, liveContent]);

  // Mirror the hook's streaming content into local state so we can clear it
  // once the response is finalized into the message history.
  useEffect(() => {
    if (streaming) {
      setLiveContent(content);
    }
  }, [content, streaming]);

  // When streaming finishes, persist the assistant reply into the history.
  useEffect(() => {
    if (prevStreamingRef.current && !streaming) {
      if (liveContent) {
        setMessages((prev) => [...prev, { role: 'assistant', content: liveContent, ts: Date.now() }]);
      }
      setLiveContent('');
    }
    prevStreamingRef.current = streaming;
  }, [streaming, liveContent]);

  const handleSend = (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || streaming) return;
    // Build the multi-turn history (all prior messages + the new user message)
    // so the backend receives the full conversation context.
    const history: AIChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: prompt },
    ];
    setMessages((prev) => [...prev, { role: 'user', content: prompt, ts: Date.now() }]);
    setLiveContent('');
    send(prompt, history);
    setInput('');
  };

  const handleRetry = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg || streaming) return;
    // Rebuild the history from existing messages (which already include the
    // last user message) and resend.
    const history: AIChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setLiveContent('');
    send(lastUserMsg.content, history);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const handleClear = () => {
    setMessages([]);
    setLiveContent('');
    reset();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  // Collapsed state: floating trigger button.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-44 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-fuchsia-500 text-white shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
        aria-label="AI 助手"
      >
        <Sparkles size={24} />
      </button>
    );
  }

  // Expanded state: chat panel.
  // On mobile (max-width: 768px) the panel spans almost the full viewport
  // width; on desktop it is a fixed w-96 anchored to the right.
  return (
    <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 h-[500px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary-500" />
          <span className="font-semibold text-slate-800 dark:text-slate-100">AI 助手</span>
        </div>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="清空记录"
            >
              清空
            </button>
          )}
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !liveContent && !streaming && (
          <div className="text-center text-slate-400 mt-4">
            <Sparkles size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm mb-4">有什么可以帮助你的？</p>
            {/* Suggested prompt cards — clicking sends immediately */}
            <div className="grid grid-cols-1 gap-2">
              {getSuggestedPrompts(tt).map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="text-left px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-xl p-3 text-sm ${
              m.role === 'user'
                ? 'ml-8 bg-primary-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {m.role === 'assistant' ? (
              <div className="ai-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            ) : (
              <span className="whitespace-pre-wrap">{m.content}</span>
            )}
          </div>
        ))}

        {/* Live streaming response with a typing cursor */}
        {(streaming || liveContent) && (
          <div className="bg-slate-100 dark:bg-slate-700 rounded-xl p-3 text-sm text-slate-700 dark:text-slate-200">
            <div className="ai-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{liveContent || '思考中...'}</ReactMarkdown>
            </div>
            {streaming && (
              <span className="inline-block w-2 h-4 bg-primary-500 ml-1 animate-pulse align-middle" />
            )}
          </div>
        )}

        {/* Error with retry button */}
        {error && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-red-500 text-sm text-center">{error}</div>
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <RefreshCw size={12} />
              重试
            </button>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-700">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入消息..."
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {streaming ? (
            <button
              onClick={stop}
              className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
              aria-label="停止生成"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="p-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40"
              aria-label="发送"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
