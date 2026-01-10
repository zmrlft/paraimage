import { useState } from "react";
import { Button, Layout, Menu, Tooltip } from "antd";
import type { MenuProps } from "antd";
import {
  ChevronLeft,
  ChevronRight,
  Github,
  Settings,
} from "lucide-react";

import { models, getModelIconUrl } from "../data/models";
import SettingsModal from "./SettingsModal";
import { layoutCounts, type LayoutCount } from "../types/layout";

type SidebarProps = {
  layoutCount: LayoutCount;
  onLayoutChange: (count: LayoutCount) => void;
};

const repoUrl = "https://github.com/your-org/omniimage";

const modelItems: MenuProps["items"] = models.map((model) => ({
  key: model.value,
  icon: (
    <img
      src={getModelIconUrl(model.iconSlug)}
      alt={`${model.label} logo`}
      className="h-4 w-4 rounded-full object-cover"
      loading="lazy"
    />
  ),
  label: model.label,
}));

const { Sider } = Layout;

export default function Sidebar({ layoutCount, onLayoutChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-sky-500 via-cyan-400 to-emerald-400" />
            {!collapsed && (
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  OmniImage
                </div>
                <div className="text-xs text-slate-500">Workspace Shell</div>
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
            <Menu
              mode="inline"
              inlineCollapsed={collapsed}
              items={modelItems}
              className="bg-transparent"
              style={{ background: "transparent", borderInlineEnd: 0 }}
            />
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
      />
    </Sider>
  );
}
