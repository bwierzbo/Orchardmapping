'use client';

/**
 * The last boundary: errors thrown above app/error.tsx.
 *
 * app/error.tsx only catches what happens inside a route. An error in
 * the root layout — the auth provider, the theme provider, a hydration
 * failure of the whole document — escapes it, and without this file the
 * visitor gets Next's built-in text:
 *
 *   "Application error: a client-side exception has occurred while
 *    loading <host> (see the browser console for more information)"
 *
 * which names neither the page nor the fault. Somebody standing in an
 * orchard cannot open a browser console, so that message is the same as
 * no message. This one shows what actually broke, and the digest that
 * ties it to the server log.
 *
 * It replaces <html> and <body> because at this level the root layout is
 * exactly what has failed to render.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F5F6F1',
          color: '#14211A',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: '34rem', width: '100%' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 .5rem' }}>
            The app failed to start
          </h1>
          <p style={{ fontSize: '.875rem', color: '#5B6B5F', margin: '0 0 1rem' }}>
            This one is not your fault and not the orchard&apos;s. The details below are
            what a fix needs — copy them if you are reporting it.
          </p>

          <pre
            style={{
              fontSize: '.75rem',
              lineHeight: 1.5,
              background: '#fff',
              border: '1px solid #DCE0D8',
              borderRadius: '.5rem',
              padding: '.75rem',
              margin: '0 0 1rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowX: 'auto',
            }}
          >
            {error.name}: {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>

          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={reset}
              style={{
                padding: '.5rem 1rem',
                borderRadius: '.5rem',
                border: 0,
                background: '#2F6B3F',
                color: '#fff',
                fontSize: '.875rem',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            {/*
              A plain anchor on purpose, and the lint rule is wrong here:
              next/link navigates through the router, and at this level
              the router is part of what failed. A full page load is the
              only reliable way out.
            */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                padding: '.5rem 1rem',
                borderRadius: '.5rem',
                border: '1px solid #DCE0D8',
                background: '#fff',
                color: '#14211A',
                fontSize: '.875rem',
                textDecoration: 'none',
              }}
            >
              Reload the home page
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
