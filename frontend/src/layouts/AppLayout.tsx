import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "antd";

import { generateImage } from "../api/generate";
import ChatWindowCard from "../components/ChatWindowCard";
import ComposerPanel from "../components/ComposerPanel";
import Sidebar from "../components/Sidebar";
import { modelMap, models, type ModelValue } from "../data/models";
import type { ChatMessage, ImageReference } from "../types/chat";
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
};

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createWindowState = (index: number): ChatWindowState => ({
  id: index,
  modelId: models[index % models.length]?.value ?? models[0].value,
  messages: [],
  isGenerating: false,
});

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

export default function AppLayout() {
  const [layoutCount, setLayoutCount] = useState<LayoutCount>(2);
  const [chatWindows, setChatWindows] = useState<ChatWindowState[]>(() =>
    Array.from({ length: layoutCount }, (_, index) => createWindowState(index))
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

  const handleModelChange = useCallback((index: number, modelId: ModelValue) => {
    setChatWindows((prev) =>
      prev.map((window) =>
        window.id === index ? { ...window, modelId } : window
      )
    );
  }, []);

  const handleClearChats = useCallback(() => {
    setChatWindows((prev) =>
      prev.map((window) => ({ ...window, messages: [], isGenerating: false }))
    );
  }, []);

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

      setChatWindows((prev) =>
        prev.map((window) => ({
          ...window,
          messages: [...window.messages, userMessage],
          isGenerating: true,
        }))
      );

      const windowsSnapshot = chatWindowsRef.current;
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

                return {
                  ...item,
                  messages: [...item.messages, assistantMessage],
                  isGenerating: false,
                };
              })
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "生成失败";
            setChatWindows((prev) =>
              prev.map((item) =>
                item.id === window.id
                  ? {
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
                    }
                  : item
              )
            );
          }
        })
      );
    },
    []
  );

  const isSending = useMemo(
    () => chatWindows.some((window) => window.isGenerating),
    [chatWindows]
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
                    model={window.modelId}
                    onModelChange={(value) =>
                      handleModelChange(window.id, value)
                    }
                    messages={window.messages}
                    isGenerating={window.isGenerating}
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
    </div>
  );
}
