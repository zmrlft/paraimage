import type { ModelValue } from "../data/models";
import type { ImageReference } from "../types/chat";

export type GenerateRequest = {
  prompt: string;
  modelId: ModelValue;
  providerName?: string;
  references: ImageReference[];
  size?: string;
};

export type GenerateResponse = {
  ok: boolean;
  modelId: ModelValue;
  prompt: string;
  imageUrl?: string;
  error?: string;
};

type PyWebviewApi = {
  generate_image: (payload: GenerateRequest) => Promise<GenerateResponse>;
};

const getPywebviewApi = (): PyWebviewApi | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (window as unknown as { pywebview?: { api?: PyWebviewApi } })
    .pywebview?.api;
  return api?.generate_image ? api : null;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const placeholderSvg = (label: string, prompt: string, size = 512) => {
  const palette = ["#0f172a", "#1e293b", "#1f2937", "#1e3a8a"];
  const accent = ["#38bdf8", "#22c55e", "#f97316", "#f43f5e"];
  const index =
    Array.from(label).reduce((total, ch) => total + ch.charCodeAt(0), 0) %
    palette.length;
  const bg = palette[index];
  const fg = accent[index];
  const labelText = escapeXml(label || "model");
  const promptText = escapeXml(prompt || "mock image");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="100%" height="100%" fill="${bg}"/>` +
    `<rect x="24" y="24" width="${size - 48}" height="${size - 48}" rx="24" fill="white" fill-opacity="0.08" stroke="white" stroke-opacity="0.2"/>` +
    `<text x="50%" y="46%" fill="${fg}" font-family="Arial, sans-serif" font-size="26" text-anchor="middle">${labelText}</text>` +
    `<text x="50%" y="56%" fill="white" font-family="Arial, sans-serif" font-size="14" text-anchor="middle">${promptText}</text>` +
    `</svg>`
  );
};

const localGenerate = async (
  payload: GenerateRequest
): Promise<GenerateResponse> => {
  const refCount = payload.references.length;
  const note = refCount > 0 ? `${payload.prompt} · refs ${refCount}` : payload.prompt;
  const svg = placeholderSvg(payload.modelId, note, 512);
  const imageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return {
    ok: true,
    modelId: payload.modelId,
    prompt: payload.prompt,
    imageUrl,
  };
};

export const generateImage = async (
  payload: GenerateRequest
): Promise<GenerateResponse> => {
  const api = getPywebviewApi();
  if (api) {
    return api.generate_image(payload);
  }
  return localGenerate(payload);
};
