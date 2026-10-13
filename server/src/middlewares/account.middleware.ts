import type { RequestHandler } from 'express';
import { accountAuthClient, verifyAccountCookie } from '../services/account.service.js';
import { mobileAccountActive, verifyMobileAccess } from '../services/mobile-auth.service.js';
import { env } from '../config/env.js';
import { errorResponse } from '../utils/apiResponse.js';
export { verifyAccountCookie } from '../services/account.service.js';
const bearer=(value:string|undefined)=>value?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
const nativeAccount=async(req:Parameters<RequestHandler>[0],allowDeleting:boolean)=>{
 if(req.headers.origin!==env.MOBILE_APP_ORIGIN)return null;
 const principal=await verifyMobileAccess(bearer(req.headers.authorization));
 if(!principal?.accountId)return null;
 if(!allowDeleting&&!await mobileAccountActive(principal.accountId))return null;
 return principal.accountId;
};
export const requireAccount:RequestHandler=async(req,res,next)=>{
 try { const allowDeleting=/\/account\/(me|delete)$/.test(req.originalUrl.split('?')[0]);const mobileId=await nativeAccount(req,allowDeleting);if(mobileId){res.locals.accountId=mobileId;if(/\/account\/(password|delete)$/.test(req.originalUrl.split('?')[0])){const user=await accountAuthClient().auth.admin.getUserById(mobileId);if(user.error||!user.data.user?.email){res.status(401).json(errorResponse('ACCOUNT_REQUIRED','Sign in to continue.'));return;}res.locals.accountEmail=user.data.user.email;}next();return;}const user=await verifyAccountCookie(req.headers.cookie,allowDeleting);
 if(!user){res.status(401).json(errorResponse('ACCOUNT_REQUIRED','Sign in to continue.'));return;}
 res.locals.accountId=user.id;res.locals.accountEmail=user.email; next();
 }catch(error){next(error);}
};
export const optionalAccountAuth:RequestHandler=async(req,res,next)=>{
 try{const mobileId=await nativeAccount(req,false);if(mobileId){res.locals.accountId=mobileId;next();return;}const user=await verifyAccountCookie(req.headers.cookie);if(user){res.locals.accountId=user.id;res.locals.accountEmail=user.email;}next();}catch(error){next(error);}
};
