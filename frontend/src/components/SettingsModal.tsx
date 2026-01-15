import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Menu, Modal, Progress, Select } from "antd";
import type { MenuProps } from "antd";

import {
  chooseSaveDirectory,
  getAppSettings,
  saveAppSettings,
} from "../api/appSettings";
import {
  checkUpdate,
  downloadUpdate,
  getAppInfo,
  getUpdateDownloadProgress,
  openUpdateDirectory,
  type DownloadUpdateResponse,
  type OpenUpdateDirectoryResponse,
  type UpdateDownloadProgress,
  type UpdateCheckResponse,
} from "../api/update";
import {
  getProviderConfigs,
  saveProviderConfig,
} from "../api/settings";
import {
  getModelIconUrl,
  getProviderPreset,
  providerPresets,
} from "../data/models";
import type { ProviderConfig } from "../types/provider";

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
  onProvidersSaved?: () => void;
};

const createPresetConfigs = (): ProviderConfig[] => {
  return providerPresets.map((preset) => ({
    id: preset.providerName,
    providerName: preset.providerName,
    baseUrl: preset.defaultBaseUrl ?? "",
    apiKey: "",
    modelIds: preset.defaultModelIds ? [...preset.defaultModelIds] : [],
    iconSlug: preset.iconSlug,
  }));
};

const settingsMenuItems = [
  { key: "providers", label: "AI 供应商配置" },
  { key: "data", label: "数据与隐私" },
  { key: "about", label: "关于与更新" },
  { key: "experiments", label: "实验功能" },
] satisfies NonNullable<MenuProps["items"]>;

