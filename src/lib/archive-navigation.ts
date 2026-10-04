export interface ArchiveState {
  query: string;
  year: string;
  view: 'gallery' | 'list';
}

export function readArchiveState(url: URL, years: string[], defaultYear = ''): ArchiveState {
  const requestedYear = url.searchParams.get('year');
  return {
    query: (url.searchParams.get('q') ?? '').trim().slice(0, 200),
    year: requestedYear === 'all' ? '' : requestedYear && years.includes(requestedYear) ? requestedYear : defaultYear,
    view: url.searchParams.get('view') === 'list' ? 'list' : 'gallery',
  };
}

export function archiveStateUrl(url: URL, state: ArchiveState, defaultYear = '') {
  const next = new URL(url);
  for (const [key, value] of [
    ['q', state.query.trim()],
    ['year', state.year === defaultYear ? '' : state.year || 'all'],
    ['view', state.view === 'list' ? 'list' : ''],
  ]) {
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  next.hash = '';
  return next;
}

export function archivePoemAnchor(slug: string) {
  return `archive-poem-${slug}`;
}

/** Accept only this site's chronological archive when restoring a reading return link. */
export function validArchiveReturn(value: string, origin: string) {
  try {
    const url = new URL(value, origin);
    return url.origin === origin && /^\/archive\/(?:\d{4}\/)?$/.test(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}`
      : undefined;
  } catch {
    return undefined;
  }
}
