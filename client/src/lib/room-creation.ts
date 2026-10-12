/** Only confirmed creation handlers use this transient client-side navigation marker. */
export function roomCreationTarget(code:unknown){
 if(typeof code!=='string'||!code.trim())throw new Error('Incomplete room creation response');
 return {path:`/chat/${code}`,state:{roomCreated:true}};
}
