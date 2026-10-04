export function poemSourceLines(body: string): string[] {
  return body.split(/\r?\n/);
}
