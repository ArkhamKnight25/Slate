"use client";

import { useMemo, useState } from "react";
import type { ImportMode } from "@/lib/notion";
import { htmlToMarkdown } from "@/lib/html-to-markdown";

type Page = { id: string; title: string; url: string };

type SubmitState =
  | { status: "idle"; message: "" }
  | { status: "success" | "error"; message: string; blockCount?: number; batchCount?: number };

const initialState: SubmitState = { status: "idle", message: "" };

export function ImportForm() {
  const [accessCode, setAccessCode] = useState("");
  const [notionToken, setNotionToken] = useState("");
  const [pages, setPages] = useState<Page[] | null>(null);
  const [pageFilter, setPageFilter] = useState("");
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ImportMode>("markdown");
  const [isFetchingPages, setIsFetchingPages] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [result, setResult] = useState<SubmitState>(initialState);

  // New-page creation state
  const [showNewPage, setShowNewPage] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPageParentId, setNewPageParentId] = useState("");
  const [newPageParentFilter, setNewPageParentFilter] = useState("");
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [createError, setCreateError] = useState("");

  const filteredPages = useMemo(() => {
    if (!pages) return [];
    const q = pageFilter.toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => p.title.toLowerCase().includes(q));
  }, [pages, pageFilter]);

  const filteredParentPages = useMemo(() => {
    if (!pages) return [];
    const q = newPageParentFilter.toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => p.title.toLowerCase().includes(q));
  }, [pages, newPageParentFilter]);

  const stats = useMemo(() => {
    const normalized = text.replace(/\r\n/g, "\n");
    const characters = normalized.length;
    const lines = normalized
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean).length;
    const paragraphs = normalized
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean).length;
    return { characters, lines, paragraphs };
  }, [text]);

  async function fetchPages() {
    if (!accessCode && !notionToken) return;
    setIsFetchingPages(true);
    setFetchError("");
    setPages(null);
    setSelectedPage(null);
    setResult(initialState);
    setShowNewPage(false);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode, notionToken })
      });
      const data = (await res.json()) as { pages?: Page[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to fetch pages.");
      setPages(data.pages ?? []);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch pages.");
    } finally {
      setIsFetchingPages(false);
    }
  }

  async function handleCreatePage() {
    if (!newPageParentId) return;
    setIsCreatingPage(true);
    setCreateError("");
    try {
      const res = await fetch("/api/pages/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newPageTitle,
          parentPageId: newPageParentId,
          accessCode,
          notionToken
        })
      });
      const data = (await res.json()) as { id?: string; url?: string; title?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create page.");
      const newPage: Page = {
        id: data.id!,
        url: data.url!,
        title: data.title || newPageTitle || "Untitled"
      };
      setPages((prev) => (prev ? [newPage, ...prev] : [newPage]));
      setSelectedPage(newPage);
      setShowNewPage(false);
      setNewPageTitle("");
      setNewPageParentId("");
      setNewPageParentFilter("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create page.");
    } finally {
      setIsCreatingPage(false);
    }
  }

  function handleAccessCodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      fetchPages();
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPage) return;
    setIsSubmitting(true);
    setResult(initialState);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl: selectedPage.url,
          text,
          mode,
          accessCode,
          notionToken
        })
      });
      const payload = (await response.json()) as {
        error?: string;
        success?: boolean;
        blockCount?: number;
        batchCount?: number;
        authMode?: "personal-token" | "shared-token";
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Import failed.");
      }
      setResult({
        status: "success",
        message:
          payload.authMode === "personal-token"
            ? "Content appended using the token you supplied."
            : "Content appended using the shared server token.",
        blockCount: payload.blockCount,
        batchCount: payload.batchCount
      });
    } catch (error) {
      setResult({
        status: "error",
        message:
          error instanceof Error ? error.message : "Something went wrong while talking to Notion."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedParentPage = pages?.find((p) => p.id === newPageParentId);

  return (
    <div className="stack">
      {/* Step 1: Credentials */}
      <div className="field">
        <label htmlFor="accessCode">Access code</label>
        <div className="input-action-row">
          <input
            id="accessCode"
            className="input"
            type="password"
            autoComplete="off"
            placeholder="Enter access code and press Enter to load pages"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            onKeyDown={handleAccessCodeKeyDown}
          />
          <button
            type="button"
            className="load-btn"
            onClick={fetchPages}
            disabled={isFetchingPages || (!accessCode && !notionToken)}
          >
            {isFetchingPages ? "Loading…" : "Load pages"}
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="notionToken">
          Your Notion token{" "}
          <span className="label-hint">(optional — replaces shared token)</span>
        </label>
        <input
          id="notionToken"
          className="input"
          type="password"
          autoComplete="off"
          placeholder="Paste your own integration token"
          value={notionToken}
          onChange={(e) => setNotionToken(e.target.value)}
          onKeyDown={handleAccessCodeKeyDown}
        />
      </div>

      {fetchError && <div className="alert alert-error">{fetchError}</div>}

      {/* Step 2: Page picker */}
      {pages !== null && (
        <div className="field">
          <div className="page-picker-header">
            <label>
              Choose a page to append to{" "}
              <span className="label-hint">({pages.length} accessible)</span>
            </label>
            <button
              type="button"
              className="new-page-btn"
              onClick={() => {
                setShowNewPage((v) => !v);
                setCreateError("");
              }}
            >
              {showNewPage ? "Cancel" : "+ New page"}
            </button>
          </div>

          {/* Inline new-page form */}
          {showNewPage && (
            <div className="new-page-panel">
              <div className="field">
                <label htmlFor="newPageTitle">New page title</label>
                <input
                  id="newPageTitle"
                  className="input"
                  type="text"
                  placeholder="Untitled"
                  value={newPageTitle}
                  onChange={(e) => setNewPageTitle(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Parent page <span className="label-hint">(integration must have access to it)</span></label>
                <input
                  className="input"
                  placeholder="Filter to find parent…"
                  value={newPageParentFilter}
                  onChange={(e) => setNewPageParentFilter(e.target.value)}
                />
                {selectedParentPage && (
                  <div className="selected-parent-banner">
                    Parent: <strong>{selectedParentPage.title}</strong>
                    <button
                      type="button"
                      className="change-page-btn"
                      onClick={() => { setNewPageParentId(""); setNewPageParentFilter(""); }}
                    >
                      Clear
                    </button>
                  </div>
                )}
                {!selectedParentPage && (
                  <div className="page-list page-list--short">
                    {filteredParentPages.length === 0 ? (
                      <div className="page-empty">No pages match.</div>
                    ) : (
                      filteredParentPages.map((page) => (
                        <button
                          key={page.id}
                          type="button"
                          className={`page-item${newPageParentId === page.id ? " page-item--selected" : ""}`}
                          onClick={() => { setNewPageParentId(page.id); setNewPageParentFilter(""); }}
                        >
                          <span className="page-icon">{newPageParentId === page.id ? "✓" : "□"}</span>
                          <span className="page-title">{page.title}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {createError && <div className="alert alert-error">{createError}</div>}

              <button
                type="button"
                className="submit"
                onClick={handleCreatePage}
                disabled={isCreatingPage || !newPageParentId}
              >
                {isCreatingPage ? "Creating…" : "Create page"}
              </button>
            </div>
          )}

          <input
            className="input"
            placeholder="Filter pages by name…"
            value={pageFilter}
            onChange={(e) => setPageFilter(e.target.value)}
          />
          <div className="page-list">
            {filteredPages.length === 0 ? (
              <div className="page-empty">No pages match.</div>
            ) : (
              filteredPages.map((page) => {
                const isSelected = selectedPage?.id === page.id;
                return (
                  <button
                    key={page.id}
                    type="button"
                    className={`page-item${isSelected ? " page-item--selected" : ""}`}
                    onClick={() => {
                      setSelectedPage(page);
                      setResult(initialState);
                    }}
                  >
                    <span className="page-icon">{isSelected ? "✓" : "□"}</span>
                    <span className="page-title">{page.title}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Step 3: Text input + submit */}
      {selectedPage && (
        <form className="stack" onSubmit={handleSubmit}>
          <div className="selected-page-banner">
            <span className="selected-page-label">Appending to</span>
            <strong className="selected-page-name">{selectedPage.title}</strong>
            <button
              type="button"
              className="change-page-btn"
              onClick={() => setSelectedPage(null)}
            >
              Change
            </button>
          </div>

          <div className="field">
            <label htmlFor="mode">Import mode</label>
            <select
              id="mode"
              className="select"
              value={mode}
              onChange={(e) => setMode(e.target.value as ImportMode)}
            >
              <option value="markdown">Markdown — headings, bold, lists, code blocks</option>
              <option value="bullets">Each non-empty line becomes a bullet</option>
              <option value="paragraphs">Blank lines split paragraphs</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="text">Big text payload</label>
            <textarea
              id="text"
              className="textarea"
              placeholder="Paste the full text here. The app will break it into Notion-safe blocks."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const html = e.clipboardData.getData("text/html");
                if (!html) return;
                e.preventDefault();
                const md = htmlToMarkdown(html);
                setText((prev) => prev + md);
                setMode("markdown");
              }}
              required
            />
          </div>

          <div className="mini-grid">
            <div className="mini-card">
              <strong>{stats.characters.toLocaleString()}</strong>
              <span>characters detected</span>
            </div>
            <div className="mini-card">
              <strong>{stats.lines.toLocaleString()}</strong>
              <span>non-empty lines</span>
            </div>
            <div className="mini-card">
              <strong>{stats.paragraphs.toLocaleString()}</strong>
              <span>paragraph groups</span>
            </div>
          </div>

          {result.status === "error" && (
            <div className="alert alert-error">{result.message}</div>
          )}

          {result.status === "success" && (
            <div className="alert alert-success">
              {result.message} Added {result.blockCount?.toLocaleString()} blocks in{" "}
              {result.batchCount?.toLocaleString()} request
              {result.batchCount === 1 ? "" : "s"}.
            </div>
          )}

          <button className="submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending to Notion…" : "Append to Notion page"}
          </button>
        </form>
      )}
    </div>
  );
}
