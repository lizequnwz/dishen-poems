import type { APIRoute } from 'astro';
import { loadSiteData, poemPath } from '@/lib/site-data';
import { deriveTextVariants } from '@/lib/script-conversion';
import type { ReadingCatalogEntry } from '@/lib/reading-library';

export const GET: APIRoute = async () => {
  const { publicPoems } = await loadSiteData();
  const catalog: ReadingCatalogEntry[] = publicPoems.map((poem) => {
    const title = deriveTextVariants(poem.data.title, poem.data.originalScript, poem.data.scriptOverrides);
    return {
      id: poem.data.id,
      url: poemPath(poem),
      writtenDate: poem.data.writtenDate,
      title: { simplified: title.simplified, traditional: title.traditional },
    };
  });
  return new Response(JSON.stringify(catalog), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
