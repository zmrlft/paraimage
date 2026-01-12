import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { Button, Input, Tooltip, Upload } from "antd";
import type { UploadFile, UploadProps } from "antd";
import { BookOpen, Copy, ImagePlus, Send, Trash2 } from "lucide-react";

import PromptLibraryModal from "./PromptLibraryModal";
import "./InputComposer.css";

const { TextArea } = Input;

const isImageFile = (file: File) => file.type.startsWith("image/");

type InputComposerProps = {
  onSend?: (payload: { prompt: string; files: File[] }) => Promise<void> | void;
  onClearChats?: () => void;
  sending?: boolean;
};

export default function InputComposer({
  onSend,
  onClearChats,
  sending = false,
}: InputComposerProps) {
  const [message, setMessage] = useState("");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
  const objectUrlMap = useRef(new Map<string, string>());

  const dropzoneClasses = useMemo(() => {
    return [
      "composer-dropzone",
      "rounded-2xl",
      "border",
      "p-2",
      "transition",
      isDragging
        ? "border-sky-400/80 bg-sky-50/70 ring-1 ring-sky-200"
        : "border-slate-200 bg-white",
    ].join(" ");
  }, [isDragging]);

  const revokeObjectUrl = useCallback((file: UploadFile) => {
    const url = objectUrlMap.current.get(file.uid);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrlMap.current.delete(file.uid);
    }
  }, []);

  const appendFiles = useCallback((files: File[]) => {
    const nextItems = files.filter(isImageFile).map((file) => {
      const uid = `${file.name}-${file.size}-${
        file.lastModified
      }-${Math.random().toString(36).slice(2)}`;
      const url = URL.createObjectURL(file);
      objectUrlMap.current.set(uid, url);
      return {
        uid,
        name: file.name,
        status: "done" as const,
        originFileObj: file,
        url,
        thumbUrl: url,
      };
    });

    if (nextItems.length === 0) {
      return;
    }

    setFileList((prev) => [...prev, ...nextItems]);
  }, []);

  const handleBeforeUpload: UploadProps["beforeUpload"] = (file) => {
    appendFiles([file]);
    return false;
  };

  const handleRemove: UploadProps["onRemove"] = (file) => {
    revokeObjectUrl(file);
    setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
    return true;
  };

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardFiles = Array.from(event.clipboardData.items)
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

      if (clipboardFiles.length === 0) {
        return;
      }

      const hasText = event.clipboardData.getData("text/plain").length > 0;
      if (!hasText) {
        event.preventDefault();
      }

      appendFiles(clipboardFiles);
    },
    [appendFiles]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(event.dataTransfer.files).filter(
        isImageFile
      );
      appendFiles(droppedFiles);
    },
    [appendFiles]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClear = useCallback(() => {
    objectUrlMap.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlMap.current.clear();
    setFileList([]);
    setMessage("");
    onClearChats?.();
  }, [onClearChats]);

  const handleCopy = useCallback(async () => {
    if (!message.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // Best-effort clipboard write; ignore failures.
    }
  }, [message]);

  const handleSend = useCallback(async () => {
    if (isSending || sending) {
      return;
    }
    const trimmed = message.trim();
    const files = fileList
      .map((item) => item.originFileObj)
      .filter((file): file is File => Boolean(file));
    if (!trimmed && files.length === 0) {
      return;
    }

    if (!onSend) {
      return;
    }

    setIsSending(true);
    try {
      await onSend({ prompt: trimmed, files });
      objectUrlMap.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlMap.current.clear();
      setFileList([]);
      setMessage("");
    } finally {
      setIsSending(false);
    }
  }, [fileList, isSending, message, onSend, sending]);

  const handleOpenPromptLibrary = useCallback(() => {
    setPromptLibraryOpen(true);
  }, []);

  const handleClosePromptLibrary = useCallback(() => {
    setPromptLibraryOpen(false);
  }, []);

  const handleUsePrompt = useCallback((prompt: { content: string }) => {
    setMessage(prompt.content);
    setPromptLibraryOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      objectUrlMap.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlMap.current.clear();
    };
  }, []);

  return (
    <div className="input-composer rounded-3xl bg-white/80 p-3 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.55)] backdrop-blur">
      <div
        className={dropzoneClasses}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex flex-wrap items-stretch gap-3">
          <TextArea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onPaste={handlePaste}
            variant="borderless"
            placeholder="写下你的需求，支持拖拽/粘贴图片…"
            autoSize={{ minRows: 2, maxRows: 4 }}
            className="flex-1 text-sm"
          />
          <Upload
            listType="picture-card"
            fileList={fileList}
            multiple
            accept="image/*"
            beforeUpload={handleBeforeUpload}
            onRemove={handleRemove}
            className="composer-upload"
            showUploadList={{ showPreviewIcon: false }}
          >
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] text-slate-500">
              <ImagePlus size={16} />
              <span>添加图片</span>
            </div>
          </Upload>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Button
          type="default"
          icon={<BookOpen size={16} />}
          onClick={handleOpenPromptLibrary}
          className="rounded-2xl border-slate-200 bg-white/90 text-slate-700 shadow-sm"
        >
          提示词库
        </Button>
        <div className="flex items-center gap-2">
          <Tooltip title="复制">
            <Button
              type="text"
              icon={<Copy size={16} />}
              onClick={handleCopy}
              className="rounded-2xl text-slate-600 hover:text-slate-900"
            />
          </Tooltip>
          <Tooltip title="清空所有模型会话">
            <Button
              type="text"
              icon={<Trash2 size={16} />}
              onClick={handleClear}
              className="rounded-2xl text-slate-600 hover:text-slate-900"
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<Send size={16} />}
            onClick={handleSend}
            loading={isSending || sending}
            disabled={
              isSending ||
              sending ||
              (message.trim().length === 0 && fileList.length === 0)
            }
            className="rounded-2xl shadow-sm"
          >
            发送
          </Button>
        </div>
      </div>

      <PromptLibraryModal
        open={promptLibraryOpen}
        onClose={handleClosePromptLibrary}
        onUsePrompt={handleUsePrompt}
      />
    </div>
  );
}
