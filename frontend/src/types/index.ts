export type PermissionCode =
  | "create_event"
  | "create_guest"
  | "create_group"
  | "approve_guest"
  | "create_user";

export interface LoginRequest {
  login: string;
  password: string;
}

export interface LoginResponse {
  sid: string;
  events: EventOption[];
}

export interface EventOption {
  id: number;
  name: string;
  roleName: string;
}

export interface EventDto {
  id: number;
  name: string;
  description?: string | null;
  logoImageId?: number | null;
  ownerId: number;
  createdAt: string;
  isArchived: boolean;
}

export interface CreateEventRequest {
  name: string;
  description?: string;
  logoImageId?: number;
}

export interface EventDetailDto {
  id: number;
  name: string;
  description?: string | null;
  logoImageId?: number | null;
  ownerId: number;
  createdAt: string;
  currentUserProfile: UserProfileDto;
}

export interface UserProfileDto {
  userId: number;
  name: string;
  surname: string;
  additionalName?: string | null;
  email?: string | null;
  tel?: string | null;
  roleName: string;
  groupId: number;
  permissions: PermissionCode[];
}

export interface GroupDto {
  id: number;
  eventId: number;
  parentGroupId?: number | null;
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
  parentGroupId?: number | null;
}

export interface UpdateGroupRequest {
  name: string;
  quota: number;
}

export interface GroupTreeDto {
  id: number;
  name: string;
  quota: number;
  usedQuota: number;
  availableQuota: number;
  children: GroupTreeDto[];
}

export interface UserDto {
  id: number;
  eventId: number;
  roleName?: string | null;
  groupName?: string | null;
  name: string;
  surname: string;
  additionalName?: string | null;
  email?: string | null;
  tel?: string | null;
  createdAt: string;
}

export interface CreateUserRequest {
  loginId: number;
  name: string;
  surname: string;
  additionalName?: string;
  email?: string;
  tel?: string;
  roleId: number;
  groupId: number;
}

export interface UpdateUserRequest {
  name: string;
  surname: string;
  additionalName?: string;
  email?: string;
  tel?: string;
  roleId: number;
  groupId: number;
}

export interface GuestDto {
  id: number;
  eventId: number;
  groupId: number;
  groupName?: string | null;
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
  groupId: number;
}

export interface ApproveGuestRequest {
  guestId: number;
  approve: boolean;
}

export interface AuthContextType {
  token: string | null;
  loginName: string | null;
  currentUser: UserProfileDto | null;
  currentEvent: EventOption | null;
  events: EventOption[];
  login: (loginName: string, password: string) => Promise<void>;
  logout: () => void;
  selectEvent: (event: EventOption) => Promise<void>;
  addEvent: (event: EventOption) => void;
  refreshProfile: () => Promise<void>;
}
