export interface Placement {
  id: number;
  parentId: number | null;
  groupId: number | null;
  name: string;
  quota: number | null;
  guestCount: number;
  occupiedSeatNumbers: number[];
  displayChildrenAsRows: boolean;
}
export interface PlacementInput {
  name: string;
  parentId: number | null;
  groupId: number | null;
  quota: number | null;
  count?: number;
  startNumber?: number;
  displayChildrenAsRows?: boolean;
}
export interface PlacementGuest {
  id: number; name: string; categoryName: string | null; groupId: number; groupName: string; placementId: number | null; seatNumber: number | null;
}
export interface PlacementTemplate { id: number; name: string; createdAt: string }
