import axios from 'axios';
import multer from 'multer';
import { imagekit } from '../config/imagekit.js';
import { clearAvatar,uploadAvatar,validAvatar } from '../services/avatar.service.js';
import { eligibleProfile,targetByUsername } from '../services/social.service.js';
import { uploadCapacity } from '../middlewares/upload.middleware.js';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { requireAccount } from '../middlewares/account.middleware.js';
import { accountAuthClient, accountCookie, accountRefreshCookie, clearAccountCookies, refreshAccountSession, cookieValue, profileFor, setAccountCookies, validPassword, validUsername } from '../services/account.service.js';
import { errorResponse, successResponse } from '../utils/apiResponse.js';
import { deleteAccountRooms } from '../services/registered-room.service.js';
import { disconnectAccount,refreshPresencePrivacy } from '../services/presence.service.js';
import { rateLimitHandler } from '../middlewares/rateLimit.middleware.js';
import { respondToAuthEmailFailure } from '../services/auth-email.service.js';

const router=Router();
// Keep brute-force protection on credential and recovery flows. A broad
// `/account/*` limiter makes healthy profile reads and unrelated users behind
// the same NAT consume each other's authentication budget.
const limiter=(limit:number)=>rateLimit({windowMs:60000,limit,handler:rateLimitHandler,standardHeaders:true,legacyHeaders:false});
const loginLimit=limiter(10),signupLimit=limiter(6),recoveryLimit=limiter(6),refreshLimit=limiter(30),sensitiveAccountLimit=limiter(6);
const username=z.string().refine(validUsername,'Use 3–24 letters, digits or underscores; reserved names are unavailable.');
const password=z.string().refine(validPassword,'Use 12–128 characters.');
router.post('/account/signup',signupLimit,async(req,res,next)=>{try{
 const parsed=z.object({username,email:z.email(),password}).safeParse(req.body);
 if(!parsed.success){res.status(400).json(errorResponse('VALIDATION_ERROR',parsed.error.issues[0].message));return;}
 const schema = await supabase.from('profiles').select('id').limit(0);
 if(schema.error){res.status(503).json(errorResponse('ACCOUNT_SETUP_PENDING','Account registration is unavailable until the database upgrade is applied.'));return;}
 const auth=accountAuthClient();const {data,error}=await auth.auth.signUp({email:parsed.data.email,password:parsed.data.password,options:{data:{username:parsed.data.username},emailRedirectTo:`${env.CLIENT_URL}/login`}});
 if(error){if(respondToAuthEmailFailure(error,res))return;res.status(400).json(errorResponse('REGISTRATION_FAILED','Registration could not be completed. Check your details or try another username.'));return;}
 if(data.session)setAccountCookies(res,data.session);
 res.status(201).json(successResponse({profile:data.session&&data.user?await profileFor(data.user.id):null,verification_required:!data.session}));
 }catch(error){next(error);}});
router.post('/account/login',loginLimit,async(req,res,next)=>{try{
 const parsed=z.object({email:z.email(),password:z.string().min(1).max(128)}).safeParse(req.body);if(!parsed.success){res.status(400).json(errorResponse('VALIDATION_ERROR','Enter a valid email and password.'));return;}
 const {data,error}=await accountAuthClient().auth.signInWithPassword(parsed.data);
 if(error||!data.session){res.status(401).json(errorResponse('INVALID_CREDENTIALS','Unable to sign in with those credentials.'));return;}
 setAccountCookies(res,data.session);res.json(successResponse({profile:data.user?await profileFor(data.user.id):null}));
 }catch(error){next(error);}});
router.post('/account/refresh',refreshLimit,async(req,res,next)=>{try{
 const token=cookieValue(req.headers.cookie,accountRefreshCookie());if(!token){res.status(401).json(errorResponse('ACCOUNT_REQUIRED','Sign in again.'));return;}
 const {data,error}=await refreshAccountSession(token);if(error&&![400,401,403].includes(error.status??0))throw new Error('AUTH_UNAVAILABLE');if(error||!data.session){clearAccountCookies(res);res.status(401).json(errorResponse('SESSION_EXPIRED','Sign in again.'));return;}
 setAccountCookies(res,data.session);res.json(successResponse({profile:data.user?await profileFor(data.user.id):null}));
 }catch(error){next(error);}});
