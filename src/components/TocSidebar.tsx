import type { TocItem } from "../lib/toc";

type TocSidebarProps = {
  items: TocItem[];
  onSelect: (id: string) => void;
};

export function TocSidebar({ items, onSelect }: TocSidebarProps) {
  return (
    <aside className="toc">
      <h2 className="toc__title">Contents</h2>
      {items.length === 0 ? (
        <p className="toc__empty">Headings will appear here once a markdown file is loaded.</p>
      ) : (
        <ul className="toc__list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                className="toc__item"
                onClick={() => onSelect(item.id)}
                style={{ paddingLeft: `${item.level * 12}px` }}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}