import { useCallback, useMemo, useState } from "react";
import { Button, Card, Select, Space, Tooltip } from "antd";
import {
  Copy,
  History,
  Images,
  RotateCw,
  Share2,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";

import {
  getModelIconUrl,
  getProviderInitial,
  type ModelDefinition,
  type ModelValue,
} from "../data/models";
import type { ChatMessage } from "../types/chat";
import ImagePreviewModal from "./ImagePreviewModal";

type ChatWindowCardProps = {
  windowId: number;
  model: ModelValue | null;
  models: ModelDefinition[];
  modelMap: Map<ModelValue, ModelDefinition>;
  onModelChange: (model: ModelValue) => void;
  messages: ChatMessage[];
  isGenerating: boolean;
  onOpenHistory?: () => void;
  onImageClick?: (payload: {
    windowId: number;
    messageId: string;
    imageUrl: string;
  }) => void;
  onClose?: () => void;
  canClose?: boolean;
  onRetryMessage?: (payload: { windowId: number; message: ChatMessage }) => void;
};

export default function ChatWindowCard({
  windowId,
  model,
  models,
  modelMap,
  onModelChange,
  messages,
  isGenerating,
  onOpenHistory,
  onImageClick,
  onClose,
  canClose = true,
  onRetryMessage,
}: ChatWindowCardProps) {
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    imageUrl: string;
    title: string;
  }>({ open: false, imageUrl: "", title: "" });

  const copyTextToClipboard = useCallback(async (text: string) => {
    if (!text) {
      return;
    }
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }, []);
  const copyImageToClipboard = useCallback(
    async (imageUrl: string) => {
      if (!imageUrl) {
        return;
      }
      const clipboardItemCtor = (
        window as Window & { ClipboardItem?: typeof ClipboardItem }
      ).ClipboardItem;
      if (navigator?.clipboard?.write && clipboardItemCtor) {
        try {
          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error("Failed to fetch image for clipboard");
          }
          const blob = await response.blob();
          const mimeType = blob.type || "image/png";
          await navigator.clipboard.write([
            new clipboardItemCtor({ [mimeType]: blob }),
          ]);
          return;
        } catch {
          // Fall back to copying the image URL.
        }
      }
      await copyTextToClipboard(imageUrl);
    },
    [copyTextToClipboard]
  );
  const selectOptions = useMemo(
    () =>
      models.map((item) => ({
        value: item.value,
        label: (
          <div className="flex items-center gap-2">
            {item.iconSlug ? (
              <img
                src={getModelIconUrl(item.iconSlug)}
                alt={`${item.label} logo`}
                className="h-5 w-5 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                {getProviderInitial(item.providerName)}
              </div>
            )}
            <span>{item.label}</span>
          </div>
        ),
      })),
    [models]
  );
  const activeModel = model ? modelMap.get(model) : undefined;
  const hasModels = models.length > 0;
  const closeDisabled = !onClose || !canClose;

  const handleOpenPreview = useCallback((imageUrl: string, title: string) => {
    setPreviewState({ open: true, imageUrl, title });
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewState((prev) => ({ ...prev, open: false }));
  }, []);

  return (
    <Card
      className="rounded-2xl! flex h-full min-h-0 flex-col overflow-hidden shadow-[0_30px_60px_-40px_rgba(15,23,42,0.55)]"
      styles={{
        header: {
          borderBottom: "1px solid rgba(226,232,240,0.8)",
          padding: "10px 16px",
        },
        body: {
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        },
      }}
      title={
        <div className="flex items-center gap-2">
          <Select
            value={model ?? undefined}
            onChange={(value) => onModelChange(value as ModelValue)}
            options={selectOptions}
            size="large"
            className="min-w-40"
            popupMatchSelectWidth={200}
            variant={"borderless"}
            placeholder={hasModels ? "选择模型" : "未配置模型"}
            disabled={!hasModels}
          />
        </div>
      }
      extra={
        <Space size={6}>
          <Tooltip title="Share">
            <Button
              type="text"
              icon={<Share2 size={16} />}
              className="text-slate-500 hover:text-slate-700"
            />
          </Tooltip>
          <Tooltip title="Clear">
            <Button
              type="text"
              icon={<Trash2 size={16} />}
              className="text-slate-500 hover:text-slate-700"
            />
          </Tooltip>
          <Tooltip title="History">
            <Button
              type="text"
              icon={<History size={16} />}
              className="text-slate-500 hover:text-slate-700"
              onClick={onOpenHistory}
            />
          </Tooltip>
          <Tooltip title={closeDisabled ? "至少保留一个聊天卡片" : "关闭"}>
            <Button
              type="text"
              icon={<X size={16} />}
              className="text-slate-500 hover:text-slate-700"
              onClick={onClose}
              disabled={closeDisabled}
            />
          </Tooltip>
        </Space>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-400">
              还没有内容，发送提示词开始出图。
            </div>
          )}
          {messages.map((message) => {
            if (message.role === "user") {
              const content = message.prompt || "";
              const hasRetryContent =
                content.trim().length > 0 ||
                (message.references && message.references.length > 0);
              const retryDisabled =
                !onRetryMessage || isGenerating || !hasRetryContent;
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="w-full max-w-[75%] rounded-2xl bg-slate-100/80 p-3 text-sm text-slate-700 select-text">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                        你
                      </div>
                      <div className="flex items-center gap-1">
                        <Tooltip title="重试">
                          <Button
                            type="text"
                            size="small"
                            icon={<RotateCw size={14} />}
                            onClick={() =>
                              onRetryMessage?.({ windowId, message })
                            }
                            disabled={retryDisabled}
                            className="text-slate-400 hover:text-slate-600"
                          />
                        </Tooltip>
                        <Tooltip title="复制内容">
                          <Button
                            type="text"
                            size="small"
                            icon={<Copy size={14} />}
                            onClick={() => copyTextToClipboard(content)}
                            disabled={!content}
                            className="text-slate-400 hover:text-slate-600"
                          />
                        </Tooltip>
                      </div>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap select-text">
                      {message.prompt || "已发送参考图"}
                    </div>
                    {message.references && message.references.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 select-auto">
                        {message.references.map((ref) => (
                          <img
                            key={`${message.id}-${ref.name}`}
                            src={ref.dataUrl}
                            alt={ref.name}
                            className="h-12 w-12 rounded-xl object-cover select-auto"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            const modelLabel =
              (message.modelId && modelMap.get(message.modelId)?.label) ||
              activeModel?.label ||
              "模型";
            const imageUrl = message.imageUrl;
            const copyDisabled = !message.error && !imageUrl;
            const handleCopyClick = () => {
              if (message.error) {
                copyTextToClipboard(message.error);
                return;
              }
              if (imageUrl) {
                copyImageToClipboard(imageUrl);
              }
            };

            return (
              <div key={message.id} className="flex justify-start">
                <div className="w-full max-w-[75%] rounded-2xl border border-slate-100 bg-white p-3 text-sm text-slate-700 shadow-sm select-text">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      {modelLabel}
                    </div>
                    <Tooltip
                      title={message.error ? "复制错误" : "复制图片"}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<Copy size={14} />}
                        onClick={handleCopyClick}
                        disabled={copyDisabled}
                        className="text-slate-400 hover:text-slate-600"
                      />
                    </Tooltip>
                  </div>
                  {message.error ? (
                    <div className="mt-2 text-sm text-rose-500">
                      {message.error}
                    </div>
                  ) : (
                    imageUrl && (
                      <div className="group relative mt-2 w-full max-w-56 select-auto">
                        <img
                          src={imageUrl}
                          alt={`${modelLabel} output`}
                          className="w-full cursor-pointer rounded-xl object-cover transition select-auto"
                          loading="lazy"
                          onClick={() =>
                            handleOpenPreview(
                              imageUrl,
                              `${modelLabel} output`
                            )
                          }
                        />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-slate-900/40 opacity-0 transition group-hover:opacity-100">
                          <Tooltip title="打开图片管理">
                            <Button
                              type="primary"
                              size="small"
                              icon={<Images size={14} />}
                              onClick={(event) => {
                                event.stopPropagation();
                                onImageClick?.({
                                  windowId,
                                  messageId: message.id,
                                  imageUrl,
                                });
                              }}
                              className="rounded-full shadow-sm"
                            />
                          </Tooltip>
                          <Tooltip title="放大预览">
                            <Button
                              size="small"
                              icon={<ZoomIn size={14} />}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenPreview(
                                  imageUrl,
                                  `${modelLabel} output`
                                );
                              }}
                              className="rounded-full border-white/70 bg-white/90 text-slate-700 shadow-sm"
                            />
                          </Tooltip>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
          {isGenerating && (
            <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 p-3 text-sm text-slate-500">
              正在生成中…
            </div>
          )}
        </div>
      </div>

      <ImagePreviewModal
        open={previewState.open}
        imageUrl={previewState.imageUrl}
        title={previewState.title}
        onClose={handleClosePreview}
      />
    </Card>
  );
}
