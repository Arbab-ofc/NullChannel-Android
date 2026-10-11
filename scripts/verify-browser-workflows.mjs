import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config({ path: new URL('../server/.env', import.meta.url), quiet: true });
const base = process.env.NULLCHANNEL_BROWSER_URL ?? 'http://localhost:5173';
const api = process.env.NULLCHANNEL_LOCAL_API ?? 'http://localhost:5050/api';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const nonce = randomBytes(6).toString('hex');
const accounts = [];
const contexts = [];
const results = [];
const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const check = (condition, message) => { if (!condition) throw new Error(message); };
const record = (workflow, status, evidence) => results.push({ workflow, status, evidence });

try {
  const health = await fetch(`${api}/health/db`);
  check(health.ok && (await health.json()).data?.database === 'connected', 'Local API / Supabase health check failed');
  const denied = await browser.newContext({ viewport: { width: 390, height: 844 } }); contexts.push(denied);
  const deniedPage = await denied.newPage();
  await deniedPage.goto(`${base}/dashboard`);
  await deniedPage.waitForURL('**/login?next=*');
  record('Unauthenticated route protection', 'passed', 'Guest context was redirected from /dashboard to /login.');

  for (let index = 0; index < 3; index += 1) {
    const username = `ncui${nonce}${index}`;
    const email = `${username}@example.invalid`;
    const password = `UI-${randomBytes(20).toString('base64url')}Aa!7`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
    check(!created.error && created.data.user, 'Could not create isolated browser test account');
    accounts.push({ id: created.data.user.id, username, email, password });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); contexts.push(context);
    const page = await context.newPage();
    await page.goto(`${base}/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    await page.getByRole('heading', { name: `Welcome, ${username}` }).waitFor();
    accounts[index].page = page;
  }
  record('Real Supabase Auth login in three isolated browser contexts', 'passed', 'Three confirmed disposable Auth fixtures logged in through the React login form. Email confirmation was pre-established by the fixture admin API and is not treated as signup-email verification.');

  const accountA = accounts[0], pageA = accountA.page;
  for (const route of ['/dashboard', '/friends', '/friends/requests', '/explore', '/groups/create', '/match', '/invitations', '/notifications', '/settings', '/privacy', '/profile', '/docs']) {
    const response = await pageA.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
    await pageA.waitForFunction(path => location.pathname === path && document.querySelector('main h1'), route, { timeout: 15000 });
    check(response?.ok() && new URL(pageA.url()).pathname === route, `Route failed in authenticated browser context: ${route}`);
    check((await pageA.locator('main h1').first().innerText()).trim().length > 0, `Authenticated page has no heading: ${route}`);
  }
  record('Authenticated navigation pages', 'passed', 'Dashboard, friends/requests, explore, group create, match, invitations, notifications, settings, privacy, profile and docs loaded in the signed-in browser context.');

  const profileName = `UI QA ${nonce}`;
  await pageA.goto(`${base}/profile`);
  await pageA.getByLabel('Display name').fill(profileName);
  await pageA.getByLabel('Bio').fill(`Scoped real-browser audit ${nonce}`);
  await pageA.getByRole('button', { name: 'Save profile' }).click();
  await pageA.getByRole('status').filter({ hasText: 'Profile updated.' }).waitFor();
  const profile = await admin.from('profiles').select('display_name,bio').eq('id', accountA.id).single();
  check(!profile.error && profile.data.display_name === profileName && profile.data.bio === `Scoped real-browser audit ${nonce}`, 'Profile changes did not persist in Supabase');
  record('Profile edit persistence', 'passed', 'Display name and bio were saved through the UI and confirmed on the hosted profiles row.');

  const pageB = accounts[1].page;
  await pageA.goto(`${base}/friends`);
  await pageA.getByLabel('Find a username').fill(accounts[1].username);
  await pageA.getByRole('button', { name: 'Search' }).click();
  await pageA.getByRole('button', { name: 'Add friend' }).waitFor();
  await pageA.getByRole('button', { name: 'Add friend' }).click();
  await pageA.getByRole('status').filter({ hasText: 'Updated.' }).waitFor();
  await pageB.goto(`${base}/friends/requests`);
  await pageB.getByRole('button', { name: 'accept', exact: true }).waitFor();
  await pageB.getByRole('button', { name: 'accept', exact: true }).click();
  await pageB.getByRole('status').filter({ hasText: 'Updated.' }).waitFor();
  const friendship = await admin.from('friendships').select('user_low,user_high').or(`and(user_low.eq.${accountA.id},user_high.eq.${accounts[1].id}),and(user_low.eq.${accounts[1].id},user_high.eq.${accountA.id})`);
  check(!friendship.error && friendship.data?.length === 1, 'Friendship was not persisted');
  record('Friend search, request and accept through two user browsers', 'passed', 'A searched B and sent a request; B accepted it in a separate context; the friendship pair was confirmed in Supabase.');

  // Isolate a real browser timeout by disabling matching on the two other
  // disposable accounts; never disturb unrelated queue participants.
  const queueBefore = await admin.from('nc_match_queue').select('account_id');
  check(!queueBefore.error && !(queueBefore.data ?? []).some(row => !accounts.some(account => account.id === row.account_id)), 'An unrelated matchmaking fixture is active; leave it untouched and skip this browser timeout run.');
  for (const account of accounts.slice(1)) {
    await account.page.goto(`${base}/settings`);
    await account.page.locator('input[name="matchmaking"]').uncheck();
    await account.page.getByRole('button', { name: 'Save preferences' }).click();
    await account.page.getByRole('status').filter({ hasText: 'Privacy preferences saved.' }).waitFor();
  }
  await pageA.goto(`${base}/match`);
  await pageA.getByRole('button', { name: 'Start Searching' }).click();
  await pageA.getByRole('heading', { name: 'Searching for an available user' }).waitFor();
  const search = await admin.from('nc_match_queue').select('deadline').eq('account_id', accountA.id).single();
  check(!search.error && Date.parse(search.data.deadline) > Date.now(), 'Server matchmaking deadline was not persisted');
  await pageA.getByRole('heading', { name: 'Nobody is available right now.' }).waitFor({ timeout: 75000 });
  const queueAfter = await admin.from('nc_match_queue').select('account_id').eq('account_id', accountA.id);
  const reservationsAfter = await admin.from('nc_match_reservations').select('account_id').in('account_id', accounts.map(account => account.id));
  const identitiesAfter = await admin.from('nc_room_identities').select('room_id').eq('account_id', accountA.id);
  check(!queueAfter.error && !queueAfter.data?.length && !reservationsAfter.error && !reservationsAfter.data?.length && !identitiesAfter.error && !identitiesAfter.data?.length, 'Timed-out browser search left a queue reservation or room identity');
  record('Real 60-second browser matchmaking timeout', 'passed', 'A searched with B/C opted out. The persisted server deadline elapsed, the exact timeout UI appeared, and Supabase had no queue row, reservation, or new room identity.');

  await pageA.goto(`${base}/friends`);
  await pageA.getByLabel('Find a username').fill(accounts[2].username);
  await pageA.getByRole('button', { name: 'Search' }).click();
  await pageA.getByRole('button', { name: 'Add friend' }).click();
  const pageC = accounts[2].page;
  await pageC.goto(`${base}/friends/requests`);
  await pageC.getByRole('button', { name: 'accept', exact: true }).click();
  await pageC.goto(`${base}/settings`);
  await pageC.getByLabel('Confirm with your password').fill(accounts[2].password);
  pageC.once('dialog', dialog => dialog.accept());
  await pageC.getByRole('button', { name: 'Delete my account' }).click();
  await pageC.waitForURL('**/login?next=*', { timeout: 15000 });
  const deletedAuth = await admin.auth.admin.getUserById(accounts[2].id);
  const deletedProfile = await admin.from('profiles').select('id').eq('id', accounts[2].id).maybeSingle();
  const deletedFriendship = await admin.from('friendships').select('user_low,user_high').or(`and(user_low.eq.${accountA.id},user_high.eq.${accounts[2].id}),and(user_low.eq.${accounts[2].id},user_high.eq.${accountA.id})`);
  const survivingFriendship = await admin.from('friendships').select('user_low,user_high').or(`and(user_low.eq.${accountA.id},user_high.eq.${accounts[1].id}),and(user_low.eq.${accounts[1].id},user_high.eq.${accountA.id})`);
  check(Boolean(deletedAuth.error) && !deletedProfile.error && !deletedProfile.data && !deletedFriendship.error && deletedFriendship.data?.length === 0 && survivingFriendship.data?.length === 1, 'Account deletion failed or affected unrelated test relationships');
  record('Reauthenticated account deletion', 'passed', 'C deleted itself through Settings; Auth identity, profile and friendship were removed while A–B friendship remained.');

  await deniedPage.goto(`${base}/login`);
  await deniedPage.getByLabel('Email').fill(`no-such-${nonce}@example.invalid`);
  await deniedPage.getByLabel('Password').fill(`wrong-${randomBytes(12).toString('base64url')}`);
  await deniedPage.getByRole('button', { name: 'Login' }).click();
  await deniedPage.getByRole('alert').waitFor({ timeout: 15000 });
  record('Invalid credential handling', 'passed', 'A real login request with a nonexistent fixture address returned the UI error state without logging in.');

  const signupEmail = `ncsignup${nonce}@example.invalid`;
  await deniedPage.goto(`${base}/signup`);
  await deniedPage.getByLabel('Username').fill(`ncs${nonce}`);
  await deniedPage.getByLabel('Email').fill(signupEmail);
  const signupPassword = `Signup-${randomBytes(20).toString('base64url')}Aa!8`;
  await deniedPage.locator('input[name="password"]').fill(signupPassword);
  await deniedPage.locator('input[name="confirm"]').fill(signupPassword);
  const signupResponsePromise = deniedPage.waitForResponse(response => response.url().endsWith('/api/account/signup'));
  await deniedPage.getByRole('button', { name: 'Create account' }).click();
  const signupResponse = await signupResponsePromise;
  const signupUser = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const createdSignup = signupUser.data.users.find(user => user.email === signupEmail);
  if (createdSignup) accounts.push({ id: createdSignup.id, email: signupEmail, username: `ncs${nonce}`, password: '' });
  if (signupResponse.status() === 201) {
    const body = await signupResponse.json();
    await deniedPage.getByRole('status').waitFor({ timeout: 15000 });
    record('Signup form submission', body.data?.verification_required ? 'blocked' : 'passed', body.data?.verification_required ? 'Supabase accepted signup but requires email verification; the controlled .invalid fixture has no mailbox, so confirmation could not be completed.' : 'Supabase returned an authenticated signup session.');
  } else {
    await deniedPage.getByRole('alert').waitFor({ timeout: 10000 });
    const body = await signupResponse.json();
    record('Signup form submission', 'blocked', `Supabase Auth did not accept the controlled .invalid signup request (HTTP ${signupResponse.status()}, ${body.error?.code ?? 'provider error'}); actual mailbox confirmation is unverified.`);
  }

  const guestA = await browser.newContext({ viewport: { width: 390, height: 844 } }); contexts.push(guestA);
  await guestA.grantPermissions(['microphone'], { origin: base });
  await guestA.addInitScript(() => { const Native = window.RTCPeerConnection; Object.defineProperty(window, '__nullchannelPeers', { value: [] }); window.RTCPeerConnection = new Proxy(Native, { construct(target, args) { const peer = Reflect.construct(target, args); window.__nullchannelPeers.push(peer); return peer; } }); });
  const guestPageA = await guestA.newPage();
  await guestPageA.goto(base);
  await guestPageA.getByRole('button', { name: 'Start anonymously' }).click();
  await guestPageA.getByLabel('Your display name').fill(`GuestA${nonce}`);
  await guestPageA.getByLabel('Room name').fill(`QA ${nonce}`);
  await guestPageA.getByRole('button', { name: 'Create', exact: true }).click();
  await guestPageA.waitForURL('**/chat/*', { timeout: 20000 });
  const code = new URL(guestPageA.url()).pathname.split('/').at(-1);
  check(code && /^[A-Z0-9]{8}$/.test(code), 'Anonymous room creation did not yield an 8-character code');
  const guestB = await browser.newContext({ viewport: { width: 390, height: 844 } }); contexts.push(guestB);
  await guestB.grantPermissions(['microphone'], { origin: base });
  await guestB.addInitScript(() => { const Native = window.RTCPeerConnection; Object.defineProperty(window, '__nullchannelPeers', { value: [] }); window.RTCPeerConnection = new Proxy(Native, { construct(target, args) { const peer = Reflect.construct(target, args); window.__nullchannelPeers.push(peer); return peer; } }); });
  const guestPageB = await guestB.newPage();
  await guestPageB.goto(`${base}/chat/${code}`);
  await guestPageB.getByPlaceholder('Your name').fill(`GuestB${nonce}`);
  await guestPageB.getByRole('button', { name: 'Continue' }).click();
  const composerA = guestPageA.getByPlaceholder('Type a transmission');
  const composerB = guestPageB.getByPlaceholder('Type a transmission');
  await composerA.waitFor({ state: 'visible' }); await composerB.waitFor({ state: 'visible' });
  const marker = `browser workflow ${nonce}`;
  await composerA.fill(marker); await composerA.press('Enter');
  await guestPageB.getByText(marker, { exact: true }).waitFor({ timeout: 10000 });
  const room = await admin.from('rooms').select('id,code').eq('code', code).single();
  check(!room.error, 'Guest room record missing from Supabase');
  const stored = await admin.from('messages').select('id,content').eq('room_id', room.data.id).eq('content', marker).single();
  check(!stored.error && stored.data.content === marker, 'Guest message did not persist in its temporary room');
  record('Anonymous room invite, join, and live message', 'passed', 'Two independent guest browser contexts created/joined the same room; message arrived over Socket.IO and matched the scoped Supabase record.');

  await guestPageA.getByRole('button', { name: 'Start voice call' }).waitFor({ timeout: 15000 });
  await guestPageA.getByRole('button', { name: 'Start voice call' }).click();
  await guestPageB.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  const callStatusA = guestPageA.locator('[aria-label="Voice call"] [role="status"]');
  const callStatusB = guestPageB.locator('[aria-label="Voice call"] [role="status"]');
  await callStatusA.getByText('Voice Call Connected').waitFor({ timeout: 25000 });
  await callStatusB.getByText('Voice Call Connected').waitFor({ timeout: 25000 });
  await guestPageA.waitForTimeout(1200);
  const peerState = await Promise.all([guestPageA, guestPageB].map(page => page.evaluate(async () => {
    const peers = window.__nullchannelPeers ?? [];
    const reports = await Promise.all(peers.map(async peer => ({ state: peer.connectionState, local: peer.getSenders().map(sender => sender.track?.readyState), remote: peer.getReceivers().map(receiver => receiver.track?.readyState), stats: [...(await peer.getStats()).values()].filter(row => row.type === 'outbound-rtp' && row.kind === 'audio').map(row => row.packetsSent ?? 0) })));
    return reports;
  })));
  check(peerState.flat().some(peer => peer.state === 'connected' && peer.local.includes('live') && peer.remote.includes('live') && peer.stats.some(count => count > 0)), 'WebRTC connection did not transmit a live audio track');
  await guestPageA.getByRole('button', { name: 'End voice call' }).click();
  await callStatusA.getByText('Call ended').waitFor({ timeout: 10000 });
  record('Guest WebRTC voice call', 'passed', 'Two isolated Chromium pages established a native RTCPeerConnection and non-zero fake microphone RTP, then ended the call. Hardware microphones were not used.');

  await guestPageA.getByRole('button', { name: '[KEEP]' }).click();
  check(await guestPageA.getByRole('button', { name: '[BURN]' }).getAttribute('aria-pressed') === 'true', 'Burn Mode did not enable');
  await guestPageA.getByRole('button', { name: 'Toggle chat menu' }).click();
  guestPageA.once('dialog', dialog => dialog.accept());
  await guestPageA.getByRole('button', { name: 'Terminate' }).click();
  await guestPageA.getByRole('heading', { name: 'This channel was terminated' }).waitFor({ timeout: 15000 });
  const gone = await admin.from('rooms').select('id').eq('code', code).maybeSingle();
  check(!gone.error && !gone.data, 'Guest room destruction did not remove its database record');
  const access = await fetch(`${api}/rooms/${code}/messages`, { headers: { Origin: new URL(base).origin } });
  check([401, 403, 404].includes(access.status), 'Destroyed guest room message endpoint remained accessible without identity');
  record('Guest Burn Mode and destruction', 'passed', 'Burn toggle activated in UI; owner destroyed room; scoped room row was gone and anonymous history request was denied. The separate read-expiry timer was not awaited in this browser run.');

  const logoutPage = accountA.page;
  await logoutPage.goto(`${base}/dashboard`);
  await logoutPage.getByRole('button', { name: 'Logout' }).click();
  await logoutPage.waitForURL(`${base}/`);
  await logoutPage.goto(`${base}/dashboard`);
  await logoutPage.waitForURL('**/login?next=*');
  record('Logout and protected-route denial', 'passed', 'UI logout cleared the session; a subsequent protected route redirected to login.');
  console.log(JSON.stringify({ status: 'completed', results }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : 'Browser workflow failed', results }, null, 2));
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  for (const account of accounts) await admin.auth.admin.deleteUser(account.id).catch(() => {});
  console.log(JSON.stringify({ scopedAuthFixturesDeleted: accounts.length }));
}
