export const visualPalettes = ['spring', 'jade', 'rain', 'storm', 'winter', 'moonlit', 'paper', 'saffron', 'lapis'] as const;
export const visualSceneFamilies = ['landscape', 'courtyard', 'scroll', 'celestial'] as const;
export const visualMotifs = [
  'mountain',
  'water',
  'mist',
  'rain',
  'snow',
  'flora',
  'moon',
  'sun',
  'wind',
  'brush',
  'lightning',
  'enso',
  'moon-gate',
  'lattice',
  'bamboo',
  'bird',
  'lantern',
  'lotus-ripple',
  'bell-ripple',
  'sutra-thread',
] as const;
export const visualCompositions = [
  'open-left',
  'open-right',
  'vertical-ridge',
  'split-field',
  'diagonal-flow',
  'moon-gate',
  'hanging-scroll',
  'courtyard-window',
  'open-horizon',
  'triptych',
] as const;
export const visualLights = ['dawn', 'day', 'dusk', 'night'] as const;
export const visualIntensities = ['quiet', 'balanced', 'dramatic'] as const;

export type VisualPalette = (typeof visualPalettes)[number];
export type VisualSceneFamily = (typeof visualSceneFamilies)[number];
export type VisualMotif = (typeof visualMotifs)[number];
export type VisualComposition = (typeof visualCompositions)[number];
export type VisualLight = (typeof visualLights)[number];
export type VisualIntensity = (typeof visualIntensities)[number];

export interface VisualProfile {
  sceneFamily?: VisualSceneFamily;
  palette?: VisualPalette;
  motifs?: VisualMotif[];
  composition?: VisualComposition;
  light?: VisualLight;
  intensity?: VisualIntensity;
}

export interface VisualSignals {
  motifs: VisualMotif[];
  matchedTerms: string[];
}

export interface ResolvedVisualProfile {
  sceneFamily: VisualSceneFamily;
  palette: VisualPalette;
  motifs: VisualMotif[];
  composition: VisualComposition;
  light: VisualLight;
  intensity: VisualIntensity;
  signals: VisualSignals;
}

const signalTerms: Array<[VisualMotif, string[]]> = [
  ['mountain', ['山', '峰', '岭', '崖']],
  ['water', ['水', '溪', '河', '海', '泉', '浪']],
  ['mist', ['雾', '云', '霭', '烟']],
  ['rain', ['雨', '泼', '淋']],
  ['snow', ['雪', '霜', '冰']],
  ['flora', ['花', '叶', '松', '桂', '草', '枝']],
  ['moon', ['月', '夜']],
  ['sun', ['日', '太阳', '斜阳', '光']],
  ['wind', ['风']],
  ['brush', ['笔', '墨', '写', '文章']],
  ['lightning', ['雷', '电']],
  ['enso', ['圆相', '圆融', '圆满']],
  ['moon-gate', ['门', '院', '庭']],
  ['lattice', ['窗', '格']],
  ['bamboo', ['竹', '箫']],
  ['bird', ['鸟', '莺', '鹤', '鸥']],
  ['lantern', ['灯', '烛', '火']],
  ['lotus-ripple', ['莲', '荷']],
  ['bell-ripple', ['钟', '磬', '音', '鸣']],
  ['sutra-thread', ['经', '卷', '偈', '书']],
];

const monthDefaults: Record<number, Pick<ResolvedVisualProfile, 'palette' | 'light' | 'intensity'>> = {
  1: { palette: 'winter', light: 'dawn', intensity: 'quiet' },
  2: { palette: 'winter', light: 'dawn', intensity: 'quiet' },
  3: { palette: 'spring', light: 'dawn', intensity: 'balanced' },
  4: { palette: 'spring', light: 'day', intensity: 'balanced' },
  5: { palette: 'jade', light: 'day', intensity: 'balanced' },
  6: { palette: 'rain', light: 'day', intensity: 'balanced' },
  7: { palette: 'rain', light: 'dusk', intensity: 'dramatic' },
  8: { palette: 'storm', light: 'dusk', intensity: 'dramatic' },
  9: { palette: 'jade', light: 'dusk', intensity: 'balanced' },
  10: { palette: 'paper', light: 'dusk', intensity: 'quiet' },
  11: { palette: 'moonlit', light: 'night', intensity: 'quiet' },
  12: { palette: 'winter', light: 'night', intensity: 'quiet' },
};

