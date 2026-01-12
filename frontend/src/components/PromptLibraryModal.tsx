import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Tabs, Tooltip } from "antd";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";

import {
  getPromptLibrary,
  savePromptLibrary,
  type PromptItem,
} from "../api/promptLibrary";

const { TextArea } = Input;

type PromptLibraryModalProps = {
  open: boolean;
  onClose: () => void;
  onUsePrompt: (prompt: PromptItem) => void;
};

const createPromptId = () =>
  `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const buildTitleFromContent = (content: string) => {
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "未命名提示词";
  }
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
};

export default function PromptLibraryModal({
  open,
  onClose,
  onUsePrompt,
}: PromptLibraryModalProps) {
  const [activeTab, setActiveTab] = useState("personal");
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  useEffect(() => {
    if (!open) {
      setIsCreating(false);
      setDraftTitle("");
      setDraftContent("");
      return;
    }
    let active = true;
    setIsLoading(true);
    getPromptLibrary()
      .then((items) => {
        if (!active) {
          return;
        }
        setPrompts(items);
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open]);

  const sortedPrompts = useMemo(
    () =>
      [...prompts].sort((a, b) =>
        (b.updatedAt || "").localeCompare(a.updatedAt || "")
      ),
    [prompts]
  );

  const persistPrompts = useCallback(async (items: PromptItem[]) => {
    setIsSaving(true);
    try {
      await savePromptLibrary(items);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    const content = draftContent.trim();
    if (!content) {
      return;
    }
    const now = new Date().toISOString();
    const title = draftTitle.trim() || buildTitleFromContent(content);
    const nextPrompt: PromptItem = {
      id: createPromptId(),
      title,
      content,
      createdAt: now,
      updatedAt: now,
    };
    const next = [nextPrompt, ...prompts];
    setPrompts(next);
    setDraftTitle("");
    setDraftContent("");
    setIsCreating(false);
    await persistPrompts(next);
  }, [draftContent, draftTitle, persistPrompts, prompts]);

  const handleDelete = useCallback(
    async (id: string) => {
      const next = prompts.filter((item) => item.id !== id);
      setPrompts(next);
      await persistPrompts(next);
    },
    [persistPrompts, prompts]
  );

  const handleUsePrompt = useCallback(
    (prompt: PromptItem) => {
      onUsePrompt(prompt);
    },
    [onUsePrompt]
  );

  const personalTab = (
    <div className="flex h-full flex-col gap-4">
      {isLoading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-400">
          正在加载提示词...
        </div>
      ) : sortedPrompts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-400">
          还没有提示词，先创建一个吧。
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-3">
          {sortedPrompts.map((prompt) => (
            <div
              key={prompt.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-700">
                  {prompt.title}
                </div>
                <div className="mt-1 max-h-16 overflow-hidden whitespace-pre-wrap text-xs text-slate-500">
                  {prompt.content}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip title="使用">
                  <Button
                    type="text"
                    icon={<CheckCircle2 size={16} />}
                    onClick={() => handleUsePrompt(prompt)}
                    className="rounded-full text-slate-600 hover:text-slate-900"
                  />
                </Tooltip>
                <Tooltip title="删除">
                  <Button
                    type="text"
                    icon={<Trash2 size={16} />}
                    onClick={() => handleDelete(prompt.id)}
                    className="rounded-full text-slate-600 hover:text-rose-500"
                  />
                </Tooltip>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="default"
          icon={<Plus size={16} />}
          onClick={() => setIsCreating(true)}
          disabled={isCreating}
          className="rounded-2xl border-slate-200 bg-white/90 text-slate-700 shadow-sm"
        >
          创建提示词
        </Button>
        {isSaving && (
          <span className="text-xs text-slate-400">正在保存...</span>
        )}
      </div>

      {isCreating && (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            新提示词
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <Input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="提示词标题（可选）"
              className="rounded-2xl border-slate-200 bg-white/90"
            />
            <TextArea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              placeholder="写下你的提示词内容"
              autoSize={{ minRows: 3, maxRows: 6 }}
              className="rounded-2xl border-slate-200 bg-white/90 text-sm"
            />
            <div className="flex items-center gap-2">
              <Button
                type="primary"
                onClick={handleCreate}
                disabled={!draftContent.trim()}
                className="rounded-2xl shadow-sm"
              >
                保存提示词
              </Button>
              <Button
                type="text"
                onClick={() => {
                  setIsCreating(false);
                  setDraftTitle("");
                  setDraftContent("");
                }}
                className="rounded-2xl text-slate-500"
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const communityTab = (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-400">
      提示词社区正在建设中。
    </div>
  );

  return (
    <Modal
      title="提示词库"
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={920}
      styles={{ body: { padding: 20, height: 520, overflow: "hidden" } }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "personal",
            label: "你的提示词",
            children: personalTab,
          },
          {
            key: "community",
            label: "提示词社区",
            children: communityTab,
          },
        ]}
      />
    </Modal>
  );
}
