export interface Placement {
  id: number;
  parentId: number | null;
  groupId: number | null;
  name: string;
  quota: number | null;
  guestCount: number;
  occupiedSeatNumbers: number[];
  displayChildrenAsRows: boolean;
  canvasX: number | null;
  canvasY: number | null;
  canvasWidth: number | null;
  canvasHeight: number | null;
  color: string | null;
  seatLabels: Record<number, string>;
  rowBatchId: string | null;
  isRow: boolean;
  isLabel: boolean;
  fontSize?: number | null;
  rotation?: number;
  seatStartNumber?: number;
  seatNumberingReversed?: boolean;
  seatName?: string | null;
}
export interface PlacementInput {
  name: string;
  parentId: number | null;
  groupId: number | null;
  quota: number | null;
  count?: number;
  startNumber?: number;
  displayChildrenAsRows?: boolean;
  canvasX?: number | null;
  canvasY?: number | null;
  canvasWidth?: number | null;
  canvasHeight?: number | null;
  color?: string | null;
  isRow?: boolean;
  isLabel?: boolean;
  fontSize?: number | null;
  rotation?: number;
  seatStartNumber?: number;
  seatNumberingReversed?: boolean;
  seatName?: string | null;
  preserveRowBatch?: boolean;
}
export interface PlacementGuest {
  id: number; name: string; categoryName: string | null; groupId: number; groupName: string; placementId: number | null; seatNumber: number | null;
}
export interface PlacementTemplate { id: number; name: string; createdAt: string }
