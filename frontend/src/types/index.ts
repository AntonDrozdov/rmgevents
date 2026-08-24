export type PermissionCode =
  | "create_event"
  | "create_guest"
  | "create_group"
  | "approve_guest"
  | "create_user";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  events: EventOption[];
}

export interface EventOption {
  id: string;
  name: string;
  roleName: string;
}

export interface EventDto {
  id: string;
  name: string;
  description?: string | null;
  logoImageId?: string | null;
  ownerId: string;
  createdAt: string;
  isArchived: boolean;
}

export interface CreateEventRequest {
  name: string;
  description?: string;
  logoImageId?: string;
}

export interface EventDetailDto {
  id: string;
  name: string;
  description?: string | null;
  logoImageId?: string | null;
  ownerId: string;
  createdAt: string;
  currentUserProfile: UserProfileDto;
}

export interface UserProfileDto {
  userId: string;
  displayName: string;
  roleName: string;
  groupId: string;
  permissions: PermissionCode[];
}

export interface GroupDto {
  id: string;
  eventId: string;
  parentGroupId?: string | null;
  name: string;
  quota: number;
  usedQuota: number;
  availableQuota: number;
  children: GroupDto[];
  createdAt: string;
}

export interface CreateGroupRequest {
  name: string;
  quota: number;
  parentGroupId?: string | null;
}

export interface UpdateGroupRequest {
  name: string;
  quota: number;
}

export interface GroupTreeDto {
  id: string;
  name: string;
  quota: number;
  usedQuota: number;
  availableQuota: number;
  children: GroupTreeDto[];
}

export interface UserDto {
  id: string;
  loginId: string;
  eventId: string;
  roleId: string;
  groupId: string;
  displayName: string;
  createdAt: string;
}

export interface CreateUserRequest {
  username: string;
  displayName: string;
  roleId: string;
  groupId: string;
}

export interface GuestDto {
  id: string;
  eventId: string;
  groupId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: "pending" | "approved" | "rejected" | string;
  createdAt: string;
  approvedAt?: string | null;
}

export interface CreateGuestRequest {
  name: string;
  email?: string;
  phone?: string;
  groupId: string;
}

export interface ApproveGuestRequest {
  guestId: string;
  approve: boolean;
}

export interface AuthContextType {
  token: string | null;
  currentUser: UserProfileDto | null;
  currentEvent: EventOption | null;
  events: EventOption[];
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  selectEvent: (event: EventOption) => Promise<void>;
  refreshProfile: () => Promise<void>;
}
