import { useState } from 'react';
import { useWorkspace } from '@/lib/workspace';
import { Button, Field, TextInput, Card } from '@/components/ui';
import { Building2, ArrowRight } from 'lucide-react';

export function WorkspaceBootstrap() {
  const { bootstrapWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setBusy(true);
    const { error } = await bootstrapWorkspace(name.trim());
    setBusy(false);
    if (error) setError(error);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Create your workspace</h1>
          <p className="mt-1 text-sm text-slate-500">
            A workspace represents your business in Kanishk One. All clients, quotations, invoices and payments belong to it.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Business name" required hint="This appears on quotations and invoices.">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your company name" autoFocus />
          </Field>
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Creating…' : <>Create workspace <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </form>
      </Card>
    </div>
  );
}
