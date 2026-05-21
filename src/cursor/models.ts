import type { ModelEntry, ModelVariant } from "./types.js";

export type ModelPickerOption = {
  value: string;
  label: string;
  modelId: string;
  params: { id: string; value: string }[];
  isDefault: boolean;
};

export function buildModelPickerOptions(
  catalog: ModelEntry[] | { items: ModelEntry[] }
): ModelPickerOption[] {
  const entries = Array.isArray(catalog) ? catalog : catalog.items;
  const options: ModelPickerOption[] = [];

  for (const entry of entries) {
    if (entry.variants && entry.variants.length > 0) {
      for (const variant of entry.variants) {
        options.push({
          value: serializeModelChoice(entry.id, variant),
          label: variant.displayName || entry.displayName,
          modelId: entry.id,
          params: variant.params,
          isDefault: variant.isDefault === true
        });
      }
      continue;
    }

    options.push({
      value: serializeModelChoice(entry.id, { params: [] }),
      label: entry.displayName,
      modelId: entry.id,
      params: [],
      isDefault: false
    });
  }

  return options;
}

export function serializeModelChoice(
  modelId: string,
  variant: Pick<ModelVariant, "params">
): string {
  return JSON.stringify({ modelId, params: variant.params });
}

export function parseModelChoice(value: string): {
  modelId: string;
  params: { id: string; value: string }[];
} | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const o = parsed as Record<string, unknown>;
    const modelId = typeof o.modelId === "string" ? o.modelId : "";
    if (!modelId) {
      return null;
    }
    const params = Array.isArray(o.params)
      ? o.params
          .map((raw) => {
            if (!raw || typeof raw !== "object") {
              return null;
            }
            const p = raw as Record<string, unknown>;
            const id = typeof p.id === "string" ? p.id : "";
            const val = typeof p.value === "string" ? p.value : "";
            if (!id || !val) {
              return null;
            }
            return { id, value: val };
          })
          .filter((item): item is { id: string; value: string } => item !== null)
      : [];
    return { modelId, params };
  } catch {
    return null;
  }
}

export function defaultModelPickerValue(options: ModelPickerOption[]): string {
  const preferred = options.find((opt) => opt.isDefault);
  return preferred?.value ?? options[0]?.value ?? "";
}
