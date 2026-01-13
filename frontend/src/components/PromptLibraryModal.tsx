import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Button, Checkbox, Input, Modal, Tabs, Tooltip, message } from "antd";
import { CheckCircle2, Download, Plus, Search, Trash2 } from "lucide-react";

import {
  getPromptLibrary,
  savePromptLibrary,
  type PromptItem,
} from "../api/promptLibrary";

const { TextArea } = Input;

type PromptLibraryModalProps = {
  open: boolean;
  onClose: () => void;
  onUsePrompt: (payload: { content: string }) => void;
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

const extractPromptItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const candidate = (payload as { prompts?: unknown; items?: unknown })
      .prompts ??
      (payload as { prompts?: unknown; items?: unknown }).items;
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
};

const parsePromptLibraryFile = (
  raw: string
): Array<{ title: string; content: string }> => {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = extractPromptItems(payload);
  if (!items.length) {
    return [];
  }
  const parsed: Array<{ title: string; content: string }> = [];
  for (const item of items) {
    if (typeof item === "string") {
      const content = item.trim();
      if (content) {
        parsed.push({
          title: buildTitleFromContent(content),
          content,
        });
      }
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as {
      title?: unknown;
      content?: unknown;
      prompt?: unknown;
      text?: unknown;
    };
    const content =
      (typeof record.content === "string" && record.content) ||
      (typeof record.prompt === "string" && record.prompt) ||
      (typeof record.text === "string" && record.text) ||
      "";
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      continue;
    }
    const title =
      (typeof record.title === "string" && record.title.trim()) ||
      buildTitleFromContent(trimmedContent);
    parsed.push({ title, content: trimmedContent });
  }
  return parsed;
};

