"use client";

/**
 * Share one IPO.
 *
 * On a phone this hands off to the operating system's own share sheet, which
 * is where WhatsApp already lives alongside every other app the reader has
 * installed. Listing apps ourselves would be guessing at that list and always
 * getting it wrong for somebody.
 *
 * Where there is no share sheet — most desktop browsers — it falls back to
 * the three destinations that cover almost all of it, plus a copy button.
 * Those are plain links to public share endpoints: no SDK, no embedded
 * button, nothing that reports back who looked at this page.
 *
 * What gets shared is a summary, not just a link. A bare URL in a WhatsApp
 * group tells nobody whether it is worth opening; the premium, the band and
 * the dates are the whole reason someone is forwarding it.
 */

import { useEffect, useRef, useState } from "react";

function encode(text) {
  return encodeURIComponent(text);
}

const TARGETS = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    href: (text, url) => `https://wa.me/?text=${encode(`${text}\n\n${url}`)}`,
    tone: "#25D366",
    icon: (
      <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.1 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-1.7-.1a11 11 0 0 1-5.9-5.2c-.4-.7-.7-1.5-.7-2.2 0-.8.4-1.4.7-1.7.2-.2.4-.3.6-.3h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.5l-.3.4c-.1.1-.2.3-.1.5.4.8 1.6 2 2.7 2.5.2.1.4.1.5-.1l.5-.6c.1-.2.3-.2.5-.1l1.6.8c.2.1.3.2.3.3v.4Z" />
    ),
  },
  {
    key: "telegram",
    label: "Telegram",
    href: (text, url) =>
      `https://t.me/share/url?url=${encode(url)}&text=${encode(text)}`,
    tone: "#2AABEE",
    icon: <path d="M21.9 4.3 18.8 19c-.2 1-.9 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7 8.5-7.7c.4-.3-.1-.5-.6-.2L6.9 12.1 2.3 10.7c-1-.3-1-1 .2-1.5l18-6.9c.8-.3 1.6.2 1.4 2Z" />,
  },
  {
    key: "x",
    label: "X",
    href: (text, url) =>
      `https://twitter.com/intent/tweet?text=${encode(text)}&url=${encode(url)}`,
    tone: "currentColor",
    icon: (
      <path d="M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1L4.7 21H1.5l7.5-8.6L1.1 3h6.6l4.5 5.6L17.5 3Zm-1.1 16.1h1.8L7.7 4.8H5.8l10.6 14.3Z" />
    ),
  },
];

export default function ShareButton({ title, summary, url }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Decided after mount: the server has no navigator, and rendering the
  // fallback menu on a phone that has a share sheet would be the wrong UI.
  const [native, setNative] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    setNative(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const escape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${summary}\n\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permission refused, or an insecure context. The links
      // beside this still work, so there is nothing worth interrupting for.
    }
  };

  const onClick = async () => {
    if (!native) {
      setOpen((v) => !v);
      return;
    }
    try {
      await navigator.share({ title, text: summary, url });
    } catch {
      // A cancelled share sheet rejects. That is the reader saying no, not
      // a failure, so it must not turn into an error or a fallback menu.
    }
  };

  return (
    <div className="share" ref={rootRef}>
      <button
        type="button"
        className="share-btn"
        onClick={onClick}
        aria-haspopup={native ? undefined : "menu"}
        aria-expanded={native ? undefined : open}
        aria-label={`Share ${title}`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M8.6 13.4 15.4 17M15.4 7 8.6 10.6M6 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm14-6.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm0 13a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        Share
      </button>

      {open && !native && (
        <div className="share-pop" role="menu">
          {TARGETS.map((target) => (
            <a
              key={target.key}
              className="share-item"
              href={target.href(summary, url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill={target.tone}
                aria-hidden="true"
              >
                {target.icon}
              </svg>
              {target.label}
            </a>
          ))}
          <button type="button" className="share-item" onClick={copy}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                d="M9 9V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H15M5.5 9h8A1.5 1.5 0 0 1 15 10.5v8A1.5 1.5 0 0 1 13.5 20h-8A1.5 1.5 0 0 1 4 18.5v-8A1.5 1.5 0 0 1 5.5 9Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {copied ? "Copied" : "Copy details"}
          </button>
        </div>
      )}
    </div>
  );
}