const familyMotifs: Record<VisualSceneFamily, VisualMotif[]> = {
  landscape: ['mountain', 'water', 'mist', 'flora'],
  courtyard: ['moon-gate', 'lattice', 'bamboo', 'bird'],
  scroll: ['sutra-thread', 'brush', 'enso'],
  celestial: ['moon', 'sun', 'lantern', 'bell-ripple'],
};

const familyCompositions: Record<VisualSceneFamily, VisualComposition[]> = {
  landscape: ['open-left', 'open-right', 'vertical-ridge', 'open-horizon'],
  courtyard: ['moon-gate', 'courtyard-window', 'split-field'],
  scroll: ['hanging-scroll', 'triptych', 'diagonal-flow'],
  celestial: ['open-horizon', 'triptych', 'diagonal-flow'],
};

const showcaseFamilies: VisualSceneFamily[] = ['landscape', 'courtyard', 'scroll', 'celestial', 'landscape'];
const showcaseCompositions: VisualComposition[] = ['open-horizon', 'moon-gate', 'hanging-scroll', 'triptych', 'courtyard-window'];

function stableNumber(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function detectVisualSignals(text: string): VisualSignals {
  const motifs: VisualMotif[] = [];
  const matchedTerms: string[] = [];
  for (const [motif, terms] of signalTerms) {
    const matches = terms.filter((term) => text.includes(term));
    if (!matches.length) continue;
    motifs.push(motif);
    matchedTerms.push(...matches);
  }
  return { motifs, matchedTerms };
}

export function resolveVisualProfile(input: {
  id: string;
  writtenDate: string;
  title: string;
  body: string;
  profile?: VisualProfile;
}): ResolvedVisualProfile {
  const month = Number(input.writtenDate.slice(5, 7));
  const defaults = monthDefaults[month] ?? monthDefaults[10];
  const signals = detectVisualSignals(`${input.title}\n${input.body}`);
  const seed = stableNumber(input.id);
  const inferredMotifs = signals.motifs.length ? signals.motifs.slice(0, 4) : ['mist', 'brush'] as VisualMotif[];
  const signaledFamily = visualSceneFamilies.find((family) => inferredMotifs.some((motif) => familyMotifs[family].includes(motif)));
  const sceneFamily = input.profile?.sceneFamily ?? signaledFamily ?? visualSceneFamilies[seed % visualSceneFamilies.length];
  const compositions = familyCompositions[sceneFamily];

  return {
    sceneFamily,
    palette: input.profile?.palette ?? defaults.palette,
    motifs: input.profile?.motifs?.length ? [...input.profile.motifs] : inferredMotifs,
    composition: input.profile?.composition ?? compositions[seed % compositions.length],
    light: input.profile?.light ?? defaults.light,
    intensity: input.profile?.intensity ?? defaults.intensity,
    signals,
  };
}

export function resolveVisualSequence(
  inputs: Array<Parameters<typeof resolveVisualProfile>[0]>,
): ResolvedVisualProfile[] {
  return inputs.map((input, index) => {
    const resolved = resolveVisualProfile(input);
    const sceneFamily = input.profile?.sceneFamily ?? showcaseFamilies[index % showcaseFamilies.length];
    return {
      ...resolved,
      sceneFamily,
      composition: input.profile?.composition ?? showcaseCompositions[index % showcaseCompositions.length],
    };
  });
}

export function resolveYearVisualProfile(year: string): ResolvedVisualProfile {
  const sceneFamily = visualSceneFamilies[Math.floor(Number(year) / 2) % visualSceneFamilies.length];
  return resolveVisualProfile({
    id: `archive-${year}`,
    writtenDate: `${year}-10-01`,
    title: year,
    body: '',
    profile: {
      sceneFamily,
      palette: Number(year) % 2 === 0 ? 'lapis' : 'saffron',
      motifs: familyMotifs[sceneFamily].slice(0, 3),
    },
  });
}
