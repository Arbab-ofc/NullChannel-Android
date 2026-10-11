import type { RequestHandler } from 'express';
import { verifyAccountCookie } from '../services/account.service.js';
import { errorResponse } from '../utils/apiResponse.js';
export { verifyAccountCookie } from '../services/account.service.js';
export const requireAccount:RequestHandler=async(req,res,next)=>{
 try { const user=await verifyAccountCookie(req.headers.cookie,/\/account\/(me|delete)$/.test(req.originalUrl.split('?')[0]));
 if(!user){res.status(401).json(errorResponse('ACCOUNT_REQUIRED','Sign in to continue.'));return;}
 res.locals.accountId=user.id;res.locals.accountEmail=user.email; next();
 }catch(error){next(error);}
};
export const optionalAccountAuth:RequestHandler=async(req,res,next)=>{
 try{const user=await verifyAccountCookie(req.headers.cookie);if(user){res.locals.accountId=user.id;res.locals.accountEmail=user.email;}next();}catch(error){next(error);}
};
