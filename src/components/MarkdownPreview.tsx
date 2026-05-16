import { forwardRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

type MarkdownPreviewProps = {
  html: string;
  onKeyDownCapture: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
};

export const MarkdownPreview = forwardRef<HTMLDivElement, MarkdownPreviewProps>(
  function MarkdownPreview({ html, onKeyDownCapture, onPointerDown }, ref) {
    return (
      <section
        className="preview-pane"
        ref={ref}
        tabIndex={0}
        onKeyDownCapture={onKeyDownCapture}
        onPointerDown={onPointerDown}
      >
        <article className="preview-pane__card">
          <div className="preview-pane__content" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </section>
    );
  },
);