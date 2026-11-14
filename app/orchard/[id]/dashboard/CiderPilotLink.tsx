'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Apple } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { formatYMD, dateToYMD } from '@/lib/dates';
import type { CiderPilotStatus } from '@/lib/db/ciderpilot';

/**
 * Whether this orchard's harvests go to the cidery that buys them.
 *
 * Off by default, like the programmes above it: most orchards here belong
 * to other people, and where their fruit is reported is theirs to say. The
 * cidery has to agree too -- it refuses picks from an orchard it has not
 * linked to a vendor -- so this card says which of the two is still to do.
 *
 * Shown to the orchard's admins only. Prices are never shown here: they
 * belong to the cidery.
 */
export default function CiderPilotLink({ orchardId }: { orchardId: string }) {
  const [status, setStatus] = useState<CiderPilotStatus | null>(null);
  const [busy, setBusy] = useState<'toggle' | 'send' | null>(null);

  // Bumped to read the status again after a change.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    trpc.ciderpilot.status
      .query({ orchardId })
      .then((next) => {
        if (live) setStatus(next);
      })
      // Not an admin, or the orchard is gone: the card simply does not show.
      .catch(() => {
        if (live) setStatus(null);
      });
    return () => {
      live = false;
    };
  }, [orchardId, version]);
  const reload = () => setVersion((v) => v + 1);

  // Nothing to offer on a deployment with no cidery connected.
  if (!status || !status.connected) return null;

  async function toggle(next: boolean) {
    setBusy('toggle');
    try {
      await trpc.ciderpilot.setEnabled.mutate({
        orchardId,
        enabled: next,
        today: dateToYMD(new Date()),
      });
      toast.success(
        next
          ? 'Harvests recorded from today are sent to the cidery.'
          : 'Sending is off. What the cidery already holds stays there.',
      );
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change that');
    } finally {
      setBusy(null);
    }
  }

  async function sendNow() {
    setBusy('send');
    try {
      const result = await trpc.ciderpilot.syncNow.mutate({ orchardId });
      const parts = [
        result.sent > 0 ? `${result.sent} sent` : null,
        result.withdrawn > 0 ? `${result.withdrawn} taken back` : null,
        result.locked > 0 ? `${result.locked} already received` : null,
      ].filter(Boolean);
      toast.success(parts.length > 0 ? parts.join(', ') : 'Nothing new to send.');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reach the cidery');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="bg-surface border border-line rounded-lg shadow-xs p-5 mt-4">
      <p className="survey-caption">Cidery</p>
      <div className="mt-2 flex items-start gap-3">
        <Apple aria-hidden size={18} className="mt-0.5 shrink-0 text-bark" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Send harvests to CiderPilot</p>
          <p className="text-xs text-bark">
            Each pick recorded here appears at the cidery, to be weighed and received there.
            Undoing a pick takes it back, until the cidery has received it.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={status.enabled}
          aria-label="Send harvests to CiderPilot"
          disabled={busy !== null}
          onClick={() => toggle(!status.enabled)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
            status.enabled
              ? 'bg-canopy-600 border-canopy-600 text-white hover:bg-canopy-700'
              : 'bg-paper border-line text-bark hover:bg-canopy-50'
          }`}
        >
          {busy === 'toggle' ? '…' : status.enabled ? 'On' : 'Off'}
        </button>
      </div>

      {status.enabled && (
        <div className="mt-4 border-t border-line pt-4 space-y-3">
          {status.problem ? (
            <p className="text-sm text-status-dead">
              The cidery could not be asked: {status.problem}
            </p>
          ) : status.vendorName ? (
            <p className="text-sm text-ink">
              The cidery buys this orchard&apos;s fruit from{' '}
              <span className="font-medium">{status.vendorName}</span>.
            </p>
          ) : (
            <p className="text-sm text-ink">
              The cidery has not linked this orchard yet. Ask its admin to link the orchard id{' '}
              <code className="font-mono text-xs bg-paper border border-line rounded px-1 py-0.5">
                {orchardId}
              </code>{' '}
              to a vendor, under Purchasing → Orchard Deliveries. Until then picks wait here.
            </p>
          )}

          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-bark">Waiting at the cidery</dt>
              <dd className="font-mono text-ink">{status.waiting}</dd>
            </div>
            <div>
              <dt className="text-xs text-bark">Received by the cidery</dt>
              <dd className="font-mono text-ink">{status.received}</dd>
            </div>
            <div>
              <dt className="text-xs text-bark">Still to send</dt>
              <dd className="font-mono text-ink">{status.toSend}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={sendNow}
              disabled={busy !== null}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-canopy-600 text-white hover:bg-canopy-700 disabled:opacity-50"
            >
              {busy === 'send' ? 'Sending…' : 'Send now'}
            </button>
            {status.since && (
              <p className="text-xs text-bark">
                Harvests dated {formatYMD(status.since)} or later are sent. Picks are sent
                as they are recorded; this sends anything that did not get through.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
