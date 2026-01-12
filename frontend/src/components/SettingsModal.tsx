import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Menu, Modal, Tag } from "antd";
import type { MenuProps } from "antd";
import { Plus } from "lucide-react";

import {
  chooseSaveDirectory,
  getAppSettings,
  saveAppSettings,
} from "../api/appSettings";
import {
  getProviderConfigs,
  saveProviderConfig,
} from "../api/settings";
import { getModelIconUrl, models } from "../data/models";

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

type ProviderConfig = {
  id: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  iconSlug?: string;
  isCustom?: boolean;
};

const createPresetConfigs = (): ProviderConfig[] => {
  const seen = new Set<string>();
  return models.flatMap((model) => {
    if (seen.has(model.provider)) {
      return [];
    }
    seen.add(model.provider);
    return [
      {
        id: model.provider,
        providerName: model.provider,
        baseUrl: model.defaultBaseUrl ?? "",
        apiKey: "",
        iconSlug: model.iconSlug,
        isCustom: false,
      },
    ];
  });
};

const settingsMenuItems: MenuProps["items"] = [
  { key: "providers", label: "AI 供应商配置" },
  { key: "defaults", label: "默认模型" },
  { key: "appearance", label: "界面外观" },
  { key: "shortcuts", label: "快捷键" },
  { key: "data", label: "数据与隐私" },
  { key: "experiments", label: "实验功能" },
];

