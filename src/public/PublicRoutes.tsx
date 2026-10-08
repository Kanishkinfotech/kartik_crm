import { PricingPage } from './PricingPage';
import { SignupPage } from './SignupPage';
import { VerifyEmailPage } from './VerifyEmailPage';
import { PublicHeader } from './PublicHeader';

export function PublicRoutes({ path }: { path: string }) {
  let content = null;
  if (path === '/pricing') content = <PricingPage />;
  else if (path === '/signup') content = <SignupPage />;
  else if (path === '/verify-email') content = <VerifyEmailPage />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PublicHeader />
      <main>{content}</main>
    </div>
  );
}
