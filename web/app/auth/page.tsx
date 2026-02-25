import type { Metadata } from 'next';
import { AuthContent } from './auth-content';

export const metadata: Metadata = {
  title: 'Sign in',
};

export default function AuthPage() {
  return <AuthContent />;
}