const formatBytes = (value: number) => {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

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

export default function SettingsModal({
  open,
  onClose,
  onProvidersSaved,
}: SettingsModalProps) {
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
  const [appInfo, setAppInfo] = useState<{
    version: string;
    repoUrl: string;
  } | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResponse | null>(
    null
  );
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [updateActionMessage, setUpdateActionMessage] = useState("");
  const [updateActionError, setUpdateActionError] = useState("");
  const [downloadProgress, setDownloadProgress] =
    useState<UpdateDownloadProgress | null>(null);
  const downloadProgressTimerRef = useRef<number | null>(null);
  const availableKeys = useMemo(
    () =>
      new Set(
        settingsMenuItems
          .map((item) => (item ? String(item.key) : ""))
          .filter((key) => key)
      ),
    []
  );

  const updateConfig = useCallback(
    (id: string, patch: Partial<ProviderConfig>) => {
      setProviderConfigs((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const normalizeModelIds = useCallback((modelIds: string[]) => {
    const seen = new Set<string>();
    return modelIds
      .map((value) => value.trim())
      .filter((value) => value)
      .filter((value) => {
        if (seen.has(value)) {
          return false;
        }
        seen.add(value);
        return true;
      });
  }, []);

  const mergeConfigs = useCallback(
    (saved: ProviderConfig[]) => {
      const presetDefaults = createPresetConfigs();
      const presetMap = new Map(
        presetDefaults.map((config) => [config.providerName, config])
      );

      saved.forEach((config) => {
        const preset = presetMap.get(config.providerName);
        if (preset) {
          presetMap.set(config.providerName, {
            ...preset,
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            modelIds: normalizeModelIds(config.modelIds ?? []),
          });
        }
      });

      return [...presetMap.values()];
    },
    [normalizeModelIds]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!availableKeys.has(activeKey)) {
      setActiveKey("providers");
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
          modelIds: config.modelIds ?? [],
        }));
        setProviderConfigs(mergeConfigs(mapped));
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeKey, availableKeys, mergeConfigs, open]);

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
    if (!open) {
      return;
    }
    let active = true;
    getAppInfo()
      .then((info) => {
        if (!active) {
          return;
        }
        setAppInfo(info);
      })
      .catch(() => {
        if (active) {
          setAppInfo(null);
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

  const persistProviders = useCallback(async () => {
    const targets = providerConfigs.filter((config) =>
      config.providerName.trim()
    );
    await Promise.allSettled(
      targets.map((config) =>
        saveProviderConfig({
          providerName: config.providerName.trim(),
          baseUrl: config.baseUrl.trim(),
          apiKey: config.apiKey.trim(),
          modelIds: normalizeModelIds(config.modelIds ?? []),
        })
      )
    );
  }, [normalizeModelIds, providerConfigs]);

  const persistAppSettings = useCallback(async () => {
    const response = await saveAppSettings({
      defaultSaveDir: defaultSaveDir.trim() || null,
    });
    if (response.ok) {
      setDefaultSaveDir(response.defaultSaveDir ?? "");
    }
  }, [defaultSaveDir]);

  const handleSaveAll = useCallback(async () => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    await persistProviders();
    setIsSaving(false);
    onProvidersSaved?.();
  }, [isSaving, onProvidersSaved, persistProviders]);

  const handleSaveData = useCallback(async () => {
    if (isSavingData) {
      return;
    }
    setIsSavingData(true);
    await persistAppSettings();
    setIsSavingData(false);
  }, [isSavingData, persistAppSettings]);

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

  const handleCheckUpdate = useCallback(async () => {
    if (isCheckingUpdate) {
      return;
    }
    setIsCheckingUpdate(true);
    setUpdateActionMessage("");
    setUpdateActionError("");
    const response = await checkUpdate();
    setUpdateInfo(response);
    setIsCheckingUpdate(false);
  }, [isCheckingUpdate]);

  const stopDownloadProgressPolling = useCallback(() => {
    if (downloadProgressTimerRef.current !== null) {
      window.clearInterval(downloadProgressTimerRef.current);
      downloadProgressTimerRef.current = null;
    }
  }, []);

  const startDownloadProgressPolling = useCallback(() => {
    stopDownloadProgressPolling();
    setDownloadProgress({
      ok: true,
      active: true,
      done: false,
      downloaded: 0,
      total: null,
      percent: 0,
      error: null,
    });
    downloadProgressTimerRef.current = window.setInterval(async () => {
      const progress = await getUpdateDownloadProgress();
      if (!progress.ok) {
        return;
      }
      setDownloadProgress(progress);
      if (progress.done || progress.active === false) {
        stopDownloadProgressPolling();
      }
    }, 400);
  }, [stopDownloadProgressPolling]);

  const handleDownloadUpdate = useCallback(async () => {
    if (isDownloadingUpdate) {
      return;
    }
    const assetUrl = updateInfo?.asset?.url;
    if (!assetUrl) {
      return;
    }
    setUpdateActionError("");
    setUpdateActionMessage("正在下载更新...");
    setIsDownloadingUpdate(true);
    startDownloadProgressPolling();
    let downloadResponse: DownloadUpdateResponse | null = null;
    try {
      downloadResponse = await downloadUpdate(assetUrl);
    } finally {
      setIsDownloadingUpdate(false);
      stopDownloadProgressPolling();
    }
    if (!downloadResponse || !downloadResponse.ok || !downloadResponse.path) {
      setUpdateActionMessage("");
      setUpdateActionError(downloadResponse?.error || "下载失败");
      return;
    }
    setUpdateActionMessage("下载完成，正在打开更新目录...");
    const openResponse: OpenUpdateDirectoryResponse =
      await openUpdateDirectory();
    if (!openResponse.ok) {
      const fallbackPath = openResponse.path || downloadResponse.path;
      setUpdateActionMessage(
        fallbackPath
          ? `下载完成，请手动打开目录：${fallbackPath}`
          : "下载完成，请手动打开更新目录"
      );
      setUpdateActionError(openResponse.error || "打开更新目录失败");
      return;
    }
    setUpdateActionMessage(
      openResponse.path
        ? `下载完成，已打开更新目录：${openResponse.path}`
        : "下载完成，已打开更新目录"
    );
  }, [
    isDownloadingUpdate,
    startDownloadProgressPolling,
    stopDownloadProgressPolling,
    updateInfo,
  ]);

  useEffect(() => {
    return () => {
      stopDownloadProgressPolling();
    };
  }, [stopDownloadProgressPolling]);

  const handleAutoSaveClose = useCallback(() => {
    if (isSaving || isSavingData) {
      return;
    }
    const run = async () => {
      setIsSaving(true);
      setIsSavingData(true);
      try {
        await persistProviders();
        await persistAppSettings();
        onProvidersSaved?.();
      } finally {
        setIsSaving(false);
        setIsSavingData(false);
        onClose();
      }
    };
    void run();
  }, [
    isSaving,
    isSavingData,
    onClose,
    onProvidersSaved,
    persistAppSettings,
    persistProviders,
  ]);

  const activeProvider = useMemo(
    () => providerConfigs.find((config) => config.id === activeProviderId),
    [activeProviderId, providerConfigs]
  );

  const providerContent = useMemo(() => {
    const modelOptions = (() => {
      if (!activeProvider) {
        return [];
      }
      const preset = getProviderPreset(activeProvider.providerName);
      const defaults = preset?.defaultModelIds ?? [];
      return defaults.map((modelId) => ({
        label: modelId,
        value: modelId,
      }));
    })();

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
      const label = config.providerName.trim() || "厂商";
      const initial = label.slice(0, 1).toUpperCase() || "?";
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200 text-xs font-semibold text-slate-600">
          {initial}
        </div>
      );
    };

    const activeLabel = activeProvider?.providerName.trim() || "厂商";
    const providerMenuItems: MenuProps["items"] = providerConfigs.map(
      (config) => {
        const isActive = config.id === activeProviderId;
        const label = config.providerName.trim() || "厂商";
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
                内置厂商
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
              选择厂商并配置 API Key、Base URL 与模型型号
            </div>
          </div>
          <div className="flex items-center gap-2">
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
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500">模型厂商</div>
                    <Input
                      value={activeProvider.providerName}
                      disabled
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
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-slate-500">模型型号</div>
                    <Select
                      mode="tags"
                      value={activeProvider.modelIds}
                      onChange={(values) =>
                        updateConfig(activeProvider.id, {
                          modelIds: normalizeModelIds(values as string[]),
                        })
                      }
                      options={modelOptions}
                      tokenSeparators={[",", "，", "\n", "\t", " "]}
                      placeholder="输入模型型号，回车或逗号分隔"
                      className="w-full"
                    />
                    <div className="text-[11px] text-slate-400">
                      同型号来自不同厂商时会区分显示
                    </div>
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
    handleSaveAll,
    isLoading,
    isSaving,
    normalizeModelIds,
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

  const aboutContent = useMemo(() => {
    const currentVersion = appInfo?.version || "未知";
    const repoUrl = appInfo?.repoUrl || "https://github.com/zmrlft/paraimage";
    const updateAvailable =
      updateInfo?.ok && updateInfo.updateAvailable === true;
    const latestVersion =
      updateInfo?.ok && updateInfo.latestVersion
        ? updateInfo.latestVersion
        : "";
    const assetUrl = updateInfo?.asset?.url || "";
    const releaseUrl =
      updateInfo?.ok && updateInfo.releaseUrl
        ? updateInfo.releaseUrl
        : repoUrl;
    const notes = updateInfo?.ok ? updateInfo.notes?.trim() || "" : "";
    const notesPreview =
      notes.length > 600 ? `${notes.slice(0, 600)}...` : notes;
    const actionPending = isDownloadingUpdate;
    const downloadPercent =
      typeof downloadProgress?.percent === "number"
        ? Math.min(100, Math.max(0, downloadProgress.percent))
        : null;
    const downloadSizeText = downloadProgress?.downloaded
      ? `${formatBytes(downloadProgress.downloaded)}${
          downloadProgress.total ? ` / ${formatBytes(downloadProgress.total)}` : ""
        }`
      : "";
    const assetUnavailable = updateAvailable && !assetUrl;

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-base font-semibold text-slate-900">
          关于与更新
        </div>
        <div className="mt-1 text-xs text-slate-500">
          当前版本：{currentVersion}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="primary"
            onClick={handleCheckUpdate}
            loading={isCheckingUpdate}
            className="rounded-xl"
          >
            检查更新
          </Button>
          <Button
            type="default"
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl"
          >
            打开 Release
          </Button>
        </div>

        {updateInfo?.ok === false && (
          <div className="mt-3 text-xs text-rose-500">
            更新检查失败：{updateInfo.error || "未知错误"}
          </div>
        )}

        {updateActionError && (
          <div className="mt-3 text-xs text-rose-500">
            更新操作失败：{updateActionError}
          </div>
        )}

        {updateActionMessage && (
          <div className="mt-3 text-xs text-slate-500">
            {updateActionMessage}
          </div>
        )}

        {isDownloadingUpdate && (
          <div className="mt-3">
            <Progress
              percent={downloadPercent ?? 0}
              status="active"
              showInfo={downloadPercent !== null}
            />
            {downloadSizeText && (
              <div className="mt-1 text-[11px] text-slate-400">
                {downloadSizeText}
              </div>
            )}
          </div>
        )}

        {updateInfo?.ok && (
          <div className="mt-4 space-y-2 text-xs text-slate-500">
            <div>
              最新版本：{latestVersion || "未知"}
              {updateAvailable ? "（可更新）" : "（已是最新）"}
            </div>
            {updateInfo.asset?.name && (
              <div>安装包：{updateInfo.asset.name}</div>
            )}
            {assetUnavailable && (
              <div className="text-amber-600">
                当前系统暂无适配安装包，请在 Release 页面下载。
              </div>
            )}
            {notesPreview && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-slate-600">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Release Notes
                </div>
                <div className="whitespace-pre-wrap text-xs">
                  {notesPreview}
                </div>
              </div>
            )}
            {updateAvailable && assetUrl && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="default"
                  onClick={handleDownloadUpdate}
                  loading={actionPending}
                  disabled={actionPending}
                  className="rounded-xl"
                >
                  下载更新
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }, [
    appInfo,
    handleCheckUpdate,
    handleDownloadUpdate,
    isCheckingUpdate,
    isDownloadingUpdate,
    downloadProgress,
    updateActionError,
    updateActionMessage,
    updateInfo,
  ]);

  return (
    <Modal
      title="设置"
      open={open}
      onCancel={handleAutoSaveClose}
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
              : activeKey === "about"
                ? aboutContent
              : placeholderContent}
        </section>
      </div>
    </Modal>
  );
}
