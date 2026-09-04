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
  mustChangePassword: boolean;
}

export interface EventOption {
  id: number;
  name: string;
  roleName: string;
  eventDate?: string;
  createdAt?: string;
  createdByName?: string;
  logoImageId?: number | null;
}

export interface EventDto {
  id: number;
  name: string;
  description?: string | null;
  eventDate: string;
  createdByName: string;
  logoImageId?: number | null;
  ownerId: number;
  createdAt: string;
  isArchived: boolean;
}

export interface CreateEventRequest {
  name: string;
  eventDate: string;
  logoImageId?: number;
}

export interface UpdateEventRequest {
  name: string;
  description?: string | null;
  eventDate: string;
  logoImageId?: number | null;
}

export interface EventDetailDto {
  id: number;
  name: string;
  description?: string | null;
  eventDate: string;
  createdByName: string;
  logoImageId?: number | null;
  ownerId: number;
  createdAt: string;
  currentUserProfile: UserProfileDto;
}

export interface UserProfileDto {
  userId: number;
  login: string;
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

export interface RoleDto {
  id: number;
  eventId: number;
  name: string;
}

export interface UserDto {
  id: number;
  eventId: number;
  login: string;
  roleId: number;
  roleName?: string | null;
  groupId: number;
  groupName?: string | null;
  name: string;
  surname: string;
  additionalName?: string | null;
  email?: string | null;
  tel?: string | null;
  createdAt: string;
}

export interface UserSearchResultDto {
  id: number;
  login: string;
  name: string;
  surname: string;
  additionalName?: string | null;
  email?: string | null;
  tel?: string | null;
  roleName?: string | null;
  groupName?: string | null;
}

export interface CreateUserRequest {
  login: string;
  name: string;
  surname: string;
  additionalName?: string;
  email: string;
  tel?: string;
  roleId: number;
  groupId: number;
}

export interface UpdateUserRequest {
  login: string;
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
  status: "saved" | "on_review" | "admin_review" | "approved" | "invited" | "rejected" | string;
  createdAt: string;
  approvedAt?: string | null;
  decisions: GuestDecisionDto[];
}

export interface GuestDecisionDto {
  id: number;
  actorUserId?: number | null;
  action: "submitted_for_review" | "reviewer_approved" | "admin_approved" | "invited" | "rejected" | "restored_to_saved" | string;
  actorName: string;
  createdAt: string;
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

export interface UpdateGuestRequest extends CreateGuestRequest {}

export interface AuthContextType {
  token: string | null;
  loginName: string | null;
  mustChangePassword: boolean;
  currentUser: UserProfileDto | null;
  currentEvent: EventOption | null;
  events: EventOption[];
  login: (loginName: string, password: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
  selectEvent: (event: EventOption) => Promise<void>;
  addEvent: (event: EventOption) => void;
  updateEvent: (event: EventDto) => void;
  refreshProfile: () => Promise<void>;
}
