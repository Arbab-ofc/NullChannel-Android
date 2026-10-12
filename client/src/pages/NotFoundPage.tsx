import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Illustration } from '../components/immersive/Illustration';
export default function NotFoundPage() {
  return <main className="not-found"><div><Illustration kind="error"/><p className="nc-eyebrow justify-center">404 · Off the frequency</p><h1 className="my-4">This space isn’t here.</h1><p className="mb-6 text-muted">Let’s get you back to your next conversation.</p><Link className="nc-button nc-button--primary" to="/"><ArrowLeft aria-hidden="true" size={18}/>Back to NullChannel</Link></div></main>;
}
