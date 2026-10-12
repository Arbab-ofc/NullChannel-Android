// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProductPreview } from '../components/common/ProductPreview';
import { ReactionIcon, reactions, reactionName } from '../components/chat/ReactionIcon';
import { escapeInterfaceGlyphs } from '../lib/interface-text';
import shell from '../../index.html?raw';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it('labels the preview as sample content and starts a fresh local scene on demand',async()=>{
  await act(async()=>root.render(<ProductPreview/>));expect(host.textContent).toContain('sample conversation');expect(host.textContent).toContain('Ghost_204');
  await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toContain('Ghost_817');expect(host.textContent).not.toContain('Ghost_204');
});
it('presents existing reaction payloads as named SVG controls rather than glyphs',()=>{
  expect(reactions.map(r=>r.value)).toEqual(['\u{1f44d}','\u{1f602}','\u{1f525}','\u2764\ufe0f','\u{1f440}']);
  for(const reaction of reactions){const html=renderToStaticMarkup(<ReactionIcon value={reaction.value}/>);expect(html).toContain('<svg');expect(html).not.toContain(reaction.value);expect(reactionName(reaction.value)).toBe(reaction.label);}
});
it('keeps displayed/copyable JSON examples valid and semantically identical without emoji',()=>{
  const example={emoji:'\u{1f44d}',allowed:['\u2764\ufe0f','\u{1f602}']};const text=escapeInterfaceGlyphs(JSON.stringify(example));expect(/[\p{Extended_Pictographic}\uFE0F]/u.test(text)).toBe(false);expect(JSON.parse(text)).toEqual(example);
});
it('initializes theme from a same-origin script before the application module, without inline CSP exceptions',()=>{
  expect(shell.indexOf('src="/theme-init.js"')).toBeLessThan(shell.indexOf('src="/src/main.tsx"'));expect(shell).not.toMatch(/<script[^>]*>\s*[^<\s]/);
});
