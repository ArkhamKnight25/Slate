import { ImportForm } from "@/components/import-form";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-card hero-copy">
          <div className="eyebrow">Write anywhere, without the paste pain</div>
          <h1>NotesManager</h1>
          <p>
            Enter your access code, pick any page from your workspace, paste
            your notes — and they land perfectly formatted, in API-safe chunks.
          </p>
        </div>

        <aside className="hero-card hero-side">
          <div className="stat">
            <strong>Markdown-aware</strong>
            <span>
              Headings, bold, inline code, code blocks, lists, and quotes are
              all preserved exactly as structured — not flattened into plain text.
            </span>
          </div>
          <div className="stat">
            <strong>Smart paste</strong>
            <span>
              Copy from anywhere — the app reads the rich HTML from your
              clipboard and converts it to clean markdown automatically.
            </span>
          </div>
        </aside>
      </section>

      <section className="main-grid">
        <div className="panel">
          <h2>Import</h2>
          <p>
            Enter your access code, pick a page, then paste your content.
            Switch between Markdown, bullets, or paragraph mode depending
            on what you&apos;re importing.
          </p>
          <ImportForm />
        </div>

        <div className="stack">
          <section className="panel">
            <h2>Setup</h2>
            <div className="steps">
              <div className="step">
                <strong>1. Enter your access code</strong>
                <span>
                  Use the shared access code for this deployment, or paste
                  your own integration token to use your personal connection.
                </span>
              </div>
              <div className="step">
                <strong>2. Pick a page</strong>
                <span>
                  All pages your integration can reach are listed. You can
                  also create a new sub-page directly from here.
                </span>
              </div>
              <div className="step">
                <strong>3. Paste and send</strong>
                <span>
                  Paste your content — copied from anywhere. The app detects
                  formatting from the clipboard and appends structured blocks.
                </span>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Notes</h2>
            <ul>
              <li>Text is split into safe chunks so large pastes never hit size limits.</li>
              <li>Markdown mode maps headings, lists, code fences, and quotes to native blocks.</li>
              <li>Pasting rich HTML (e.g. from a browser) auto-converts to markdown before sending.</li>
              <li>Bring your own token or use the shared one — your choice per request.</li>
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
