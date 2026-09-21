'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { ORCHARD_ROLES, ROLE_LABEL, ROLE_DESCRIPTION, type OrchardRole } from '@/lib/roles';
import type { Person } from '@/lib/db/people';

/**
 * Who can reach what, across the whole system.
 *
 * Two kinds of access are shown side by side because they answer
 * different questions: a global level reaches every orchard including
 * ones that do not exist yet, while a membership reaches exactly one. A
 * person's level on an orchard is the higher of the two, so the
 * memberships column is worth reading as "and also, specifically".
 */
export default function AccessConsole({
  initialPeople,
  orchards,
  yourUserId,
}: {
  initialPeople: Person[];
  orchards: Array<{ id: string; name: string }>;
  yourUserId: string;
}) {
  const [people, setPeople] = useState(initialPeople);
  const [busy, setBusy] = useState<string | null>(null);

  async function setGlobal(person: Person, role: OrchardRole | null) {
    setBusy(person.userId);
    const previous = people;
    // Optimistic: the select should not snap back while the call is in flight
    setPeople((prev) =>
      prev.map((p) => (p.userId === person.userId ? { ...p, globalRole: role } : p))
    );
    try {
      await trpc.access.setGlobalRole.mutate({ userId: person.userId, role });
      const who = person.name ?? person.email ?? 'They';
      toast.success(
        role === null
          ? `${who} no longer has a system-wide level.`
          : `${who} is now a global ${ROLE_LABEL[role].toLowerCase()}.`
      );
    } catch (e) {
      setPeople(previous);
      toast.error(e instanceof Error ? e.message : 'Could not change that');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-bark">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Person</th>
              <th scope="col" className="px-4 py-2.5 font-medium w-48">Every orchard</th>
              <th scope="col" className="px-4 py-2.5 font-medium">And specifically</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {people.map((person) => {
              const isYou = person.userId === yourUserId;
              return (
                <tr key={person.userId} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">
                      {person.name ?? person.email ?? person.userId}
                      {isYou && <span className="ml-1.5 text-bark font-normal">(you)</span>}
                    </p>
                    {person.name && person.email && (
                      <p className="text-xs text-bark">{person.email}</p>
                    )}
                    <p className="survey-caption text-bark/60 mt-0.5">
                      {person.lastSignInAt
                        ? `last in ${person.lastSignInAt.slice(0, 10)}`
                        : 'never signed in'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`global-${person.userId}`}>
                      System-wide level for {person.name ?? person.userId}
                    </label>
                    <select
                      id={`global-${person.userId}`}
                      value={person.globalRole ?? ''}
                      disabled={busy === person.userId}
                      onChange={(e) =>
                        setGlobal(person, e.target.value === '' ? null : (e.target.value as OrchardRole))
                      }
                      className="w-full px-2 py-1.5 text-sm rounded-md border border-line bg-surface text-ink disabled:opacity-50"
                    >
                      <option value="">No system-wide level</option>
                      {ORCHARD_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]} — every orchard
                        </option>
                      ))}
                    </select>
                    {busy === person.userId && (
                      <Loader2 size={13} className="animate-spin mt-1 text-bark" aria-hidden />
                    )}
                    {person.globalRole && (
                      <p className="text-xs text-bark mt-1">{ROLE_DESCRIPTION[person.globalRole]}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {person.memberships.length === 0 ? (
                      <span className="text-bark/60 text-xs">
                        {person.globalRole ? 'Nothing extra needed' : 'No orchards yet'}
                      </span>
                    ) : (
                      <ul className="space-y-0.5">
                        {person.memberships.map((m) => (
                          <li key={m.orchardId} className="text-xs">
                            <Link
                              href={`/orchard/${m.orchardId}/members`}
                              className="text-canopy-700 hover:underline"
                            >
                              {m.orchardName}
                            </Link>
                            <span className="text-bark"> · {ROLE_LABEL[m.role]}</span>
                            {person.globalRole &&
                              !roleBeats(m.role, person.globalRole) && (
                                <span className="text-bark/60"> (covered by their global level)</span>
                              )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-2">Set someone&rsquo;s level on one orchard</h2>
        <p className="text-sm text-bark mb-3">
          Each orchard keeps its own list of people. An orchard&rsquo;s admins manage it themselves —
          they can invite and remove within their orchard, and cannot see any other.
        </p>
        <ul className="flex flex-wrap gap-2">
          {orchards.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orchard/${o.id}/members`}
                className="inline-flex px-3 py-1.5 rounded-lg border border-line bg-surface text-sm text-ink hover:bg-canopy-50"
              >
                {o.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** True when `role` grants at least as much as `other`. */
function roleBeats(role: OrchardRole, other: OrchardRole): boolean {
  return ORCHARD_ROLES.indexOf(role) > ORCHARD_ROLES.indexOf(other);
}
