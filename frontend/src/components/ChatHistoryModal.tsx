import { useCallback, useMemo, useState } from "react";
import { Button, Input, Modal, Tooltip } from "antd";
import { ArrowRight, Search, Trash2 } from "lucide-react";

import type { ModelDefinition, ModelValue } from "../data/models";
import type { ChatSession } from "../types/chat";

type ChatHistoryModalProps = {
  open: boolean;
  modelId: ModelValue | null;
  modelMap: Map<ModelValue, ModelDefinition>;
  sessions: ChatSession[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onContinue: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onClose: () => void;
};

const buildSessionTitle = (title: string) => {
  const trimmed = title.trim();
  if (!trimmed) {
    return "图片对话";
  }
  if (trimmed.length <= 36) {
    return trimmed;
  }
  return `${trimmed.slice(0, 36)}…`;
};

export default function ChatHistoryModal({
  open,
  modelId,
  modelMap,
  sessions,
  selectedSessionId,
  onSelectSession,
  onContinue,
  onDeleteSession,
  onClose,
}: ChatHistoryModalProps) {
  const [keyword, setKeyword] = useState("");

  const filteredSessions = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) {
      return sessions;
    }
    return sessions.filter((session) => {
      const matchTitle = session.title.toLowerCase().includes(query);
      if (matchTitle) {
        return true;
      }
      return session.messages.some((message) =>
        (message.prompt || "").toLowerCase().includes(query)
      );
    });
  }, [keyword, sessions]);

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    []
  );

  const modelLabel = modelId ? modelMap.get(modelId)?.label ?? "模型" : "模型";
  const activeSession = sessions.find(
    (session) => session.id === selectedSessionId
  );

  const handleDeleteSession = useCallback(
    (session: ChatSession) => {
      Modal.confirm({
        title: "删除会话",
        content: `确定删除「${buildSessionTitle(session.title)}」吗？`,
        okText: "删除",
        okType: "danger",
        cancelText: "取消",
        onOk: () => onDeleteSession(session.id),
      });
    },
    [onDeleteSession]
  );

  return (
    <Modal
      title={`${modelLabel} 聊天记录`}
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={1080}
      styles={{ body: { padding: 20, height: 640, overflow: "hidden" } }}
    >
      <div className="flex h-full gap-4">
        <aside className="flex h-full w-64 shrink-0 flex-col">
          <Input
            allowClear
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索历史会话"
            prefix={<Search size={14} className="text-slate-400" />}
            className="rounded-2xl border-slate-200 bg-white/90"
          />
          <div className="mt-3 flex-1 overflow-y-auto pr-2">
            {filteredSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-400">
                还没有历史会话
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredSessions.map((session) => {
                  const isActive = session.id === selectedSessionId;
                  return (
                    <div
                      key={session.id}
                      className={`flex items-start gap-2 rounded-2xl border p-3 transition ${
                        isActive
                          ? "border-slate-200 bg-white shadow-sm"
                          : "border-transparent bg-transparent hover:bg-slate-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectSession(session.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="text-sm font-semibold text-slate-700">
                          {buildSessionTitle(session.title)}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {timeFormatter.format(new Date(session.updatedAt))}
                        </div>
                      </button>
                      <Tooltip title="删除">
                        <Button
                          type="text"
                          size="small"
                          icon={<Trash2 size={14} />}
                          onClick={() => handleDeleteSession(session)}
                          className="text-slate-400 hover:text-rose-500"
                        />
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2">
            {!activeSession ? (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-400">
                选择一个会话查看详情
              </div>
            ) : (
              activeSession.messages.map((message) => {
                if (message.role === "user") {
                  const content = message.prompt || "";
                  return (
                    <div
                      key={message.id}
                      className="rounded-2xl bg-slate-100/80 p-3 text-sm text-slate-700"
                    >
                      <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                        你
                      </div>
                      <div className="mt-2 whitespace-pre-wrap">
                        {content || "已发送参考图"}
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

                const assistantLabel =
                  (message.modelId &&
                    modelMap.get(message.modelId)?.label) ||
                  modelLabel;

                return (
                  <div
                    key={message.id}
                    className="rounded-2xl border border-slate-100 bg-white p-3 text-sm text-slate-700 shadow-sm"
                  >
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      {assistantLabel}
                    </div>
                    {message.error ? (
                      <div className="mt-2 text-sm text-rose-500">
                        {message.error}
                      </div>
                    ) : (
                      message.imageUrl && (
                        <img
                          src={message.imageUrl}
                          alt={`${assistantLabel} output`}
                          className="mt-2 w-full rounded-xl object-cover"
                          loading="lazy"
                        />
                      )
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              type="primary"
              icon={<ArrowRight size={16} />}
              disabled={!activeSession}
              onClick={() =>
                activeSession ? onContinue(activeSession.id) : null
              }
              className="rounded-2xl shadow-sm"
            >
              继续会话
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
