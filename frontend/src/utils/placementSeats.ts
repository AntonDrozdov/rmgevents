import type { Placement } from "../types/placements";

export const defaultSeatLabel = (placement: Placement, seatNumber: number): string => {
  if (placement.isLabel || placement.displayChildrenAsRows) return String(seatNumber);
  const offset = placement.seatNumberingReversed
    ? placement.isRow ? (placement.quota ?? 0) - seatNumber : ((placement.quota ?? 1) - seatNumber + 1) % (placement.quota || 1)
    : seatNumber - 1;
  const number = (placement.seatStartNumber ?? 1) + offset;
  return placement.seatName?.trim() ? `${placement.seatName.trim()} ${number}` : String(number);
};
export const seatLabel = (placement: Placement, seatNumber: number): string => placement.seatLabels?.[seatNumber] ?? defaultSeatLabel(placement, seatNumber);
