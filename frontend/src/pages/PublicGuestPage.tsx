import React, { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import { PublicGuestDto } from "../types";
import { apiClient } from "../services/apiClient";

const labels: Record<string, string> = { saved: "Сохранён", on_review: "На согласовании", admin_review: "На согласовании у администратора", approved: "Согласован", invited: "Приглашён", rejected: "Отклонён" };

export const PublicGuestPage: React.FC = () => {
  const { publicId = "" } = useParams();
  const [guest, setGuest] = useState<PublicGuestDto | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { apiClient.getPublicGuest(publicId).then(setGuest).catch(err => setError(axios.isAxiosError(err) && err.response?.status === 404 ? "Карточка гостя не найдена." : "Не удалось загрузить карточку гостя.")); }, [publicId]);
  if (error) return <main className="public-guest-page"><section className="public-guest-card"><h1>{error}</h1></section></main>;
  if (!guest) return <main className="public-guest-page"><section className="public-guest-card">Загрузка карточки гостя…</section></main>;
  return <main className="public-guest-page"><section className="public-guest-card"><p className="public-guest-kicker">Карточка гостя</p><h1>{guest.name}</h1><dl><div><dt>Email</dt><dd>{guest.email || "—"}</dd></div><div><dt>Телефон</dt><dd>{guest.phone || "—"}</dd></div><div><dt>Группа</dt><dd>{guest.groupName || "—"}</dd></div><div><dt>Категория</dt><dd>{guest.categoryName || "—"}</dd></div><div><dt>Статус</dt><dd>{labels[guest.status] ?? guest.status}</dd></div></dl>{guest.tags.length > 0 && <div className="public-guest-tags">{guest.tags.map(tag => <span className="tag-badge" key={tag.id}>{tag.name}</span>)}</div>}</section></main>;
};
