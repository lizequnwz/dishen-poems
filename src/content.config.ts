import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const stableSlug = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const stablePoemId = /^poem-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
    writtenDate: z.string().regex(isoDate),
    originalScript: z.enum(['simplified', 'traditional']),
    source: z.string().min(1),
    status: z.enum(['ingested', 'verified', 'curated']),
    descriptiveTags: z.array(z.string().min(1)).default([]),
    visualKey: z.enum(['spring-rest', 'mountain-spring', 'strange-rain', 'four-seasons', 'snow-brush']),
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
