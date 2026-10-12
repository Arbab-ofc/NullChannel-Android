// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import { Footer } from '../components/common/Footer';
it('uses semantic footer, dynamic year and exact brand and credit',() => {
  const html = renderToStaticMarkup(<MemoryRouter><Footer/></MemoryRouter>);
  expect(html).toContain('<footer'); expect(html).toContain('NullChannel'); expect(html).toContain(String(new Date().getFullYear()));
  expect(html).toContain('Connect Permanently. Converse Temporarily.'); expect(html).toContain('Designed &amp; developed by'); expect(html).toContain('Arbab');
});
