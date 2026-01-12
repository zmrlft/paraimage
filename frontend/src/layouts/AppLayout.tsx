import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "antd";

import { generateImage } from "../api/generate";
import { getChatSessions, saveChatSession } from "../api/history";
import ChatHistoryModal from "../components/ChatHistoryModal";
import ChatWindowCard from "../components/ChatWindowCard";
import ComposerPanel from "../components/ComposerPanel";
import ImageManagerModal from "../components/ImageManagerModal";
import Sidebar from "../components/Sidebar";
import { modelMap, models, type ModelValue } from "../data/models";
import type { ChatMessage, ChatSession, ImageReference } from "../types/chat";
import type { ImageManagerItem } from "../types/image";
import type { LayoutCount } from "../types/layout";

const layoutGridMap: Record<LayoutCount, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 lg:grid-cols-2",
  3: "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 lg:grid-cols-2",
};

const { Content } = Layout;

type ChatWindowState = {
  id: number;
  modelId: ModelValue;
  messages: ChatMessage[];
  isGenerating: boolean;
  sessionId: string;
};

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createSessionId = () =>
  `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createWindowState = (index: number): ChatWindowState => ({
  id: index,
  modelId: models[index % models.length]?.value ?? models[0].value,
  messages: [],
  isGenerating: false,
  sessionId: createSessionId(),
});

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const createInitialHistories = () =>
  models.reduce((acc, model) => {
    acc[model.value] = [];
    return acc;
  }, {} as Record<ModelValue, ChatSession[]>);

const waitForPywebviewReady = (timeoutMs = 1500) =>
  new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    const api = (window as unknown as { pywebview?: { api?: unknown } })
      .pywebview?.api;
    if (api) {
      resolve(true);
      return;
    }
    let settled = false;
    const handleReady = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("pywebviewready", handleReady);
      resolve(true);
    };
    const timer = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener("pywebviewready", handleReady);
      resolve(false);
    }, timeoutMs);
    window.addEventListener("pywebviewready", handleReady);
  });

export default function AppLayout() {
  const [layoutCount, setLayoutCount] = useState<LayoutCount>(2);
  const [chatWindows, setChatWindows] = useState<ChatWindowState[]>(() =>
    Array.from({ length: layoutCount }, (_, index) => createWindowState(index))
  );
  const [chatHistories, setChatHistories] = useState<
    Record<ModelValue, ChatSession[]>
  >(createInitialHistories);
  const [historyModal, setHistoryModal] = useState<{
    open: boolean;
    modelId: ModelValue | null;
    windowId: number | null;
  }>({ open: false, modelId: null, windowId: null });
  const [imageManager, setImageManager] = useState<{
    open: boolean;
    activeId: string | null;
  }>({ open: false, activeId: null });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const chatWindowsRef = useRef(chatWindows);

  const gridClass = layoutGridMap[layoutCount];

  useEffect(() => {
    chatWindowsRef.current = chatWindows;
  }, [chatWindows]);

  useEffect(() => {
    setChatWindows((prev) => {
      const next = Array.from({ length: layoutCount }, (_, index) => {
        return prev[index] ?? createWindowState(index);
      });
      return next;
    });
  }, [layoutCount]);

  const handleClearChats = useCallback(() => {
    setChatWindows((prev) =>
      prev.map((window) => ({
        ...window,
        messages: [],
        isGenerating: false,
        sessionId: createSessionId(),
      }))
    );
  }, []);

  const buildSessionTitle = useCallback((messages: ChatMessage[]) => {
    const firstPrompt = messages.find(
      (message) => message.role === "user" && message.prompt?.trim()
    )?.prompt;
    if (firstPrompt) {
      return firstPrompt.trim();
    }
    const hasImages = messages.some(
      (message) => message.references && message.references.length > 0
    );
    return hasImages ? "图片对话" : "新的会话";
  }, []);

  const recordSession = useCallback(
    (window: ChatWindowState) => {
      if (!window.sessionId || window.messages.length === 0) {
        return;
      }
      const now = new Date().toISOString();
      const nextSession: ChatSession = {
        id: window.sessionId,
        modelId: window.modelId,
        title: buildSessionTitle(window.messages),
        messages: window.messages,
        createdAt: now,
        updatedAt: now,
      };

      setChatHistories((prev) => {
        const sessions = prev[window.modelId]
          ? [...prev[window.modelId]]
          : [];
        const index = sessions.findIndex(
          (session) => session.id === window.sessionId
        );
        const existing = index >= 0 ? sessions[index] : null;
        nextSession.createdAt = existing?.createdAt ?? nextSession.createdAt;
        if (index >= 0) {
          sessions[index] = nextSession;
        } else {
          sessions.unshift(nextSession);
        }
        sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return { ...prev, [window.modelId]: sessions };
      });

      saveChatSession(nextSession).catch(() => {
        // Best-effort persistence; ignore failures in dev mode.
      });
    },
    [buildSessionTitle]
  );

  const handleModelChange = useCallback(
    (index: number, modelId: ModelValue) => {
      setChatWindows((prev) =>
        prev.map((window) => {
          if (window.id !== index) {
            return window;
          }
          if (window.modelId === modelId) {
            return window;
          }
          recordSession(window);
          return {
            ...window,
            modelId,
            messages: [],
            isGenerating: false,
            sessionId: createSessionId(),
          };
        })
      );
    },
    [recordSession]
  );

  const handleSend = useCallback(
    async ({ prompt, files }: { prompt: string; files: File[] }) => {
      const references: ImageReference[] = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          dataUrl: await readFileAsDataUrl(file),
        }))
      );

      const userMessage: ChatMessage = {
        id: createId(),
        role: "user",
        prompt,
        references,
        createdAt: new Date().toISOString(),
      };

      const windowsSnapshot = chatWindowsRef.current;
      const nextWindows = windowsSnapshot.map((window) => {
        const sessionId = window.sessionId || createSessionId();
        const nextWindow = {
          ...window,
          sessionId,
          messages: [...window.messages, userMessage],
          isGenerating: true,
        };
        recordSession(nextWindow);
        return nextWindow;
      });
      setChatWindows(nextWindows);

      await Promise.allSettled(
        windowsSnapshot.map(async (window) => {
          try {
            const modelMeta = modelMap.get(window.modelId);
            const response = await generateImage({
              modelId: window.modelId,
              providerName: modelMeta?.provider,
              prompt,
              references,
            });

            setChatWindows((prev) =>
              prev.map((item) => {
                if (item.id !== window.id) {
                  return item;
                }
                const assistantMessage: ChatMessage = response.ok
                  ? {
                      id: createId(),
                      role: "assistant",
                      modelId: window.modelId,
                      imageUrl: response.imageUrl,
                      createdAt: new Date().toISOString(),
                    }
                  : {
                      id: createId(),
                      role: "assistant",
                      modelId: window.modelId,
                      error: response.error || "生成失败",
                      createdAt: new Date().toISOString(),
                    };

                const nextWindow = {
                  ...item,
                  messages: [...item.messages, assistantMessage],
                  isGenerating: false,
                };
                recordSession(nextWindow);
                return nextWindow;
              })
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "生成失败";
            setChatWindows((prev) =>
              prev.map((item) =>
                item.id === window.id
                  ? (() => {
                      const nextWindow = {
                        ...item,
                        messages: [
                          ...item.messages,
                          {
                            id: createId(),
                            role: "assistant",
                            modelId: window.modelId,
                            error: message,
                            createdAt: new Date().toISOString(),
                          },
                        ],
                        isGenerating: false,
                      };
                      recordSession(nextWindow);
                      return nextWindow;
                    })()
                  : item
              )
            );
          }
        })
      );
    },
    [recordSession]
  );

  const isSending = useMemo(
    () => chatWindows.some((window) => window.isGenerating),
    [chatWindows]
  );

  useEffect(() => {
    if (!historyModal.open || !historyModal.modelId) {
      return;
    }
    const sessions = chatHistories[historyModal.modelId] ?? [];
    if (
      !selectedSessionId ||
      !sessions.some((session) => session.id === selectedSessionId)
    ) {
      setSelectedSessionId(sessions[0]?.id ?? null);
    }
  }, [
    chatHistories,
    historyModal.modelId,
    historyModal.open,
    selectedSessionId,
  ]);

  useEffect(() => {
    let isActive = true;
    const loadHistories = async () => {
      const ready = await waitForPywebviewReady();
      if (!ready || !isActive) {
        return;
      }
      const results = await Promise.all(
        models.map(async (model) => ({
          modelId: model.value,
          sessions: await getChatSessions(model.value),
        }))
      );
      if (!isActive) {
        return;
      }
      setChatHistories((prev) => {
        const next = { ...prev };
        results.forEach(({ modelId, sessions }) => {
          next[modelId] = sessions;
        });
        return next;
      });
    };
    loadHistories();
    return () => {
      isActive = false;
    };
  }, []);

  const handleOpenHistory = useCallback(
    (windowId: number, modelId: ModelValue) => {
      const sessions = chatHistories[modelId] ?? [];
      setHistoryModal({ open: true, modelId, windowId });
      setSelectedSessionId(sessions[0]?.id ?? null);
    },
    [chatHistories]
  );

  const handleCloseHistory = useCallback(() => {
    setHistoryModal({ open: false, modelId: null, windowId: null });
    setSelectedSessionId(null);
  }, []);

  const sourceImages = useMemo<ImageManagerItem[]>(() => {
    const results: ImageManagerItem[] = [];
    chatWindows.forEach((window) => {
      window.messages.forEach((message) => {
        if (message.role !== "assistant" || !message.imageUrl) {
          return;
        }
        results.push({
          id: `source-${window.id}-${message.id}`,
          imageUrl: message.imageUrl,
          origin: "source",
          modelId: message.modelId ?? window.modelId,
          windowId: window.id,
          messageId: message.id,
          createdAt: message.createdAt,
        });
      });
    });
    return results;
  }, [chatWindows]);

  const handleOpenImageManager = useCallback(
    (payload: { windowId: number; messageId: string; imageUrl: string }) => {
      const activeId = `source-${payload.windowId}-${payload.messageId}`;
      setImageManager({ open: true, activeId });
    },
    []
  );

  const handleCloseImageManager = useCallback(() => {
    setImageManager({ open: false, activeId: null });
  }, []);

  const handleContinueSession = useCallback(
    (sessionId: string) => {
      if (!historyModal.modelId || historyModal.windowId === null) {
        return;
      }
      const sessions = chatHistories[historyModal.modelId] ?? [];
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) {
        return;
      }
      setChatWindows((prev) =>
        prev.map((window) =>
          window.id === historyModal.windowId
            ? {
                ...window,
                modelId: session.modelId,
                messages: session.messages,
                isGenerating: false,
                sessionId: session.id,
              }
            : window
        )
      );
      handleCloseHistory();
    },
    [chatHistories, handleCloseHistory, historyModal.modelId, historyModal.windowId]
  );

  return (
    <div className="h-screen p-4 md:p-6">
      <Layout
        style={{ background: "transparent" }}
        className="h-full w-full gap-4 bg-transparent"
      >
        <Sidebar layoutCount={layoutCount} onLayoutChange={setLayoutCount} />

        <Content className="flex min-h-0 flex-1">
          <main className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex min-h-0 flex-1">
              <div
                className={`grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] gap-4 ${gridClass}`}
              >
                {chatWindows.map((window) => (
                  <ChatWindowCard
                    key={window.id}
                    windowId={window.id}
                    model={window.modelId}
                    onModelChange={(value) =>
                      handleModelChange(window.id, value)
                    }
                    messages={window.messages}
                    isGenerating={window.isGenerating}
                    onOpenHistory={() =>
                      handleOpenHistory(window.id, window.modelId)
                    }
                    onImageClick={handleOpenImageManager}
                  />
                ))}
              </div>
            </div>
            <ComposerPanel
              onSend={handleSend}
              onClearChats={handleClearChats}
              sending={isSending}
            />
          </main>
        </Content>
      </Layout>

      <ChatHistoryModal
        open={historyModal.open}
        modelId={historyModal.modelId}
        sessions={
          historyModal.modelId ? chatHistories[historyModal.modelId] ?? [] : []
        }
        selectedSessionId={selectedSessionId}
        onSelectSession={setSelectedSessionId}
        onContinue={handleContinueSession}
        onClose={handleCloseHistory}
      />

      <ImageManagerModal
        open={imageManager.open}
        images={sourceImages}
        initialActiveId={imageManager.activeId}
        onClose={handleCloseImageManager}
      />
    </div>
  );
}
