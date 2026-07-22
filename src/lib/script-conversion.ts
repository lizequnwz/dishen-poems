import OpenCC from 'opencc-js';
import type { DisplayScript } from './preferences';

export type OriginalScript = 'simplified' | 'traditional';
export type TextVariant = 'original' | DisplayScript;
export type ScriptOverrides = {
  simplified: Record<string, string>;
  traditional: Record<string, string>;
};

const simplifiedToTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });
const traditionalToSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });

function applyOverrides(text: string, overrides: Record<string, string>) {
  return Object.entries(overrides)
    .sort(([a], [b]) => b.length - a.length)
    .reduce((result, [source, replacement]) => result.split(source).join(replacement), text);
}

export function deriveTextVariants(
  source: string,
  originalScript: OriginalScript,
  overrides: ScriptOverrides = { simplified: {}, traditional: {} },
): Record<TextVariant, string> {
  const original = source.replace(/\r\n/g, '\n').trim();
  const simplified = originalScript === 'simplified' ? original : traditionalToSimplified(original);
  const traditional = originalScript === 'traditional' ? original : simplifiedToTraditional(original);

  return {
    original,
    simplified: applyOverrides(simplified, overrides.simplified),
    traditional: applyOverrides(traditional, overrides.traditional),
  };
}
