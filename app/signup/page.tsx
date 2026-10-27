import {connection} from 'next/server';
import {AuthForm} from '@/components/auth-forms';
export default async function Signup(){await connection();return <AuthForm kind="signup" registrationEnabled={process.env.SYNAPSE_SIGNUP_ENABLED==='true'}/>;}
