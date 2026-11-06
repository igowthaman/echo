import type { Metadata } from 'next';
import RegisterForm from './register-form';

export const metadata: Metadata = { title: 'Create an account · Echo' };

export default function RegisterPage() {
  return <RegisterForm />;
}