router.post('/account/logout',async(req,res,next)=>{try{
 const token=cookieValue(req.headers.cookie,accountCookie());
 try{if(token){const verified=await supabase.auth.getUser(token);if(verified.data.user)await disconnectAccount(verified.data.user.id);const revoked=await supabase.auth.admin.signOut(token,'local');if(revoked.error)throw revoked.error;}}finally{clearAccountCookies(res);}res.json(successResponse({logged_out:true}));
 }catch(error){next(error);}});
router.post('/account/forgot-password',recoveryLimit,async(req,res,next)=>{try{
 const parsed=z.object({email:z.email()}).safeParse(req.body);if(!parsed.success){res.status(400).json(errorResponse('VALIDATION_ERROR','Enter a valid email address.'));return;}
 const {error}=await accountAuthClient().auth.resetPasswordForEmail(parsed.data.email,{redirectTo:`${env.CLIENT_URL}/reset-password`});
 if(error&&respondToAuthEmailFailure(error,res))return;
 res.json(successResponse({message:'If eligible, a password reset email will be sent.'}));
 }catch(error){next(error);}});
router.post('/account/reset-password',recoveryLimit,async(req,res,next)=>{try{
 const parsed=z.object({password,accessToken:z.string().min(20).max(8192),refreshToken:z.string().min(10).max(8192)}).safeParse(req.body);if(!parsed.success){res.status(400).json(errorResponse('VALIDATION_ERROR','Invalid reset link or password.'));return;}
 const auth=accountAuthClient();const session=await auth.auth.setSession({access_token:parsed.data.accessToken,refresh_token:parsed.data.refreshToken});
 if(session.error){res.status(401).json(errorResponse('RESET_EXPIRED','This reset link is invalid or expired.'));return;}
 const updated=await auth.auth.updateUser({password:parsed.data.password});if(updated.error){res.status(400).json(errorResponse('PASSWORD_UPDATE_FAILED','Unable to update password.'));return;}
 if(session.data.session)setAccountCookies(res,session.data.session);res.json(successResponse({updated:true}));
 }catch(error){next(error);}});
router.use('/account',requireAccount);
router.get('/account/me',async(_req,res,next)=>{try{res.json(successResponse({profile:await profileFor(res.locals.accountId)}));}catch(error){next(error);}});
router.patch('/account/profile',async(req,res,next)=>{try{
 const parsed=z.object({display_name:z.string().trim().max(60).optional(),bio:z.string().trim().max(240).optional(),username:username.optional()}).strict().safeParse(req.body);
 if(!parsed.success){res.status(400).json(errorResponse('VALIDATION_ERROR','Invalid profile fields.'));return;}
 if(parsed.data.username){const profile=await profileFor(res.locals.accountId);if(profile.username_changed_at&&Date.now()-Date.parse(profile.username_changed_at)<30*86400000){res.status(409).json(errorResponse('USERNAME_COOLDOWN','Username changes are limited to once every 30 days.'));return;}}
 const {error}=await supabase.from('profiles').update({...parsed.data,updated_at:new Date().toISOString(),...(parsed.data.username?{username_changed_at:new Date().toISOString()}: {})}).eq('id',res.locals.accountId);
 if(error){res.status(409).json(errorResponse('PROFILE_UPDATE_FAILED','That username is unavailable or the profile could not be updated.'));return;}
 res.json(successResponse({profile:await profileFor(res.locals.accountId)}));
 }catch(error){next(error);}});
