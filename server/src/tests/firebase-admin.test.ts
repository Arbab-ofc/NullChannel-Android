import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  env: { PUSH_ENABLED: 'true', FIREBASE_PROJECT_ID: 'fixture-project' as string | undefined },
  apps: [] as Array<{name:string;options:{projectId:string}}>,
  credential: vi.fn(), initialize: vi.fn(), messaging: vi.fn(), error: vi.fn()
}));
vi.mock('../config/env.js', () => ({ env: state.env }));
vi.mock('../utils/logger.js', () => ({ logger: { error: state.error } }));
vi.mock('firebase-admin/app', () => ({getApps: () => state.apps, applicationDefault: state.credential, initializeApp: state.initialize}));
vi.mock('firebase-admin/messaging', () => ({getMessaging: state.messaging}));
import { firebasePushMessaging } from '../services/firebase-admin.service.js';
beforeEach(() => {
  vi.clearAllMocks(); state.apps=[]; state.env.PUSH_ENABLED='true';state.env.FIREBASE_PROJECT_ID='fixture-project';
  state.credential.mockReset().mockReturnValue('synthetic-credential');
  state.initialize.mockImplementation((options,name)=>{const app={options,name};state.apps.push(app);return app;});
  state.messaging.mockReturnValue({send:vi.fn()});
});
describe('lazy Firebase Admin push initialization', () => {
  it('does not initialize or read credentials when disabled', () => {state.env.PUSH_ENABLED='false';expect(firebasePushMessaging()).toBeNull();expect(state.credential).not.toHaveBeenCalled();});
  it('initializes the configured named app once using ADC', () => {firebasePushMessaging();firebasePushMessaging();expect(state.initialize).toHaveBeenCalledOnce();expect(state.initialize).toHaveBeenCalledWith({credential:'synthetic-credential',projectId:'fixture-project'},'nullchannel-push');});
  it('does not reuse an unrelated default Firebase app', () => {state.apps=[{name:'[DEFAULT]',options:{projectId:'another-project'}}];firebasePushMessaging();expect(state.initialize).toHaveBeenCalledOnce();});
  it('fails safely when credentials cannot be loaded', () => {state.credential.mockImplementation(()=>{throw new Error('private-key and credential path details');});expect(firebasePushMessaging()).toBeNull();expect(state.error).toHaveBeenCalledWith('push_initialization_failed');expect(JSON.stringify(state.error.mock.calls)).not.toContain('private-key');});
  it('rejects missing or mismatched project configuration', () => {state.env.FIREBASE_PROJECT_ID=undefined;expect(firebasePushMessaging()).toBeNull();expect(state.initialize).not.toHaveBeenCalled();state.env.FIREBASE_PROJECT_ID='fixture-project';state.apps=[{name:'nullchannel-push',options:{projectId:'wrong-project'}}];expect(firebasePushMessaging()).toBeNull();expect(state.messaging).not.toHaveBeenCalled();});
});
