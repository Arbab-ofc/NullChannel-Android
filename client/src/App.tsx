import {PersistentCallTray} from './components/call/PersistentCallTray';
import { LoadingSignal } from './components/common/LoadingSignal';
import { RoomCreatedFeedback } from './components/immersive/RoomCreatedFeedback';
import { PageTransition } from './components/common/PageTransition';
import { lazy, Suspense } from 'react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './components/common/Footer';
const LandingPage=lazy(()=>import('./pages/LandingPage'));
const ChatPage=lazy(()=>import('./pages/ChatPage'));
const NotFoundPage=lazy(()=>import('./pages/NotFoundPage'));
const AuthPage=lazy(()=>import('./pages/AuthPage'));
import { AccountProvider } from './hooks/useAccount';
import { AccountLayout } from './components/account/AccountLayout';
const DashboardPage=lazy(()=>import('./pages/AccountPages').then(module=>({default:module.DashboardPage})));
const FriendsPage=lazy(()=>import('./pages/AccountPages').then(module=>({default:module.FriendsPage})));
const NotificationsPage=lazy(()=>import('./pages/AccountPages').then(module=>({default:module.NotificationsPage})));
const PrivacyPage=lazy(()=>import('./pages/AccountPages').then(module=>({default:module.PrivacyPage})));
const ProfilePage=lazy(()=>import('./pages/AccountPages').then(module=>({default:module.ProfilePage})));
const SettingsPage=lazy(()=>import('./pages/AccountPages').then(module=>({default:module.SettingsPage})));
const CreateRoomPage=lazy(()=>import('./pages/TemporaryPages').then(module=>({default:module.CreateRoomPage})));
const ExplorePage=lazy(()=>import('./pages/TemporaryPages').then(module=>({default:module.ExplorePage})));
const InvitationsPage=lazy(()=>import('./pages/TemporaryPages').then(module=>({default:module.InvitationsPage})));
const MatchPage=lazy(()=>import('./pages/TemporaryPages').then(module=>({default:module.MatchPage})));
const DocsPage=lazy(()=>import('./pages/DocsPage'));
export default function App() {
  const location = useLocation();
  return <AccountProvider><ErrorBoundary key={location.pathname}><Suspense fallback={<main className="min-h-[60dvh] p-8"><LoadingSignal variant="page" label="Loading NullChannel"/></main>}><PageTransition><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/features" element={<LandingPage />} />
    <Route path="/docs" element={<DocsPage />} />
    <Route path="/security" element={<DocsPage />} />
    <Route path="/terms" element={<main className="docs-shell"><h1 className="text-3xl font-bold">Terms of use</h1><p className="mt-6">Use NullChannel responsibly. Do not share unlawful content, harass participants or misuse account and room access. Conversations expire; downloaded copies and screenshots may persist outside the application. Report abusive activity through configured support channels.</p><a href="/docs#privacy" className="text-cyan">Read privacy and deletion details</a></main>} />
    <Route path="/chat/:code" element={<ChatPage />} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/signup" element={<AuthPage mode="signup" />} />
    <Route path="/forgot-password" element={<AuthPage mode="forgot-password" />} />
    <Route path="/reset-password" element={<AuthPage mode="reset-password" />} />
    <Route element={<AccountLayout />}>
      <Route path="/explore" element={<ExplorePage />} />
      <Route path="/explore/create" element={<CreateRoomPage kind="public" />} />
      <Route path="/groups/create" element={<CreateRoomPage />} />
      <Route path="/match" element={<MatchPage />} />
      <Route path="/invitations" element={<InvitationsPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/friends" element={<FriendsPage />} />
      <Route path="/friends/requests" element={<FriendsPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
    </Route>
    <Route path="/404" element={<NotFoundPage />} />
    <Route path="*" element={<Navigate to="/404" replace />} />
  </Routes></PageTransition></Suspense></ErrorBoundary><RoomCreatedFeedback/><PersistentCallTray/>{!location.pathname.startsWith('/chat/') && <Footer />}</AccountProvider>;
}