const privacy=z.object({profile_visibility:z.enum(['registered','friends','private']).optional(),discoverability:z.enum(['registered','friends','nobody']).optional(),friend_requests:z.enum(['registered','nobody']).optional(),presence_visibility:z.enum(['registered','friends','nobody']).optional(),invitations:z.enum(['registered','friends','nobody']).optional(),matchmaking:z.boolean().optional(),ghost_mode:z.boolean().optional(),notify_friend_requests:z.boolean().optional(),notify_invitations:z.boolean().optional(),notify_matches:z.boolean().optional(),notify_expiration:z.boolean().optional()}).strict();
router.put('/account/privacy',async(req,res,next)=>{try{const parsed=privacy.safeParse(req.body);if(!parsed.success){res.status(400).json(errorResponse('VALIDATION_ERROR','Invalid privacy settings.'));return;}const {error}=await supabase.from('privacy_settings').update(parsed.data).eq('user_id',res.locals.accountId);if(error)throw error;await refreshPresencePrivacy(res.locals.accountId);if(parsed.data.matchmaking===false){const canceled=await supabase.rpc('nc_match_cancel',{p_account:res.locals.accountId});if(canceled.error)throw canceled.error;}res.json(successResponse({profile:await profileFor(res.locals.accountId)}));}catch(error){next(error);}});
router.post('/account/password',sensitiveAccountLimit,async(req,res,next)=>{try{const parsed=z.object({current_password:z.string(),password}).safeParse(req.body);if(!parsed.success){res.status(400).json(errorResponse('VALIDATION_ERROR','Use a password of at least 12 characters.'));return;}const auth=accountAuthClient();const login=await auth.auth.signInWithPassword({email:res.locals.accountEmail,password:parsed.data.current_password});if(login.error){res.status(401).json(errorResponse('REAUTH_REQUIRED','Your current password is incorrect.'));return;}const update=await auth.auth.updateUser({password:parsed.data.password});if(update.error)throw update.error;res.json(successResponse({updated:true}));}catch(error){next(error);}});
router.post('/account/delete',sensitiveAccountLimit,async(req,res,next)=>{try{
 const parsed=z.object({password:z.string().min(1).max(128)}).safeParse(req.body);if(!parsed.success){res.status(400).json(errorResponse('VALIDATION_ERROR','Confirm your password to delete the account.'));return;}
 const auth=accountAuthClient();const verified=await auth.auth.signInWithPassword({email:res.locals.accountEmail,password:parsed.data.password});
 if(verified.error||verified.data.user?.id!==res.locals.accountId){res.status(401).json(errorResponse('REAUTH_REQUIRED','Your password is incorrect.'));return;}
 const marked=await supabase.rpc('begin_account_deletion',{p_account:res.locals.accountId});if(marked.error)throw marked.error;
 await disconnectAccount(res.locals.accountId);
 await deleteAccountRooms(res.locals.accountId);
 const deleted=await supabase.auth.admin.deleteUser(res.locals.accountId);if(deleted.error)throw deleted.error;
 clearAccountCookies(res);res.json(successResponse({deleted:true}));
 }catch(error){next(error);}});
const avatarUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:0}}).single('file');
router.post('/account/avatar',uploadCapacity,(req,res,next)=>{avatarUpload(req,res,error=>{if(error){res.locals.releaseUpload?.();res.status(400).json(errorResponse('AVATAR_INVALID','Choose one PNG, JPEG or WebP image up to 2 MiB.'));return;}next();});},async(req,res,next)=>{try{
 if(!req.file||!validAvatar(req.file)){res.status(400).json(errorResponse('AVATAR_INVALID','Choose a valid PNG, JPEG or WebP image up to 2 MiB.'));return;}
 res.locals.uploadProcessing=true;await uploadAvatar(res.locals.accountId,req.file);res.json(successResponse({profile:await profileFor(res.locals.accountId)}));
 }catch(error){next(error);}finally{res.locals.releaseUpload?.();}});
router.delete('/account/avatar',async(_req,res,next)=>{try{await clearAvatar(res.locals.accountId);res.json(successResponse({profile:await profileFor(res.locals.accountId)}));}catch(error){next(error);}});
router.get('/account/avatars/:username',async(req,res,next)=>{try{
 if(!validUsername(String(req.params.username))){res.status(404).end();return;}
 const target=await targetByUsername(String(req.params.username));if(!target){res.status(404).end();return;}
 if(target.id!==res.locals.accountId){const eligible=await eligibleProfile(res.locals.accountId,target.id);if(!eligible||!('avatar_url' in eligible)||!eligible.avatar_url){res.status(404).end();return;}}
 const profile=await supabase.from('profiles').select('avatar_file_path').eq('id',target.id).single();if(profile.error)throw profile.error;if(!profile.data.avatar_file_path){res.status(404).end();return;}
 const url=imagekit.url({path:profile.data.avatar_file_path,signed:true,expireSeconds:30});
 const upstream=await axios.get(url,{responseType:'stream',maxRedirects:0,timeout:env.IMAGEKIT_TIMEOUT_MS});
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type',String(upstream.headers['content-type']??'application/octet-stream'));res.setHeader('X-Content-Type-Options','nosniff');upstream.data.on('error',()=>res.destroy());upstream.data.pipe(res);
 }catch(error){next(error);}});
export default router;
