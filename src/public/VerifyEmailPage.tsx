import { useRouter } from '@/lib/router';
import { Button } from '@/components/ui';
import { Mail } from 'lucide-react';

export function VerifyEmailPage() {
  const { navigate } = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <Mail className="h-8 w-8" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-slate-900">Check your inbox</h1>
        <p className="mb-8 text-slate-600">
          We've sent a verification link to your email address. Please click the link to activate your account.
        </p>
        <div className="space-y-4">
          <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
            I've verified my email
          </Button>
          <Button onClick={() => navigate('/')} variant="ghost" className="w-full text-slate-500">
            Back to home
          </Button>
        </div>
      </div>
    </div>
  );
}
