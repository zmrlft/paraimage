import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "antd";

import { generateImage } from "../api/generate";
import { getChatSessions, saveChatSession } from "../api/history";
import { getProviderConfigs } from "../api/settings";
import ChatHistoryModal from "../components/ChatHistoryModal";
import ChatWindowCard from "../components/ChatWindowCard";
import ComposerPanel from "../components/ComposerPanel";
import ImageManagerModal from "../components/ImageManagerModal";
import Sidebar from "../components/Sidebar";
import {
  buildModelList,
  buildModelMap,
  type ModelValue,
} from "../data/models";
import type { ChatMessage, ChatSession, ImageReference } from "../types/chat";
import type { ImageManagerItem } from "../types/image";
import type { LayoutCount } from "../types/layout";
import type { ProviderConfig } from "../types/provider";

const layoutGridMap: Record<LayoutCount, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 lg:grid-cols-2",
  3: "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 lg:grid-cols-2",
};

const { Content } = Layout;

type ChatWindowState = {
  id: number;
  modelId: ModelValue | null;
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
  modelId: null,
  messages: [],
  isGenerating: false,
  sessionId: createSessionId(),
});

const getNextWindowId = (windows: ChatWindowState[]) =>
  windows.reduce((max, window) => Math.max(max, window.id), -1) + 1;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

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
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([]);
  const models = useMemo(
    () => buildModelList(providerConfigs),
    [providerConfigs]
  );
  const modelMap = useMemo(() => buildModelMap(models), [models]);
  const [chatWindows, setChatWindows] = useState<ChatWindowState[]>(() =>
    Array.from({ length: layoutCount }, (_, index) => createWindowState(index))
  );
  const [chatHistories, setChatHistories] = useState<
    Record<ModelValue, ChatSession[]>
  >({});
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

  const refreshProviderConfigs = useCallback(async () => {
    const configs = await getProviderConfigs();
    setProviderConfigs(
      configs.map((config) => ({
        id: config.providerName,
        providerName: config.providerName,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        modelIds: config.modelIds ?? [],
      }))
    );
  }, []);

  useEffect(() => {
    let isActive = true;
    const loadProviders = async () => {
      const ready = await waitForPywebviewReady();
      if (!ready || !isActive) {
        return;
      }
      await refreshProviderConfigs();
    };
    loadProviders();
    return () => {
      isActive = false;
    };
  }, [refreshProviderConfigs]);

  useEffect(() => {
    chatWindowsRef.current = chatWindows;
  }, [chatWindows]);

  useEffect(() => {
    setChatWindows((prev) => {
      if (layoutCount === prev.length) {
        return prev;
      }
      if (layoutCount < prev.length) {
        return prev.slice(0, layoutCount);
      }
      const next = [...prev];
      let nextId = getNextWindowId(prev);
      while (next.length < layoutCount) {
        next.push(createWindowState(nextId));
        nextId += 1;
      }
      return next;
    });
  }, [layoutCount]);

  useEffect(() => {
    setChatWindows((prev) =>
      prev.map((window, index) => {
        if (window.modelId && modelMap.has(window.modelId)) {
          return window;
        }
        const nextModel = models[index % models.length]?.value ?? null;
        if (!nextModel) {
          return window.modelId
            ? { ...window, modelId: null, isGenerating: false }
            : window;
        }
        return {
          ...window,
          modelId: nextModel,
          messages: [],
          isGenerating: false,
          sessionId: createSessionId(),
        };
      })
    );
  }, [modelMap, models]);

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
      if (!window.modelId) {
        return;
      }
      const modelKey = window.modelId;
      const now = new Date().toISOString();
      const nextSession: ChatSession = {
        id: window.sessionId,
        modelId: modelKey,
        title: buildSessionTitle(window.messages),
        messages: window.messages,
        createdAt: now,
        updatedAt: now,
      };

      setChatHistories((prev) => {
        const sessions = prev[modelKey]
          ? [...prev[modelKey]]
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
        return { ...prev, [modelKey]: sessions };
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

  const handleCloseWindow = useCallback(
    (windowId: number) => {
      setChatWindows((prev) => {
        const target = prev.find((window) => window.id === windowId);
        if (target) {
          recordSession(target);
        }
        if (prev.length <= 1) {
          return prev.map((window) =>
            window.id === windowId
              ? {
                  ...window,
                  modelId: null,
                  messages: [],
                  isGenerating: false,
                  sessionId: createSessionId(),
                }
              : window
          );
        }
        return prev.filter((window) => window.id !== windowId);
      });

      setHistoryModal((prev) =>
        prev.windowId === windowId
          ? { open: false, modelId: null, windowId: null }
          : prev
      );
      if (historyModal.windowId === windowId) {
        setSelectedSessionId(null);
      }
      setLayoutCount((prevCount) => {
        if (prevCount <= 1) {
          return prevCount;
        }
        return (prevCount - 1) as LayoutCount;
      });
    },
    [historyModal.windowId, recordSession]
  );

  const handleFocusModel = useCallback(
    (modelId: ModelValue) => {
      const snapshot = chatWindowsRef.current;
      snapshot.forEach((window) => {
        if (window.messages.length > 0) {
          recordSession(window);
        }
      });

      setChatWindows((prev) => {
        const existing = prev.find((window) => window.modelId === modelId);
        if (existing) {
          return [existing];
        }
        const nextId = getNextWindowId(prev);
        return [{ ...createWindowState(nextId), modelId }];
      });
      setHistoryModal({ open: false, modelId: null, windowId: null });
      setSelectedSessionId(null);
      setLayoutCount(1);
    },
    [recordSession]
  );

  const handleSend = useCallback(
    async ({ prompt, files }: { prompt: string; files: File[] }) => {
      if (models.length === 0) {
        return;
      }
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
      const eligibleIds = new Set(
        windowsSnapshot
          .filter((window) => window.modelId && modelMap.has(window.modelId))
          .map((window) => window.id)
      );
      const nextWindows = windowsSnapshot.map((window) => {
        const sessionId = window.sessionId || createSessionId();
        const nextWindow = {
          ...window,
          sessionId,
          messages: [...window.messages, userMessage],
          isGenerating: eligibleIds.has(window.id),
        };
        recordSession(nextWindow);
        return nextWindow;
      });
      setChatWindows(nextWindows);

      await Promise.allSettled(
        windowsSnapshot.map(async (window) => {
          if (!eligibleIds.has(window.id) || !window.modelId) {
            return;
          }
          try {
            const modelMeta = modelMap.get(window.modelId);
            if (!modelMeta) {
              return;
            }
            const response = await generateImage({
              modelId: modelMeta.modelId,
              providerName: modelMeta.providerName,
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
    [modelMap, models.length, recordSession]
  );

  const handleRetryMessage = useCallback(
    async (payload: { windowId: number; message: ChatMessage }) => {
      const { windowId, message } = payload;
      const prompt = message.prompt?.trim() ?? "";
      const references = message.references ?? [];
      if (!prompt && references.length === 0) {
        return;
      }

      const windowSnapshot = chatWindowsRef.current.find(
        (window) => window.id === windowId
      );
      if (!windowSnapshot || !windowSnapshot.modelId) {
        return;
      }
      if (windowSnapshot.isGenerating) {
        return;
      }
      const modelMeta = modelMap.get(windowSnapshot.modelId);
      if (!modelMeta) {
        return;
      }

      setChatWindows((prev) =>
        prev.map((window) =>
          window.id === windowId ? { ...window, isGenerating: true } : window
        )
      );

      try {
        const response = await generateImage({
          modelId: modelMeta.modelId,
          providerName: modelMeta.providerName,
          prompt,
          references,
        });

        setChatWindows((prev) =>
          prev.map((window) => {
            if (window.id !== windowId) {
              return window;
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
              ...window,
              messages: [...window.messages, assistantMessage],
              isGenerating: false,
            };
            recordSession(nextWindow);
            return nextWindow;
          })
        );
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "生成失败";
        setChatWindows((prev) =>
          prev.map((window) => {
            if (window.id !== windowId) {
              return window;
            }
            const nextWindow = {
              ...window,
              messages: [
                ...window.messages,
                {
                  id: createId(),
                  role: "assistant",
                  modelId: window.modelId,
                  error: messageText,
                  createdAt: new Date().toISOString(),
                },
              ],
              isGenerating: false,
            };
            recordSession(nextWindow);
            return nextWindow;
          })
        );
      }
    },
    [modelMap, recordSession]
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
      if (models.length === 0) {
        setChatHistories({});
        return;
      }
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
  }, [models]);

  const handleOpenHistory = useCallback(
    (windowId: number, modelId: ModelValue | null) => {
      if (!modelId) {
        return;
      }
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

  const handleOpenImageManagerFromSidebar = useCallback(() => {
    const firstId = sourceImages[0]?.id ?? null;
    setImageManager({ open: true, activeId: firstId });
  }, [sourceImages]);

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
        <Sidebar
          layoutCount={layoutCount}
          onLayoutChange={setLayoutCount}
          models={models}
          onProvidersSaved={refreshProviderConfigs}
          onModelSelect={handleFocusModel}
          onOpenImageManager={handleOpenImageManagerFromSidebar}
        />

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
                    models={models}
                    modelMap={modelMap}
                    onModelChange={(value) =>
                      handleModelChange(window.id, value)
                    }
                    messages={window.messages}
                    isGenerating={window.isGenerating}
                    onOpenHistory={() =>
                      handleOpenHistory(window.id, window.modelId)
                    }
                    onImageClick={handleOpenImageManager}
                    onClose={() => handleCloseWindow(window.id)}
                    canClose={chatWindows.length > 1}
                    onRetryMessage={handleRetryMessage}
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
        modelMap={modelMap}
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
        modelMap={modelMap}
        onClose={handleCloseImageManager}
      />
    </div>
  );
}
