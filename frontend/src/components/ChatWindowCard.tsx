import { useCallback, useMemo } from "react";
import { Button, Card, Select, Space, Tooltip } from "antd";
import { Copy, History, Share2, Trash2 } from "lucide-react";

import {
  getModelIconUrl,
  modelMap,
  models,
  type ModelValue,
} from "../data/models";
import type { ChatMessage } from "../types/chat";

type ChatWindowCardProps = {
  model: ModelValue;
  onModelChange: (model: ModelValue) => void;
  messages: ChatMessage[];
  isGenerating: boolean;
  onOpenHistory?: () => void;
};

export default function ChatWindowCard({
  model,
  onModelChange,
  messages,
  isGenerating,
  onOpenHistory,
}: ChatWindowCardProps) {
  const copyToClipboard = useCallback(async (text: string) => {
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
  const selectOptions = useMemo(
    () =>
      models.map((item) => ({
        value: item.value,
        label: (
          <div className="flex items-center gap-2">
            <img
              src={getModelIconUrl(item.iconSlug)}
              alt={`${item.label} logo`}
              className="h-5 w-5 rounded-full object-cover"
              loading="lazy"
            />
            <span>{item.label}</span>
          </div>
        ),
      })),
    []
  );
  const activeModel = modelMap.get(model);
  const activeModelIcon = activeModel
    ? getModelIconUrl(activeModel.iconSlug)
    : null;

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
          {activeModelIcon && (
            <img
              src={activeModelIcon}
              alt={`${activeModel?.label ?? "model"} logo`}
              className="h-6 w-6 rounded-full object-cover"
              loading="lazy"
            />
          )}
          <Select
            value={model}
            onChange={(value) => onModelChange(value as ModelValue)}
            options={selectOptions}
            size="large"
            className="min-w-40"
            popupMatchSelectWidth={200}
            variant={"borderless"}
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
              return (
                <div
                  key={message.id}
                  className="rounded-2xl bg-slate-100/80 p-3 text-sm text-slate-700"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      你
                    </div>
                    <Tooltip title="复制内容">
                      <Button
                        type="text"
                        size="small"
                        icon={<Copy size={14} />}
                        onClick={() => copyToClipboard(content)}
                        disabled={!content}
                        className="text-slate-400 hover:text-slate-600"
                      />
                    </Tooltip>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap">
                    {message.prompt || "已发送参考图"}
                  </div>
                  {message.references && message.references.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.references.map((ref) => (
                        <img
                          key={`${message.id}-${ref.name}`}
                          src={ref.dataUrl}
                          alt={ref.name}
                          className="h-16 w-16 rounded-xl object-cover"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const modelLabel =
              (message.modelId && modelMap.get(message.modelId)?.label) ||
              activeModel?.label ||
              "模型";
            const assistantContent =
              message.error || message.imageUrl || "";

            return (
              <div
                key={message.id}
                className="rounded-2xl border border-slate-100 bg-white p-3 text-sm text-slate-700 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    {modelLabel}
                  </div>
                  <Tooltip
                    title={message.error ? "复制错误" : "复制图片链接"}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<Copy size={14} />}
                      onClick={() => copyToClipboard(assistantContent)}
                      disabled={!assistantContent}
                      className="text-slate-400 hover:text-slate-600"
                    />
                  </Tooltip>
                </div>
                {message.error ? (
                  <div className="mt-2 text-sm text-rose-500">
                    {message.error}
                  </div>
                ) : (
                  message.imageUrl && (
                    <img
                      src={message.imageUrl}
                      alt={`${modelLabel} output`}
                      className="mt-2 w-full rounded-xl object-cover"
                      loading="lazy"
                    />
                  )
                )}
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
    </Card>
  );
}
