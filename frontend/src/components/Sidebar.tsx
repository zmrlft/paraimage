import { useState } from "react";
import { Button, Layout, Menu, Tooltip } from "antd";
import type { MenuProps } from "antd";
import {
  ChevronLeft,
  ChevronRight,
  Github,
  Images,
  Settings,
} from "lucide-react";

import {
  getModelIconUrl,
  getProviderInitial,
  type ModelDefinition,
  type ModelValue,
} from "../data/models";
import SettingsModal from "./SettingsModal";
import { layoutCounts, type LayoutCount } from "../types/layout";

type SidebarProps = {
  layoutCount: LayoutCount;
  onLayoutChange: (count: LayoutCount) => void;
  models: ModelDefinition[];
  onProvidersSaved: () => void;
  onModelSelect?: (modelId: ModelValue) => void;
  onOpenImageManager?: () => void;
};

const repoUrl = "https://github.com/zmrlft/paraimage";

const { Sider } = Layout;

export default function Sidebar({
  layoutCount,
  onLayoutChange,
  models,
  onProvidersSaved,
  onModelSelect,
  onOpenImageManager,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const modelItems: MenuProps["items"] = models.map((model) => ({
    key: model.value,
    icon: model.iconSlug ? (
      <img
        src={getModelIconUrl(model.iconSlug)}
        alt={`${model.label} logo`}
        className="h-4 w-4 rounded-full object-cover"
        loading="lazy"
      />
    ) : (
      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600">
        {getProviderInitial(model.providerName)}
      </div>
    ),
    label: model.label,
  }));

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      trigger={null}
      width={280}
      collapsedWidth={88}
      theme="light"
      style={{ background: "transparent" }}
    >
      <div className="flex h-full flex-col gap-6 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.55)] backdrop-blur">
        <div
          className={
            collapsed
              ? "flex flex-col items-center gap-3"
              : "flex items-center justify-between"
          }
        >
          <div className="flex items-center gap-3">
            <img
              src="/app.png"
              alt="ParaImage logo"
              className="h-11 w-11 rounded-2xl object-cover"
              loading="lazy"
            />
            {!collapsed && (
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  多模生图
                </div>
                <div className="text-xs text-slate-500">ParaImage</div>
              </div>
            )}
          </div>
          <Button
            type="text"
            onClick={() => setCollapsed((prev) => !prev)}
            icon={
              collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />
            }
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          />
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-100 bg-white/80 p-3">
          <div
            className={`text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 ${
              collapsed ? "text-center" : ""
            }`}
          >
            {collapsed ? "Grid" : "Layout"}
          </div>
          <div
            className={`grid gap-2 ${collapsed ? "grid-cols-2" : "grid-cols-4"}`}
          >
            {layoutCounts.map((count) => {
              const isActive = layoutCount === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => onLayoutChange(count)}
                  className={`h-10 rounded-xl text-sm font-semibold transition ${
                    isActive
                      ? "bg-slate-900 text-white shadow-sm !text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  aria-label={`Layout ${count}`}
                >
                  {count}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          {!collapsed && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Models
            </div>
          )}
          <div className="rounded-2xl border border-slate-100 bg-white/80 p-2">
            {models.length ? (
              <Menu
                mode="inline"
                inlineCollapsed={collapsed}
                items={modelItems}
                onClick={(event) =>
                  onModelSelect?.(event.key as ModelValue)
                }
                className="bg-transparent"
                style={{ background: "transparent", borderInlineEnd: 0 }}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400">
                {collapsed ? "--" : "暂无模型"}
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto space-y-3">
          {!collapsed && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Tools
            </div>
          )}
          <div
            className={`rounded-2xl bg-sky-100/70 p-2 ${
              collapsed ? "flex flex-col items-center gap-2" : "flex gap-3"
            }`}
          >
            <Tooltip title="GitHub 仓库">
              <Button
                type="text"
                icon={<Github size={18} />}
                href={repoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-slate-700 shadow-sm transition hover:bg-white"
              />
            </Tooltip>
            <Tooltip title="图片管理">
              <Button
                type="text"
                icon={<Images size={18} />}
                onClick={onOpenImageManager}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-slate-700 shadow-sm transition hover:bg-white"
              />
            </Tooltip>
            <Tooltip title="设置">
              <Button
                type="text"
                icon={<Settings size={18} />}
                onClick={() => setSettingsOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-slate-700 shadow-sm transition hover:bg-white"
              />
            </Tooltip>
          </div>
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onProvidersSaved={onProvidersSaved}
      />
    </Sider>
  );
}
