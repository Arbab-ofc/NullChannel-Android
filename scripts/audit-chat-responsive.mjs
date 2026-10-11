import { randomBytes } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config({path:new URL('../server/.env',import.meta.url),quiet:true});
const base=process.env.NULLCHANNEL_BROWSER_URL??'http://localhost:5173';
const widths=[320,360,375,390,414,430,768,1024,1280,1440,1920];
const out=new URL('../output/playwright/nullchannel-responsive/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();const failures=[];let roomCode='';
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Start anonymously'}).click();
 await page.getByLabel('Your display name').fill(`Chat audit ${randomBytes(3).toString('hex')}`);await page.getByLabel('Room name').fill(`Chat responsive ${randomBytes(3).toString('hex')}`);
 await page.getByRole('button',{name:'Create',exact:true}).click();await page.waitForURL('**/chat/*',{timeout:20000});roomCode=new URL(page.url()).pathname.split('/').at(-1)??'';
 if(await page.getByRole('heading',{name:'Name required to enter this room'}).count()){
  await page.getByPlaceholder('Your name').fill(`Chat audit ${randomBytes(2).toString('hex')}`);await page.getByRole('button',{name:'Continue'}).click();
 }
 await page.locator('.chat-header').waitFor({timeout:15000});await page.locator('.chat-composer textarea').waitFor({timeout:10000});
 for(const theme of ['dark','light'])for(const width of widths){
  const height=width<768?844:900;await page.setViewportSize({width,height});await page.evaluate(theme=>document.documentElement.classList.toggle('light',theme==='light'),theme);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const geometry=await page.evaluate(()=>{const composer=document.querySelector('.chat-composer').getBoundingClientRect(),transcript=document.querySelector('.chat-transcript').getBoundingClientRect();return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,composerBottom:composer.bottom,transcriptHeight:transcript.height}});
  if(geometry.scrollWidth>width+1||geometry.composerBottom>height+1||geometry.transcriptHeight<100)failures.push({theme,width,...geometry});
  await page.screenshot({path:new URL(`chat-${theme}-${width}.png`,out).pathname});
 }
 await page.setViewportSize({width:390,height:430});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const keyboard=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,composerBottom:document.querySelector('.chat-composer').getBoundingClientRect().bottom,transcriptHeight:document.querySelector('.chat-transcript').getBoundingClientRect().height}));
 if(keyboard.scrollWidth>390||keyboard.composerBottom>430||keyboard.transcriptHeight<100)failures.push({case:'short-visible-viewport',...keyboard});
 await page.screenshot({path:new URL('chat-keyboard-390x430.png',out).pathname});
 if(failures.length)process.exitCode=1;
 console.log(JSON.stringify({status:failures.length?'issues-found':'chat-matrix-passed',themes:['dark','light'],widths,screenshots:widths.length*2+1,failures,keyboardViewport:keyboard,roomFixtureCreated:Boolean(roomCode)}));
}finally{
 if(roomCode){try{await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Toggle chat menu'}).click();page.once('dialog',dialog=>void dialog.accept());await page.getByRole('button',{name:'Terminate',exact:true}).click();await page.getByRole('heading',{name:'This channel was terminated'}).waitFor({timeout:10000});}catch{/* fixture room retains its normal finite lifetime if UI cleanup fails */}}
 await context.close().catch(()=>{});await browser.close().catch(()=>{});
}
