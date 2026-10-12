import { ArrowUpRight } from 'lucide-react';
import { Brand } from './Brand';

export const Footer = () => <footer className="site-footer">
  <div className="site-footer__inner">
    <div className="site-footer__main">
      <div className="site-footer__identity">
        <a href="/" className="site-footer__brand" aria-label="NullChannel home">
          <Brand />
        </a>
        <p>Connect Permanently. Converse Temporarily.</p>
      </div>
      <nav aria-label="Footer" className="site-footer__links"><a href="/features">Features</a><a href="/explore">Explore</a><a href="/docs">Documentation</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/security">Security</a></nav>
    </div>
    <div className="site-footer__bottom">
      <p>Copyright {new Date().getFullYear()} NullChannel. All rights reserved.</p>
      <span className="site-footer__note"><span aria-hidden="true" />Temporary by design.</span>
      <p className="site-footer__credit">Designed &amp; developed by <span>Arbab<ArrowUpRight aria-hidden="true" /></span></p>
    </div>
  </div>
</footer>;
