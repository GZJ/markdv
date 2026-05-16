import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import "./App.css";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { TocSidebar } from "./components/TocSidebar";
import { renderMarkdown, type RenderedMarkdown } from "./lib/markdown";

type FileChangedPayload = {
  path: string;
};

type MarkdownDocument = {
  path: string;
  contents: string;
};

const SCROLL_STEP = 64;
const HALF_PAGE_RATIO = 0.5;
const G_SEQUENCE_TIMEOUT = 400;
const handledKeyEvents = new WeakSet<Event>();

function App() {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const gPendingRef = useRef(false);
  const gPendingTimerRef = useRef<number | null>(null);
  const filePathRef = useRef<string | null>(null);
  const reloadTimerRef = useRef<number | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [rendered, setRendered] = useState<RenderedMarkdown>(() =>
    renderMarkdown("# markdv\n\nUsage:\n\n```bash\nmarkdv demo.md\n```"),
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    setRendered(renderMarkdown(markdown || "# markdv\n\nUsage:\n\n```bash\nmarkdv demo.md\n```"));
  }, [markdown]);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        const launchPath = await invoke<string | null>("launch_markdown_path");
        if (!cancelled && launchPath) {
          await loadMarkdown(launchPath);
        }
      } catch {
        if (!cancelled) {
          setMarkdown("# markdv\n\nFailed to open the launch file.");
        }
      }
    };

    void setup();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (gPendingTimerRef.current) {
        window.clearTimeout(gPendingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen<FileChangedPayload>("markdown://changed", (event) => {
        if (!filePath || event.payload.path !== filePath) {
          return;
        }

        if (reloadTimerRef.current) {
          window.clearTimeout(reloadTimerRef.current);
        }

        reloadTimerRef.current = window.setTimeout(() => {
          void loadMarkdown(filePath, true);
        }, 150);
      });
    };

    void setup();

    return () => {
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
      }
      unlisten?.();
    };
  }, [filePath]);

  useEffect(() => {
    document.body.tabIndex = -1;
    document.documentElement.tabIndex = -1;
    window.focus();
    document.body.focus();
    previewRef.current?.focus();

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      handleViewerKeyInput(event);
    };

    document.addEventListener("keydown", handleDocumentKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown, true);
    };
  }, [filePath]);

  function focusPreview() {
    window.focus();
    document.body.focus();
    previewRef.current?.focus();
  }

  function clearPendingG() {
    gPendingRef.current = false;
    if (gPendingTimerRef.current) {
      window.clearTimeout(gPendingTimerRef.current);
      gPendingTimerRef.current = null;
    }
  }

  function isEditableTarget(target: EventTarget | null) {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement)
    );
  }

  function getScrollTop() {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  function getScrollHeight() {
    return Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      previewRef.current?.scrollHeight ?? 0,
    );
  }

  function scrollByAmount(amount: number) {
    window.scrollBy({ top: amount, left: 0, behavior: "auto" });
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function scrollToBottom() {
    window.scrollTo({ top: getScrollHeight(), left: 0, behavior: "auto" });
  }

  function handleViewerKeyInput(event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) {
    const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
    if (handledKeyEvents.has(nativeEvent)) {
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    const key = event.key;
    const code = "code" in event ? event.code : "";
    const isPlainKey = !event.ctrlKey && !event.altKey && !event.metaKey;
    const isShiftOnly = isPlainKey && event.shiftKey;

    if ((key === "g" || key === "G" || code === "KeyG") && isPlainKey && !event.shiftKey) {
      handledKeyEvents.add(nativeEvent);
      event.preventDefault();

      if (gPendingRef.current) {
        clearPendingG();
        scrollToTop();
        return;
      }

      gPendingRef.current = true;
      gPendingTimerRef.current = window.setTimeout(() => {
        clearPendingG();
      }, G_SEQUENCE_TIMEOUT);
      return;
    }

    clearPendingG();

    if ((key === "j" || key === "J" || code === "KeyJ") && isPlainKey && !event.shiftKey) {
      handledKeyEvents.add(nativeEvent);
      event.preventDefault();
      scrollByAmount(SCROLL_STEP);
      return;
    }

    if ((key === "k" || key === "K" || code === "KeyK") && isPlainKey && !event.shiftKey) {
      handledKeyEvents.add(nativeEvent);
      event.preventDefault();
      scrollByAmount(-SCROLL_STEP);
      return;
    }

    if ((key === "d" || key === "D" || code === "KeyD") && isPlainKey && !event.shiftKey) {
      handledKeyEvents.add(nativeEvent);
      event.preventDefault();
      scrollByAmount(window.innerHeight * HALF_PAGE_RATIO);
      return;
    }

    if ((key === "u" || key === "U" || code === "KeyU") && isPlainKey && !event.shiftKey) {
      handledKeyEvents.add(nativeEvent);
      event.preventDefault();
      scrollByAmount(-window.innerHeight * HALF_PAGE_RATIO);
      return;
    }

    if ((key === "G" || (code === "KeyG" && isShiftOnly)) && !event.ctrlKey && !event.altKey && !event.metaKey) {
      handledKeyEvents.add(nativeEvent);
      event.preventDefault();
      scrollToBottom();
      return;
    }

    if ((key === "t" || key === "T" || code === "KeyT") && isPlainKey && !event.shiftKey) {
      handledKeyEvents.add(nativeEvent);
      event.preventDefault();
      setIsSidebarOpen((value) => !value);
      return;
    }

    if ((key === "r" || key === "R" || code === "KeyR") && isPlainKey && !event.shiftKey && filePathRef.current) {
      handledKeyEvents.add(nativeEvent);
      event.preventDefault();
      void loadMarkdown(filePathRef.current, true);
    }
  }

  async function loadMarkdown(path: string, preserveScroll = false) {
    const scrollTop = preserveScroll ? getScrollTop() : 0;

    try {
      const document = await invoke<MarkdownDocument>("read_markdown", { path });
      setFilePath(document.path);
      setMarkdown(document.contents);

      const activeWatch = await invoke<string | null>("current_watch_path");
      if (activeWatch !== document.path) {
        await invoke<string>("watch_markdown", {
          path: document.path,
        });
      }

      if (preserveScroll) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" });
          focusPreview();
        });
      } else {
        requestAnimationFrame(() => {
          scrollToTop();
          focusPreview();
        });
      }
    } catch {
      setMarkdown("# markdv\n\nFailed to load the markdown file.");
    }
  }

  function handleTocSelect(id: string) {
    const element = previewRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (element instanceof HTMLElement) {
      previewRef.current?.focus();
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <main className="app-shell" onKeyDownCapture={handleViewerKeyInput} onPointerDownCapture={focusPreview}>
      <section className="workspace">
        {isSidebarOpen ? (
          <TocSidebar items={rendered.toc} onSelect={handleTocSelect} />
        ) : null}
        <MarkdownPreview
          ref={previewRef}
          html={rendered.html}
          onKeyDownCapture={handleViewerKeyInput}
          onPointerDown={focusPreview}
        />
      </section>
    </main>
  );
}

export default App;
