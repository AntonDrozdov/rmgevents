import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { GuestDto } from "../types";
import { TicketTemplateDto } from "../types";

export const guestPublicUrl = (publicId: string) => `${window.location.origin}/guest/${publicId}`;

export const guestQrDataUrl = (guest: Pick<GuestDto, "publicId">) => QRCode.toDataURL(guestPublicUrl(guest.publicId), {
  width: 420,
  margin: 1,
  errorCorrectionLevel: "M",
});

export const downloadGuestQrPdf = async (guest: GuestDto) => {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const qr = await guestQrDataUrl(guest);
  const canvas = document.createElement("canvas");
  canvas.width = 1700; canvas.height = 1050;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#18233b"; context.font = "bold 56px Arial, sans-serif"; context.fillText("Карточка гостя", 80, 110);
  context.font = "36px Arial, sans-serif";
  const lines = [
    `ФИО: ${guest.name}`,
    `Email: ${guest.email || "—"}`,
    `Телефон: ${guest.phone || "—"}`,
    `Группа: ${guest.groupName || "—"}`,
    `Категория: ${guest.categoryName || "—"}`,
    `Статус: ${guest.status}`,
  ];
  lines.forEach((line, index) => context.fillText(line, 80, 200 + index * 70));
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, 10, 190, 117);
  pdf.addImage(qr, "PNG", 68, 135, 75, 75);
  pdf.save(`guest-${guest.id}-qr.pdf`);
};

export const downloadGuestTicket = async (guest: GuestDto, template: TicketTemplateDto) => {
  const background = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = `/api/images/${template.backgroundImageId}`; });
  const canvas = document.createElement("canvas"); canvas.width = 2480; canvas.height = 3508;
  const context = canvas.getContext("2d")!; context.drawImage(background, 0, 0, canvas.width, canvas.height);
  context.fillStyle = "white"; context.beginPath(); context.roundRect(template.qrX, template.qrY, template.qrSize, template.qrSize, template.qrRadius); context.fill();
  const qr = await guestQrDataUrl(guest); const qrImage = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = qr; });
  const padding = Math.max(12, Math.round(template.qrSize * .06)); context.drawImage(qrImage, template.qrX + padding, template.qrY + padding, template.qrSize - padding * 2, template.qrSize - padding * 2);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" }); pdf.addImage(canvas.toDataURL("image/jpeg", .94), "JPEG", 0, 0, 210, 297); pdf.save(`ticket-${guest.id}.pdf`);
};
