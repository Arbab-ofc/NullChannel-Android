import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config({ path: new URL('../server/.env', import.meta.url), quiet: true });
const base = process.env.NULLCHANNEL_BROWSER_URL ?? 'http://localhost:5173';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const widths = process.env.NULLCHANNEL_RESPONSIVE_RETEST === '1' ? [320] : [320,360,375,390,414,430,768,1024,1280,1440,1920];
const themes = process.env.NULLCHANNEL_RESPONSIVE_RETEST === '1' ? ['dark'] : ['dark','light'];
const publicRoutes = ['/', '/features', '/docs', '/login', '/signup', '/forgot-password'];
const registeredRoutes = ['/dashboard','/friends','/friends/requests','/explore','/groups/create','/match','/invitations','/notifications','/settings','/privacy','/profile'];
const out = new URL(process.env.NULLCHANNEL_RESPONSIVE_RETEST === '1' ? '../output/playwright/nullchannel-responsive-retest/' : '../output/playwright/nullchannel-responsive/', import.meta.url);
await mkdir(out, { recursive: true });
const username = `ncvisual${randomBytes(5).toString('hex')}`;
const email = `${username}@example.invalid`;
const password = `V-${randomBytes(22).toString('base64url')}9A!`;
const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
if (created.error || !created.data.user) throw new Error('Could not create isolated responsive audit account');
const userId = created.data.user.id;
const browser = await chromium.launch({ headless: true });
const failures = [];
let screenshots = 0, routeChecks = 0;
let fixtureChatCode;
try {
  const authSeed = await browser.newContext({ viewport:{width:390,height:844} });
  console.log('responsive setup: registering disposable browser account');
  const authPage = await authSeed.newPage();
  await authPage.goto(`${base}/login`,{waitUntil:'domcontentloaded'});
  await authPage.getByLabel('Email').fill(email); await authPage.getByLabel('Password').fill(password); await authPage.getByRole('button',{name:'Login'}).click();
  await authPage.waitForURL('**/dashboard',{timeout:15000});
  const authState = await authSeed.storageState(); await authSeed.close();
  console.log('responsive setup: authenticated browser state ready');
  const guestSeed = await browser.newContext({viewport:{width:390,height:844}});
  const guestPage = await guestSeed.newPage(); await guestPage.goto(base,{waitUntil:'domcontentloaded'});
  await guestPage.getByRole('button',{name:'Start anonymously'}).click();
  await guestPage.getByLabel('Your display name').fill(`Responsive ${username.slice(-5)}`);
  await guestPage.getByLabel('Room name').fill(`Responsive audit ${username.slice(-5)}`);
  await guestPage.getByRole('button',{name:'Create',exact:true}).click(); await guestPage.waitForURL('**/chat/*',{timeout:15000});
  const chatPath = new URL(guestPage.url()).pathname; fixtureChatCode=chatPath.split('/').at(-1); const guestState = await guestSeed.storageState(); await guestSeed.close();
  console.log('responsive setup: real guest room ready; beginning viewport matrix');
  for (const theme of themes) {
    const context = await browser.newContext({ storageState:authState, viewport: { width:390, height:844 }, deviceScaleFactor:1 });
    await context.addInitScript(value => localStorage.setItem('nullchannel_theme', value), theme);
    const page = await context.newPage();
    page.on('pageerror', error => failures.push({ theme, width: page.viewportSize()?.width, path: new URL(page.url()).pathname, kind: 'pageerror', message: error.message.slice(0,180) }));
    for (const width of widths) {
      console.log(`responsive matrix: ${theme} ${width}px`);
      const viewportHeight=width<768?844:900;
      await page.setViewportSize({width,height:viewportHeight});
      await page.evaluate(value => document.documentElement.classList.toggle('light', value === 'light'), theme);
      const screenshotRoutes = new Set(['/', '/docs', '/dashboard']);
      for (const path of [...publicRoutes,...registeredRoutes]) {
        try {
          const response = await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForFunction(() => document.querySelector('#root main[role="status"]')?.textContent?.includes('Loading NullChannel') !== true,undefined,{timeout:15000});
          await page.locator('main h1, main h2').first().waitFor({timeout:12000});
          const result = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, heading: document.querySelector('main h1,main h2')?.textContent?.trim() ?? '' }));
          routeChecks++;
          if (!response?.ok() || new URL(page.url()).pathname!==path || result.scrollWidth > width + 1 || result.bodyWidth > width + 1) failures.push({ theme, width, path, kind: 'layout-or-http', actualPath:new URL(page.url()).pathname,http: response?.status(), ...result });
          if(screenshotRoutes.has(path)){await page.screenshot({ path: new URL(`${theme}-${width}-${path === '/' ? 'home' : path.slice(1).replaceAll('/','_')}.png`, out).pathname }); screenshots++;}
        } catch (error) { failures.push({ theme,width,path,kind:'navigation',message:error instanceof Error?error.message.slice(0,180):'navigation failed' }); }
      }
      const guest = await browser.newContext({storageState:guestState,viewport:{width,height:viewportHeight},deviceScaleFactor:1,isMobile:width<768,hasTouch:width<768});
      await guest.addInitScript(value=>localStorage.setItem('nullchannel_theme',value),theme);const chat=await guest.newPage();
      try{const response=await chat.goto(`${base}${chatPath}`,{waitUntil:'domcontentloaded',timeout:15000});await chat.waitForFunction(()=>document.querySelector('#root main[role="status"]')?.textContent?.includes('Loading NullChannel')!==true,undefined,{timeout:15000});await chat.locator('.chat-header').waitFor({timeout:12000});const result=await chat.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth}));routeChecks++;if(!response?.ok()||result.scrollWidth>width+1||result.bodyWidth>width+1)failures.push({theme,width,path:'/chat/:code',kind:'layout-or-http',http:response?.status(),...result});await chat.screenshot({path:new URL(`${theme}-${width}-chat.png`,out).pathname});screenshots++;}catch(error){failures.push({theme,width,path:'/chat/:code',kind:'navigation',message:error instanceof Error?error.message.slice(0,180):'navigation failed'});}
      await guest.close();
    }
    await context.close();
  }
  const report={ status: failures.length ? 'issues-found' : 'matrix-passed', widths, themes, routesPerTheme:publicRoutes.length+registeredRoutes.length+1, routeChecks, screenshots, failures, screenshotDirectory:out.pathname };
  await writeFile(new URL('responsive-audit.json',out),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
  if(fixtureChatCode){const deleted=await supabase.from('rooms').delete().eq('code',fixtureChatCode);if(deleted.error)throw new Error('Scoped responsive room cleanup failed');}
  await supabase.auth.admin.deleteUser(userId);
  await supabase.from('profiles').delete().eq('id',userId);
}
