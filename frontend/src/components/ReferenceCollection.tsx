import React, { useState } from "react";

interface ReferenceItem {
  id: number;
  name: string;
  color: string;
}

interface ReferenceCollectionProps<T extends ReferenceItem> {
  items: T[];
  variant: "categories" | "tags";
  loading: boolean;
  canManage: boolean;
  onEdit: (item: T) => void;
  renderActions: (item: T) => React.ReactNode;
}

export function ReferenceCollection<T extends ReferenceItem>({ items, variant, loading, canManage, onEdit, renderActions }: ReferenceCollectionProps<T>) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("ru-RU");
  const filtered = items.filter((item) => item.name.toLocaleLowerCase("ru-RU").includes(query));

  return <section className="panel reference-collection">
    <div className="reference-toolbar">
      <label className="field reference-search">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по названию" aria-label="Поиск по названию" />
      </label>
      <span className="muted" role="status">{loading ? "Загрузка..." : `Показано: ${filtered.length} из ${items.length}`}</span>
    </div>
    {loading ? <div className="empty-state compact">Загрузка...</div>
      : items.length === 0 ? <div className="empty-state compact">{variant === "categories" ? "Категорий пока нет." : "Меток пока нет."}</div>
      : filtered.length === 0 ? <div className="empty-state compact">По вашему запросу ничего не найдено.</div>
      : <div className="table-wrap reference-table-wrap"><table className="reference-table" aria-label={variant === "categories" ? "Категории" : "Метки"}>
        <thead><tr><th>Название</th>{canManage && <th className="actions-column" aria-label="Действия" />}</tr></thead>
        <tbody>
        {filtered.map((item) => {
          const content = variant === "categories"
            ? <><span className="category-dot" style={{ backgroundColor: item.color }} aria-hidden="true" /><span className="reference-name">{item.name}</span></>
            : <span className="tag-badge"><span className="reference-name">{item.name}</span></span>;
          return <tr key={item.id}><td>
            {canManage
              ? <button className="reference-open" type="button" onClick={() => onEdit(item)} aria-label={`Редактировать ${item.name}`}>{content}</button>
              : <div className="reference-open">{content}</div>}
            </td>{canManage && <td className="actions-column"><div className="table-icon-actions">{renderActions(item)}</div></td>}
          </tr>;
        })}
        </tbody></table></div>}
  </section>;
}