const placeholderMap: Record<string, { title: string; tips: string[] }> = {
  defaults: {
    title: "默认模型",
    tips: [
      "设置默认模型、默认图像尺寸与采样参数",
      "为不同任务指定默认模型组合",
    ],
  },
  appearance: {
    title: "界面外观",
    tips: ["主题与色彩", "布局密度与字体大小", "卡片阴影与圆角"],
  },
  shortcuts: {
    title: "快捷键",
    tips: ["发送/换行快捷键", "快速切换模型", "一键清空输入"],
  },
  data: {
    title: "数据与隐私",
    tips: ["历史记录保留策略", "本地缓存与导出", "敏感信息遮盖"],
  },
  experiments: {
    title: "实验功能",
    tips: ["多模型并行出图", "提示词优化器", "高级负片模板"],
  },
};

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeKey, setActiveKey] = useState<string>("providers");
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>(
    createPresetConfigs
  );
  const [activeProviderId, setActiveProviderId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [defaultSaveDir, setDefaultSaveDir] = useState<string>("");
  const [isSavingData, setIsSavingData] = useState(false);
  const [isPickingDir, setIsPickingDir] = useState(false);

  const updateConfig = useCallback(
    (id: string, patch: Partial<ProviderConfig>) => {
      setProviderConfigs((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const mergeConfigs = useCallback((saved: ProviderConfig[]) => {
    const presetDefaults = createPresetConfigs();
    const presetMap = new Map(
      presetDefaults.map((config) => [config.providerName, config])
    );
    const customConfigs: ProviderConfig[] = [];

    saved.forEach((config) => {
      const preset = presetMap.get(config.providerName);
      if (preset) {
        presetMap.set(config.providerName, {
          ...preset,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
        });
      } else if (config.providerName.trim()) {
        customConfigs.push({
          id: config.id || config.providerName,
          providerName: config.providerName,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          isCustom: true,
        });
      }
    });

    return [...presetMap.values(), ...customConfigs];
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    setIsLoading(true);
    getProviderConfigs()
      .then((configs) => {
        if (!active) {
          return;
        }
        const mapped = configs.map((config) => ({
          id: config.providerName,
          providerName: config.providerName,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
        }));
        setProviderConfigs((prev) => mergeConfigs(mapped));
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mergeConfigs, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    getAppSettings()
      .then((settings) => {
        if (!active) {
          return;
        }
        setDefaultSaveDir(settings.defaultSaveDir ?? "");
      })
      .catch(() => {
        if (active) {
          setDefaultSaveDir("");
        }
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!providerConfigs.length) {
      setActiveProviderId("");
      return;
    }
    setActiveProviderId((prev) =>
      providerConfigs.some((config) => config.id === prev)
        ? prev
        : providerConfigs[0].id
    );
  }, [providerConfigs]);

  const handleSaveAll = useCallback(async () => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    const targets = providerConfigs.filter((config) =>
      config.providerName.trim()
    );
    await Promise.allSettled(
      targets.map((config) =>
        saveProviderConfig({
          providerName: config.providerName.trim(),
          baseUrl: config.baseUrl.trim(),
          apiKey: config.apiKey.trim(),
        })
      )
    );
    setIsSaving(false);
  }, [isSaving, providerConfigs]);

  const handleAddProvider = useCallback(() => {
    const id = `custom-${Date.now()}`;
    const next: ProviderConfig = {
      id,
      providerName: "",
      baseUrl: "",
      apiKey: "",
      isCustom: true,
    };
    setProviderConfigs((prev) => [...prev, next]);
    setActiveProviderId(id);
  }, []);

  const handleSaveData = useCallback(async () => {
    if (isSavingData) {
      return;
    }
    setIsSavingData(true);
    const response = await saveAppSettings({
      defaultSaveDir: defaultSaveDir.trim() || null,
    });
    if (response.ok) {
      setDefaultSaveDir(response.defaultSaveDir ?? "");
    }
    setIsSavingData(false);
  }, [defaultSaveDir, isSavingData]);

  const handlePickDirectory = useCallback(async () => {
    if (isPickingDir) {
      return;
    }
    setIsPickingDir(true);
    const response = await chooseSaveDirectory();
    if (response.ok && response.directory) {
      setDefaultSaveDir(response.directory);
      await saveAppSettings({ defaultSaveDir: response.directory });
    }
    setIsPickingDir(false);
  }, [isPickingDir]);

  const activeProvider = useMemo(
    () => providerConfigs.find((config) => config.id === activeProviderId),
    [activeProviderId, providerConfigs]
  );

  const providerContent = useMemo(() => {
    const renderProviderIcon = (config: ProviderConfig) => {
      if (config.iconSlug) {
        return (
          <img
            src={getModelIconUrl(config.iconSlug)}
            alt={`${config.providerName} logo`}
            className="h-8 w-8 rounded-xl object-cover"
            loading="lazy"
          />
        );
      }
      const label = config.providerName.trim() || "自定义厂商";
      const initial = label.slice(0, 1).toUpperCase() || "?";
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200 text-xs font-semibold text-slate-600">
          {initial}
        </div>
      );
    };

    const activeLabel = activeProvider?.providerName.trim() || "自定义厂商";
    const providerMenuItems: MenuProps["items"] = providerConfigs.map(
      (config) => {
        const isActive = config.id === activeProviderId;
        const label = config.providerName.trim() || "自定义厂商";
        return {
          key: config.id,
          icon: renderProviderIcon(config),
          label: (
            <div className="min-w-0">
              <div
                className={`break-words text-sm font-semibold leading-snug ${
                  isActive ? "text-current" : "text-slate-900"
                }`}
              >
                {label}
              </div>
              <div
                className={`text-[11px] ${
                  isActive ? "text-current opacity-70" : "text-slate-500"
                }`}
              >
                {config.isCustom ? "自定义厂商" : "内置厂商"}
              </div>
            </div>
          ),
        };
      }
    );

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">
              AI 供应商配置
            </div>
            <div className="text-xs text-slate-500">
              选择厂商并配置 API Key 与 Base URL
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="default"
              onClick={handleAddProvider}
              icon={<Plus size={16} />}
              className="rounded-xl"
            >
              添加厂商
            </Button>
            <Button
              type="default"
              onClick={handleSaveAll}
              loading={isSaving}
              className="rounded-xl"
            >
              保存配置
            </Button>
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 gap-4">
          <aside className="w-56 shrink-0">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                厂商列表
              </div>
              <div className="mt-3 max-h-[420px] overflow-y-auto pr-1">
                {providerConfigs.length ? (
                  <Menu
                    mode="inline"
                    items={providerMenuItems}
                    selectedKeys={activeProviderId ? [activeProviderId] : []}
                    onClick={({ key }) => setActiveProviderId(String(key))}
                    className="provider-menu bg-transparent"
                    style={{ background: "transparent", borderInlineEnd: 0 }}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400">
                    暂无厂商配置
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-1 flex-col">
            {isLoading && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-sm text-slate-400">
                正在加载配置…
              </div>
            )}
            {!isLoading && !activeProvider && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-sm text-slate-400">
                请选择一个厂商查看配置
              </div>
            )}
            {!isLoading && activeProvider && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  {renderProviderIcon(activeProvider)}
                  <div className="text-base font-semibold text-slate-900">
                    {activeLabel}
                  </div>
                  <Tag color={activeProvider.isCustom ? "cyan" : "blue"}>
                    {activeProvider.isCustom ? "自定义" : "内置"}
                  </Tag>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500">模型厂商</div>
                    <Input
                      value={activeProvider.providerName}
                      onChange={(event) =>
                        updateConfig(activeProvider.id, {
                          providerName: event.target.value,
                        })
                      }
                      disabled={!activeProvider.isCustom}
                      placeholder="输入自定义厂商名称"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500">Base URL</div>
                    <Input
                      value={activeProvider.baseUrl}
                      onChange={(event) =>
                        updateConfig(activeProvider.id, {
                          baseUrl: event.target.value,
                        })
                      }
                      placeholder="https://api.example.com/v1"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-slate-500">API Key</div>
                    <Input.Password
                      value={activeProvider.apiKey}
                      onChange={(event) =>
                        updateConfig(activeProvider.id, {
                          apiKey: event.target.value,
                        })
                      }
                      placeholder="填写密钥后会加密存储"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }, [
    activeProvider,
    activeProviderId,
    handleAddProvider,
    handleSaveAll,
    isLoading,
    isSaving,
    providerConfigs,
    updateConfig,
  ]);

  const placeholderContent = useMemo(() => {
    const fallback = placeholderMap[activeKey];
    if (!fallback) {
      return null;
    }
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <div className="text-base font-semibold text-slate-900">
          {fallback.title}
        </div>
        <div className="mt-2 space-y-2">
          {fallback.tips.map((tip) => (
            <div key={tip}>• {tip}</div>
          ))}
        </div>
      </div>
    );
  }, [activeKey]);

  const dataContent = useMemo(() => {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-base font-semibold text-slate-900">
          数据与隐私
        </div>
        <div className="mt-1 text-xs text-slate-500">
          设置图片默认保存路径，未设置时首次保存会弹出系统目录选择。
        </div>
        <div className="mt-4 space-y-3">
          <div className="text-xs text-slate-500">图片默认保存路径</div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={defaultSaveDir}
              onChange={(event) => setDefaultSaveDir(event.target.value)}
              placeholder="未设置时会在首次保存时弹出选择"
              className="min-w-[320px] flex-1"
            />
            <Button
              type="default"
              onClick={handlePickDirectory}
              loading={isPickingDir}
              className="rounded-xl"
            >
              选择目录
            </Button>
            <Button
              type="primary"
              onClick={handleSaveData}
              loading={isSavingData}
              className="rounded-xl"
            >
              保存
            </Button>
          </div>
          <div className="text-xs text-slate-400">
            默认保存路径为空时，保存图片会先弹出系统文件夹选择。
          </div>
        </div>
      </div>
    );
  }, [
    defaultSaveDir,
    handlePickDirectory,
    handleSaveData,
    isPickingDir,
    isSavingData,
  ]);

  return (
    <Modal
      title="设置"
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={980}
      styles={{ body: { padding: 20 } }}
    >
      <div className="flex min-h-[520px] gap-4">
        <aside className="w-48 shrink-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Settings
          </div>
          <Menu
            mode="inline"
            items={settingsMenuItems}
            selectedKeys={[activeKey]}
            onClick={({ key }) => setActiveKey(key)}
            className="mt-2 rounded-2xl border border-slate-100 bg-white/80 p-2"
            style={{ background: "rgba(255,255,255,0.8)", borderInlineEnd: 0 }}
          />
        </aside>
        <section className="flex min-h-0 flex-1 flex-col">
          {activeKey === "providers"
            ? providerContent
            : activeKey === "data"
              ? dataContent
              : placeholderContent}
        </section>
      </div>
    </Modal>
  );
}
