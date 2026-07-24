import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import {
  visualCompositions,
  visualIntensities,
  visualLights,
  visualMotifs,
  visualPalettes,
} from './lib/visual-profile';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const stableSlug = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const stablePoemId = /^poem-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const poemSource = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('manual'),
    label: z.string().min(1),
  }),
  z.object({
    kind: z.literal('pdf'),
    label: z.string().min(1),
    file: z.string().min(1),
    pdfSha256: z.string().regex(/^[a-f0-9]{64}$/),
    pdfPage: z.number().int().positive(),
    region: z.enum(['left', 'right', 'full', 'continuation']),
    regionSequence: z.number().int().positive().optional(),
    candidateId: z.string().regex(/^pdf-[a-f0-9]{24}$/).optional(),
    printedPage: z.number().int().positive().optional(),
    rulesVersion: z.string().min(1),
    contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    extractedContentFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    reviewDecisionId: z.string().regex(/^review-pdf-[a-f0-9]{24}$/).optional(),
    confidence: z.enum(['low', 'medium', 'high']),
    failureReasons: z.array(z.string().min(1)).default([]),
    layoutTemplate: z.string().min(1),
    layoutTemplateStatus: z.enum(['pending', 'calibrated']),
  }),
]);

const visualProfile = z.object({
  palette: z.enum(visualPalettes).optional(),
  motifs: z.array(z.enum(visualMotifs)).min(1).optional(),
  composition: z.enum(visualCompositions).optional(),
  light: z.enum(visualLights).optional(),
  intensity: z.enum(visualIntensities).optional(),
});

const poems = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './poems',
    generateId: ({ entry, data }) => {
      const title = String(data.title ?? '');
      const writtenDate = String(data.writtenDate ?? '');
      const expected = `${writtenDate}-${title}.md`;

      if (entry !== expected) {
        throw new Error(`Poem filename must match frontmatter: expected "${expected}", received "${entry}".`);
      }

      return String(data.id ?? entry.replace(/\.md$/, ''));
    },
  }),
  schema: z.object({
    id: z.string().regex(stablePoemId),
    slug: z.string().regex(stableSlug),
    title: z.string().min(1),
    writtenDate: z.string().regex(isoDate).refine((value) => {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }, 'writtenDate must be a valid Gregorian calendar date'),
    originalScript: z.enum(['simplified', 'traditional']),
    source: poemSource,
    status: z.enum(['ingested', 'verified', 'curated']),
    descriptiveTags: z.array(z.string().min(1)).default([]),
    visualProfile: visualProfile.optional(),
    visualAssetIds: z.array(z.string()).default([]),
    audioAssetIds: z.array(z.string()).default([]),
    imageDescription: z.string().optional(),
    scriptOverrides: z
      .object({
        simplified: z.record(z.string(), z.string()).default({}),
        traditional: z.record(z.string(), z.string()).default({}),
      })
      .default({ simplified: {}, traditional: {} }),
  }),
});

const exhibitions = defineCollection({
  loader: glob({
    pattern: '**/*.{yaml,yml}',
    base: './exhibitions',
    generateId: ({ entry, data }) => {
      const id = String(data.id ?? '');
      const filename = entry.replace(/\.(yaml|yml)$/, '');
      if (filename !== id) {
        throw new Error(`Exhibition filename must match its id: expected "${id}.yaml", received "${entry}".`);
      }
      return id;
    },
  }),
  schema: z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.object({
      zh: z.string().min(1),
      en: z.string().min(1),
    }),
    status: z.enum(['draft', 'published', 'archived']),
    poemIds: z.array(z.string().regex(stablePoemId)).min(1),
  }),
});

export const collections = { poems, exhibitions };
