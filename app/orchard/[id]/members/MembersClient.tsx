'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Mail, UserPlus, X } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { ORCHARD_ROLES, ROLE_DESCRIPTION, ROLE_LABEL, type OrchardRole } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Member {
  userId: string;
  role: OrchardRole;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  createdAt: string;
}

interface Pending {
  id: number;
  email: string;
  role: OrchardRole;
  createdAt: string;
}

export default function MembersClient({
  orchardId,
  initialMembers,
  initialPending,
  yourRole,
}: {
  orchardId: string;
  initialMembers: Member[];
  initialPending: Pending[];
  yourRole: OrchardRole;
}) {
  const router = useRouter();
  const isAdmin = yourRole === 'admin';

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrchardRole>('operator');
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    run('invite', async () => {
      const r = await trpc.members.invite.mutate({ orchardId, email: address, role });
      setEmail('');
      toast.success(
        r.emailSent
          ? `Invitation sent to ${address}.`
          : r.note ?? `${address} can now join this orchard.`
      );
    });
  }

  return (
    <div className="mt-6 space-y-8">
      {isAdmin && (
        <form
          onSubmit={invite}
          className="bg-surface border border-line rounded-lg shadow-xs p-5"
        >
          <p className="survey-caption">Invite someone</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[15rem]">
              <Label htmlFor="invite-email">Their email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                className="mt-1"
              />
            </div>
            <div className="w-40">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as OrchardRole)}>
                <SelectTrigger id="invite-role" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORCHARD_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={busy === 'invite' || !email.trim()}>
              {busy === 'invite' ? (
                <Loader2 className="animate-spin" size={15} aria-hidden />
              ) : (
                <UserPlus size={15} aria-hidden />
              )}
              Invite
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-bark">{ROLE_DESCRIPTION[role]}</p>
        </form>
      )}

      <section>
        <p className="survey-caption">
          {initialMembers.length} {initialMembers.length === 1 ? 'person' : 'people'}
        </p>
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {initialMembers.map((m) => (
            <li key={m.userId} className="py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[12rem]">
                <p className="text-sm font-medium text-ink">
                  {m.name ?? m.email ?? m.userId}
                </p>
                {m.email && m.name && <p className="text-[12px] text-bark">{m.email}</p>}
              </div>

              {isAdmin ? (
                <Select
                  value={m.role}
                  onValueChange={(v) =>
                    run(`role-${m.userId}`, async () => {
                      await trpc.members.setRole.mutate({
                        orchardId,
                        userId: m.userId,
                        role: v as OrchardRole,
                      });
                      toast.success(`${m.name ?? m.email ?? 'They'} are now ${ROLE_LABEL[v as OrchardRole].toLowerCase()}.`);
                    })
                  }
                  disabled={busy === `role-${m.userId}`}
                >
                  <SelectTrigger className="w-36" aria-label={`Role for ${m.name ?? m.userId}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORCHARD_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm text-bark">{ROLE_LABEL[m.role]}</span>
              )}

              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${m.name ?? m.userId}`}
                  disabled={busy === `remove-${m.userId}`}
                  onClick={() =>
                    run(`remove-${m.userId}`, async () => {
                      await trpc.members.remove.mutate({ orchardId, userId: m.userId });
                      toast.success('Removed.');
                    })
                  }
                >
                  <X size={15} aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && initialPending.length > 0 && (
        <section>
          <p className="survey-caption">Invited, not yet joined</p>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {initialPending.map((p) => (
              <li key={p.id} className="py-3 flex items-center gap-3">
                <Mail size={15} aria-hidden className="text-bark shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-ink">{p.email}</p>
                  <p className="text-[12px] text-bark">
                    {ROLE_LABEL[p.role]} once they sign in
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === `revoke-${p.id}`}
                  onClick={() =>
                    run(`revoke-${p.id}`, async () => {
                      await trpc.members.revokeInvitation.mutate({ orchardId, id: p.id });
                      toast.success('Invitation withdrawn.');
                    })
                  }
                >
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