const buildPromptSignature = (prompt: { title: string; content: string }) =>
  `${prompt.title.trim().toLowerCase()}::${prompt.content
    .trim()
    .toLowerCase()}`;

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setIsCreating(false);
      setDraftTitle("");
      setDraftContent("");
      setSearchQuery("");
      setSelectedIds(new Set());
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
  const filteredPrompts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return sortedPrompts;
    }
    return sortedPrompts.filter((prompt) => {
      const titleMatch = prompt.title.toLowerCase().includes(query);
      const contentMatch = prompt.content.toLowerCase().includes(query);
      return titleMatch || contentMatch;
    });
  }, [searchQuery, sortedPrompts]);
  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    filteredPrompts.length > 0 &&
    filteredPrompts.every((prompt) => selectedIds.has(prompt.id));

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
      setSelectedIds((prev) => {
        if (!prev.has(id)) {
          return prev;
        }
        const updated = new Set(prev);
        updated.delete(id);
        return updated;
      });
      await persistPrompts(next);
    },
    [persistPrompts, prompts]
  );

  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      const raw = await file.text();
      const imported = parsePromptLibraryFile(raw);
      if (imported.length === 0) {
        message.warning("未在文件中找到可导入的提示词");
        return;
      }
      const now = new Date().toISOString();
      const existingKeys = new Set(
        prompts.map((item) =>
          buildPromptSignature({ title: item.title, content: item.content })
        )
      );
      const nextItems: PromptItem[] = [];
      for (const item of imported) {
        const signature = buildPromptSignature(item);
        if (existingKeys.has(signature)) {
          continue;
        }
        existingKeys.add(signature);
        nextItems.push({
          id: createPromptId(),
          title: item.title,
          content: item.content,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (nextItems.length === 0) {
        message.info("导入的提示词已存在");
        return;
      }
      const next = [...nextItems, ...prompts];
      setPrompts(next);
      await persistPrompts(next);
      message.success(`已导入 ${nextItems.length} 条提示词`);
    },
    [persistPrompts, prompts]
  );

  const handleUsePrompt = useCallback(
    (prompt: PromptItem) => {
      onUsePrompt({ content: prompt.content });
      setSelectedIds(new Set());
    },
    [onUsePrompt]
  );

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    if (filteredPrompts.length === 0) {
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (filteredPrompts.every((prompt) => next.has(prompt.id))) {
        filteredPrompts.forEach((prompt) => next.delete(prompt.id));
        return next;
      }
      filteredPrompts.forEach((prompt) => next.add(prompt.id));
      return next;
    });
  }, [filteredPrompts]);

  const handleBatchUse = useCallback(() => {
    if (selectedIds.size === 0) {
      return;
    }
    const combined = sortedPrompts
      .filter((prompt) => selectedIds.has(prompt.id))
      .map((prompt) => prompt.content.trim())
      .filter(Boolean)
      .join("\n\n");
    if (!combined) {
      return;
    }
    onUsePrompt({ content: combined });
    setSelectedIds(new Set());
  }, [onUsePrompt, selectedIds, sortedPrompts]);

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) {
      return;
    }
    const count = selectedIds.size;
    Modal.confirm({
      title: "批量删除提示词",
      content: `确定删除已选的 ${count} 条提示词吗？`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        const next = prompts.filter((item) => !selectedIds.has(item.id));
        setPrompts(next);
        setSelectedIds(new Set());
        await persistPrompts(next);
        message.success(`已删除 ${count} 条提示词`);
      },
    });
  }, [persistPrompts, prompts, selectedIds]);

  const handleExportPrompts = useCallback(() => {
    if (prompts.length === 0) {
      message.info("暂无可导出的提示词");
      return;
    }
    const payload = {
      version: 1,
      prompts: prompts.map((prompt) => ({
        title: prompt.title,
        content: prompt.content,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "prompt-library.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [prompts]);

  const personalTab = (
    <div className="flex h-full flex-col gap-4">
      <Input
        allowClear
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="搜索提示词标题或内容"
        prefix={<Search size={14} className="text-slate-400" />}
        className="rounded-2xl border-slate-200 bg-white/90"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allVisibleSelected}
            disabled={filteredPrompts.length === 0}
            onChange={handleToggleSelectAll}
          >
            {allVisibleSelected ? "取消全选" : "全选当前"}
          </Checkbox>
          <span>{selectedCount} 已选</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="default"
            size="small"
            icon={<CheckCircle2 size={14} />}
            onClick={handleBatchUse}
            disabled={selectedCount === 0}
            className="rounded-full"
          >
            批量使用
          </Button>
          <Button
            type="default"
            size="small"
            icon={<Trash2 size={14} />}
            onClick={handleBatchDelete}
            disabled={selectedCount === 0}
            className="rounded-full"
          >
            批量删除
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-400">
          正在加载提示词...
        </div>
      ) : sortedPrompts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-400">
          还没有提示词，先创建一个吧。
        </div>
      ) : filteredPrompts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-400">
          没有找到匹配的提示词。
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-3">
            {filteredPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <Checkbox
                    checked={selectedIds.has(prompt.id)}
                    onChange={() => toggleSelection(prompt.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-700">
                      {prompt.title}
                    </div>
                    <div className="mt-1 max-h-16 overflow-hidden whitespace-pre-wrap text-xs text-slate-500">
                      {prompt.content}
                    </div>
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
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          className="hidden"
        />
        <Button
          type="default"
          icon={<Plus size={16} />}
          onClick={() => setIsCreating(true)}
          disabled={isCreating}
          className="rounded-2xl border-slate-200 bg-white/90 text-slate-700 shadow-sm"
        >
          创建提示词
        </Button>
        <Button
          type="default"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-2xl border-slate-200 bg-white/90 text-slate-700 shadow-sm"
        >
          导入提示词
        </Button>
        <Button
          type="default"
          icon={<Download size={16} />}
          onClick={handleExportPrompts}
          className="rounded-2xl border-slate-200 bg-white/90 text-slate-700 shadow-sm"
        >
          导出提示词
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
        className="prompt-library-tabs h-full"
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
