/**
 * Use identical Han character boundaries in the index and query. This keeps
 * remembered Chinese lines searchable across Pagefind's browser languages.
 * Only search data changes; authoritative poem text is never rewritten.
 * @param {string} text
 */
export function separateHanCharacters(text) {
  return text.replace(/\p{Script=Han}/gu, ' $& ').replace(/\s+/gu, ' ').trim();
}

/**
 * Restore excerpt spacing and remove Pagefind's repeated heading prefix.
 * @param {string} text
 * @param {string} title
 */
export function formatSearchExcerpt(text, title) {
  const excerpt = text.replace(/(?<=\p{Script=Han})\s+(?=[\p{Script=Han}\p{Punctuation}])|(?<=[\p{Script=Han}\p{Punctuation}])\s+(?=\p{Script=Han})/gu, '');
  const prefix = `${title}.`;
  return excerpt.startsWith(prefix) ? excerpt.slice(prefix.length).trimStart() : excerpt;
}
