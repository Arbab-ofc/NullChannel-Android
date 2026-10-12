/** Preserve JSON contracts, using valid UTF-16 escapes instead of pictographic glyphs. */
export function escapeInterfaceGlyphs(text:string) {
  return text.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, value=>value.split('').map(unit=>`\\u${unit.charCodeAt(0).toString(16).padStart(4,'0')}`).join(''));
}
