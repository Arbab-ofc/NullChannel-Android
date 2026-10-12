import {Link} from 'react-router-dom';
import {useOptionalAccount} from '../../hooks/useAccount';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from './Brand';

export const Footer = () => {const account=useOptionalAccount();return <footer className="site-footer">
  <div className="site-footer__inner">
    <div className="site-footer__main">
      <div className="site-footer__identity">
        <Link to={account?.profile?'/dashboard':'/'} className="site-footer__brand" aria-label="NullChannel home">
          <Brand />
        </Link>
        <p>Connect Permanently. Converse Temporarily.</p>
      </div>
      <nav aria-label="Footer" className="site-footer__links"><Link to="/features">Features</Link><Link to="/explore">Explore</Link><Link to="/docs">Documentation</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/security">Security</Link></nav>
    </div>
    <div className="site-footer__bottom">
      <p>Copyright {new Date().getFullYear()} NullChannel. All rights reserved.</p>
      <span className="site-footer__note"><span aria-hidden="true" />Temporary by design.</span>
      <p className="site-footer__credit">Designed &amp; developed by <span>Arbab<ArrowUpRight aria-hidden="true" /></span></p>
    </div>
  </div>
</footer>;};
