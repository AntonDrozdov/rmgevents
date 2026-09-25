import React, { useEffect, useState } from "react";
import { GuestDto } from "../types";
import { downloadGuestQrPdf, guestQrDataUrl } from "../utils/guestQr";

export const GuestQrCode: React.FC<{ guest: GuestDto; compact?: boolean; small?: boolean }> = ({ guest, compact = false, small = false }) => {
  const [image, setImage] = useState("");
  useEffect(() => { let active = true; guestQrDataUrl(guest).then(value => { if (active) setImage(value); }); return () => { active = false; }; }, [guest]);
  return <div className={`guest-qr-code${compact ? " compact" : ""}${small ? " small" : ""}`}>
    {image ? <img src={image} alt={`QR-код гостя ${guest.name}`} /> : <span>Генерация QR-кода…</span>}
    {!compact && <button type="button" className="secondary-button" onClick={() => void downloadGuestQrPdf(guest)}>Скачать QR</button>}
  </div>;
};
