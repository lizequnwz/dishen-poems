import type { APIRoute } from 'astro';
import { loadSiteData } from '@/lib/site-data';
import { buildArchiveSearchRecords } from '@/lib/archive-search';

export const GET: APIRoute = async () => {
  const { publicPoems } = await loadSiteData();
  return new Response(JSON.stringify(buildArchiveSearchRecords(publicPoems)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
