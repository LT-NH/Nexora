import { useState, useCallback, useRef } from 'react';
import { api } from '@/services/api';
import { useWorkspace } from './useWorkspace';

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * useAIChat
 *
 * Streams an AI chat response from the backend over Server-Sent Events (SSE).
 * The endpoint POST /workspaces/:slug/ai/chat/stream returns a `text/event-stream`
 * response whose `data:` lines carry JSON chunks such as `{ "content": "..." }`.
 *
 * The stream is consumed with the Fetch API + a ReadableStream reader so that we
 * can abort an in-flight request with an AbortController. Partial SSE lines that
 * span chunk boundaries are buffered until a full line is available.
 */
export function useAIChat() {
  const [content, setContent] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { currentWorkspace } = useWorkspace();

  const send = useCallback(async (prompt: string, history?: AIChatMessage[]) => {
    if (!currentWorkspace || streaming) return;
    setContent('');
    setError(null);
    setStreaming(true);
    abortRef.current = new AbortController();

    try {
      const response = await fetch(
        `${api.defaults.baseURL || '/api/v1'}/workspaces/${currentWorkspace.slug}/ai/chat/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: JSON.stringify({ prompt, messages: history }),
          signal: abortRef.current.signal,
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      // Buffer for incomplete SSE lines that span chunk boundaries.
      let buffer = '';

      const handleData = (payload: string) => {
        if (!payload || payload === '[DONE]') return;
        try {
          const data = JSON.parse(payload);
          if (data.content) {
            setContent((prev) => prev + data.content);
          }
        } catch {
          // Partial JSON — wait for more data before parsing.
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are line-delimited. Keep the trailing (possibly partial)
        // line in the buffer and only process the complete lines.
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          handleData(trimmed.slice(5).trim());
        }
      }

      // Flush any remaining buffered data after the stream closes.
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        handleData(trimmed.slice(5).trim());
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'AI 请求失败');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [currentWorkspace, streaming]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const reset = useCallback(() => {
    setContent('');
    setError(null);
    setStreaming(false);
  }, []);

  return { content, streaming, error, send, stop, reset };
}
