import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, InputNumber, Modal, Tooltip } from "antd";
import { Check, Crop, Download, Eraser, Images, X } from "lucide-react";

import { processImages, type ProcessImagesAction } from "../api/imageProcessing";
import { saveImages } from "../api/imageSaving";
import type { ModelDefinition, ModelValue } from "../data/models";
import type { ImageManagerItem } from "../types/image";
import ImagePreviewModal from "./ImagePreviewModal";

type ImageManagerModalProps = {
  open: boolean;
  images: ImageManagerItem[];
  initialActiveId?: string | null;
  modelMap: Map<ModelValue, ModelDefinition>;
  onClose: () => void;
};

const actionCopy: Record<ProcessImagesAction, string> = {
  remove_bg: "抠图",
  split: "切割",
};

const buildProcessedLabel = (item: ImageManagerItem) => {
  if (!item.action) {
    return "处理结果";
  }
  if (item.action === "split" && typeof item.index === "number") {
    return `${actionCopy[item.action]} ${item.index + 1}`;
  }
  return actionCopy[item.action];
};

export default function ImageManagerModal({
  open,
  images,
  initialActiveId,
  modelMap,
  onClose,
}: ImageManagerModalProps) {
  const [items, setItems] = useState<ImageManagerItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [splitRows, setSplitRows] = useState(2);
  const [splitCols, setSplitCols] = useState(2);
  const wasOpenRef = useRef(false);
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    imageUrl: string;
    title: string;
  }>({ open: false, imageUrl: "", title: "" });

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = true;
    setItems(images);
    const nextActive =
      (initialActiveId && images.some((item) => item.id === initialActiveId)
        ? initialActiveId
        : images[0]?.id) ?? null;
    setActiveId(nextActive);
    setSelectedIds(nextActive ? new Set([nextActive]) : new Set());
    setActionError(null);
    setSplitMode(false);
  }, [images, initialActiveId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setItems((prev) => {
      const sourceMap = new Map(images.map((item) => [item.id, item]));
      const next = prev.map((item) => sourceMap.get(item.id) ?? item);
      const existingIds = new Set(next.map((item) => item.id));
      images.forEach((item) => {
        if (!existingIds.has(item.id)) {
          next.unshift(item);
        }
      });
      return next;
    });
  }, [images, open]);

  useEffect(() => {
    if (!open || !initialActiveId) {
      return;
    }
    setActiveId(initialActiveId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(initialActiveId);
      return next;
    });
  }, [initialActiveId, open]);

  useEffect(() => {
    if (splitMode && selectedIds.size === 0) {
      setSplitMode(false);
    }
  }, [selectedIds, splitMode]);

  const sourceItems = useMemo(
    () => items.filter((item) => item.origin === "source"),
    [items]
  );
  const processedItems = useMemo(
    () => items.filter((item) => item.origin === "processed"),
    [items]
  );

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) ?? null,
    [items, activeId]
  );

  const selectedCount = selectedIds.size;

  const toggleSelection = useCallback((id: string) => {
    setActiveId(id);
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

  const handleOpenPreview = useCallback(
    (item: ImageManagerItem, label: string) => {
      setActiveId(item.id);
      setPreviewState({
        open: true,
        imageUrl: item.imageUrl,
        title: label,
      });
    },
    []
  );

  const handleClosePreview = useCallback(() => {
    setPreviewState((prev) => ({ ...prev, open: false }));
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((item) => item.id)));
  }, [items]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleProcess = useCallback(
    async (
      action: ProcessImagesAction,
      options?: { rows?: number; cols?: number }
    ) => {
      if (isProcessing || selectedIds.size === 0) {
        return;
      }
      const selectedItems = items.filter((item) => selectedIds.has(item.id));
      if (selectedItems.length === 0) {
        return;
      }
      setIsProcessing(true);
      setActionError(null);
      try {
        const response = await processImages({
          action,
          images: selectedItems.map((item) => ({
            id: item.id,
            imageUrl: item.imageUrl,
          })),
          rows: options?.rows,
          cols: options?.cols,
        });

        if (!response.ok) {
          setActionError(response.error || "处理失败");
          return;
        }

        const parentMap = new Map(items.map((item) => [item.id, item]));
        const batchId = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const now = new Date().toISOString();
        const newItems: ImageManagerItem[] = [];
        let failedCount = 0;

        response.results.forEach((result) => {
          if (result.error || !result.images || result.images.length === 0) {
            failedCount += 1;
            return;
          }
          const parent = parentMap.get(result.id);
          result.images.forEach((imageUrl, index) => {
            newItems.push({
              id: `processed-${action}-${result.id}-${index}-${batchId}`,
              imageUrl,
              origin: "processed",
              action,
              parentId: result.id,
              index,
              modelId: parent?.modelId,
              windowId: parent?.windowId,
              messageId: parent?.messageId,
              createdAt: now,
            });
          });
        });

        if (newItems.length > 0) {
          setItems((prev) => [...newItems, ...prev]);
          setSelectedIds(new Set(newItems.map((item) => item.id)));
          setActiveId(newItems[0].id);
        }

        if (failedCount > 0) {
          setActionError(`有 ${failedCount} 张图片处理失败`);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, items, selectedIds]
  );

  const handleStartSplit = useCallback(() => {
    if (selectedIds.size === 0) {
      return;
    }
    setSplitMode(true);
    setActionError(null);
  }, [selectedIds]);

  const handleConfirmSplit = useCallback(async () => {
    const rows = Math.max(1, splitRows);
    const cols = Math.max(1, splitCols);
    await handleProcess("split", { rows, cols });
    setSplitMode(false);
  }, [handleProcess, splitCols, splitRows]);

  const handleCancelSplit = useCallback(() => {
    setSplitMode(false);
  }, []);

  const downloadFallback = useCallback(
    (selectedItems: ImageManagerItem[]) => {
      selectedItems.forEach((item, index) => {
        const baseName = item.id || `image-${index + 1}`;
        const filename = baseName.includes(".") ? baseName : `${baseName}.png`;
        const link = document.createElement("a");
        link.href = item.imageUrl;
        link.download = filename;
        link.rel = "noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (isSaving || selectedIds.size === 0) {
      return;
    }
    const selectedItems = items.filter((item) => selectedIds.has(item.id));
    if (selectedItems.length === 0) {
      return;
    }
    setIsSaving(true);
    setActionError(null);
    try {
      const response = await saveImages({
        images: selectedItems.map((item) => ({
          id: item.id,
          imageUrl: item.imageUrl,
          filename: item.id,
        })),
      });

      if (!response.ok) {
        if (response.error === "pywebview not available") {
          downloadFallback(selectedItems);
          return;
        }
        setActionError(response.error || "保存失败");
        return;
      }

      const failedCount = response.results.filter((item) => item.error).length;
      if (failedCount > 0) {
        setActionError(`有 ${failedCount} 张图片保存失败`);
      }
    } finally {
      setIsSaving(false);
    }
  }, [downloadFallback, isSaving, items, selectedIds]);

  const splitPreviewStyle = useMemo(() => {
    if (!splitMode) {
      return {};
    }
    const rows = Math.max(1, splitRows);
    const cols = Math.max(1, splitCols);
    const line = "rgba(56, 189, 248, 0.75)";
    return {
      backgroundImage: `repeating-linear-gradient(to right, ${line} 0, ${line} 1px, transparent 1px, transparent calc(100% / ${cols})), repeating-linear-gradient(to bottom, ${line} 0, ${line} 1px, transparent 1px, transparent calc(100% / ${rows}))`,
    } as const;
  }, [splitCols, splitMode, splitRows]);

  const renderItem = useCallback(
    (item: ImageManagerItem) => {
      const isSelected = selectedIds.has(item.id);
      const modelLabel = item.modelId
        ? modelMap.get(item.modelId)?.label ?? "模型"
        : "模型";
      const label =
        item.origin === "processed" ? buildProcessedLabel(item) : modelLabel;
      return (
        <div
          key={item.id}
          className={`group relative overflow-hidden rounded-2xl border text-left transition ${
            isSelected
              ? "border-sky-400 bg-white ring-2 ring-sky-200"
              : "border-slate-100 bg-white hover:border-slate-200"
          }`}
        >
          <button
            type="button"
            onClick={() => handleOpenPreview(item, label)}
            className="block w-full text-left"
          >
            <div className="relative aspect-square w-full overflow-hidden">
              <img
                src={item.imageUrl}
                alt={label}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-slate-900/10 opacity-0 transition group-hover:opacity-100" />
            </div>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleSelection(item.id);
            }}
            className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-white/90 text-slate-500 shadow-sm"
          >
            {isSelected ? (
              <Check size={16} />
            ) : (
              <div className="h-2 w-2 rounded-full border border-slate-300" />
            )}
          </button>
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-full bg-white/90 px-2 py-1 text-[11px] text-slate-600 shadow-sm">
            <span className="truncate">{label}</span>
            {item.origin === "processed" && (
              <span className="text-slate-400">结果</span>
            )}
          </div>
        </div>
      );
    },
    [handleOpenPreview, modelMap, selectedIds, toggleSelection]
  );

  return (
    <Modal
      title="图片管理"
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={1180}
      styles={{ body: { padding: 20, height: 680, overflow: "hidden" } }}
    >
      <div className="flex h-full gap-4">
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Images size={16} />
              <span>
                已选 {selectedCount} / {items.length}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleSelectAll}
                disabled={items.length === 0}
                className="rounded-2xl border-slate-200 text-slate-600"
              >
                全选
              </Button>
              <Button
                onClick={handleClearSelection}
                disabled={selectedIds.size === 0}
                icon={<X size={14} />}
                className="rounded-2xl border-slate-200 text-slate-600"
              >
                清空
              </Button>
              <Button
                type="primary"
                icon={<Eraser size={16} />}
                loading={isProcessing}
                disabled={selectedIds.size === 0}
                onClick={() => {
                  setSplitMode(false);
                  handleProcess("remove_bg");
                }}
                className="rounded-2xl shadow-sm"
              >
                抠图
              </Button>
              <Button
                icon={<Download size={16} />}
                loading={isSaving}
                disabled={selectedIds.size === 0}
                onClick={handleSave}
                className="rounded-2xl border-slate-200 text-slate-600"
              >
                保存到本地
              </Button>
              <Tooltip title="切割会将图片分为多张，建议最后执行">
                <Button
                  type="default"
                  icon={<Crop size={16} />}
                  loading={isProcessing}
                  disabled={selectedIds.size === 0}
                  onClick={handleStartSplit}
                  className="rounded-2xl border-slate-200 text-slate-700 shadow-sm"
                >
                  切割
                </Button>
              </Tooltip>
            </div>
          </div>

          {splitMode && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-xs text-slate-600">
              <div className="text-sm font-semibold text-slate-700">
                切割设置
              </div>
              <div className="flex items-center gap-2">
                <span>行</span>
                <InputNumber
                  min={1}
                  max={8}
                  step={1}
                  precision={0}
                  value={splitRows}
                  onChange={(value) =>
                    setSplitRows(typeof value === "number" ? value : 1)
                  }
                  className="w-20 rounded-xl border-slate-200"
                />
              </div>
              <div className="flex items-center gap-2">
                <span>列</span>
                <InputNumber
                  min={1}
                  max={8}
                  step={1}
                  precision={0}
                  value={splitCols}
                  onChange={(value) =>
                    setSplitCols(typeof value === "number" ? value : 1)
                  }
                  className="w-20 rounded-xl border-slate-200"
                />
              </div>
              <Button
                type="primary"
                loading={isProcessing}
                onClick={handleConfirmSplit}
                className="rounded-2xl shadow-sm"
              >
                确认切割
              </Button>
              <Button
                onClick={handleCancelSplit}
                className="rounded-2xl border-slate-200"
              >
                取消
              </Button>
              <div className="text-slate-400">
                预览线条会显示在右侧预览图
              </div>
            </div>
          )}

          {actionError && (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
              {actionError}
            </div>
          )}

          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                原图 {sourceItems.length}
              </div>
              {sourceItems.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-400">
                  还没有生成图片
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {sourceItems.map(renderItem)}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                处理结果 {processedItems.length}
              </div>
              {processedItems.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-400">
                  暂无处理结果
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {processedItems.map(renderItem)}
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="flex w-80 shrink-0 flex-col gap-3 rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            预览
          </div>
          {activeItem ? (
            <div className="relative">
              <img
                src={activeItem.imageUrl}
                alt="preview"
                className="w-full rounded-2xl border border-slate-100 object-cover shadow-sm"
              />
              {splitMode && (
                <div
                  className="pointer-events-none absolute inset-0 rounded-2xl border border-sky-300/70"
                  style={splitPreviewStyle}
                />
              )}
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
              选择图片查看预览
            </div>
          )}
          <div className="space-y-2 text-xs text-slate-500">
            <div>
              <span className="text-slate-400">来源：</span>
              {activeItem
                ? activeItem.origin === "processed"
                  ? buildProcessedLabel(activeItem)
                  : activeItem.modelId
                    ? modelMap.get(activeItem.modelId)?.label ?? "模型"
                    : "模型"
                : "--"}
            </div>
            <div>
              <span className="text-slate-400">操作：</span>
              {activeItem?.action ? actionCopy[activeItem.action] : "--"}
            </div>
            <div>
              <span className="text-slate-400">时间：</span>
              {activeItem?.createdAt
                ? new Date(activeItem.createdAt).toLocaleString("zh-CN")
                : "--"}
            </div>
          </div>
        </aside>
      </div>

      <ImagePreviewModal
        open={previewState.open}
        imageUrl={previewState.imageUrl}
        title={previewState.title}
        onClose={handleClosePreview}
      />
    </Modal>
  );
}
