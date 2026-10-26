import {createClient} from '@supabase/supabase-js';
/** Transient SERVER use only: autoconfirm signup cannot use SSR's forced PKCE.
 * Returned tokens are adopted into the existing HttpOnly SSR cookie client. */
export function passwordSignUp(config:{url:string;key:string},input:{email:string;password:string;name?:string},fetcher:typeof fetch=fetch){
 const client=createClient(config.url,config.key,{auth:{flowType:'implicit',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetcher}});
 return client.auth.signUp({email:input.email,password:input.password,options:{data:{display_name:input.name??'Officer applicant'}}});
}
