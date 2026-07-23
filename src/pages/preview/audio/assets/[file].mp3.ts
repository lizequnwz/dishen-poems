import type { APIRoute, GetStaticPaths } from 'astro';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { candidateAudioAssets } from '@/lib/audio-data';

export const getStaticPaths: GetStaticPaths = () => {
  if (!import.meta.env.DEV) return [];
  return candidateAudioAssets.map((asset) => ({
    params: { file: asset.mp3.path.split('/').at(-1)!.replace(/\.mp3$/, '') },
    props: { localFile: asset.mp3.localFile },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const bytes = await readFile(resolve(String(props.localFile)));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
      'Content-Length': String(bytes.byteLength),
    },
  });
};
