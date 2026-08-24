// Authentication
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

// Event
export interface EventDto {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  isArchived: boolean;
}

export interface CreateEventRequest {
  name: string;
  description?: string;
}

export interface EventDetailDto extends EventDto {
  roles: RoleDto[];
  groups: GroupDto[];
  users: UserDto[];
  guests: GuestDto[];
}

export interface UserProfileDto {
  userId: string;
  displayName: string;
  roleName: string;
  groupName: string;
  permissions: string[];
}

// Role
export interface RoleDto {
  id: string;
  eventId: string;
  name: string;
  permissions: PermissionDto[];
  createdAt: string;
}

export interface CreateRoleRequest {
  name: string;
  permissionCodes: string[];
}

export interface UpdateRoleRequest {
  name: string;
  permissionCodes: string[];
}

// Permission
export interface PermissionDto {
  id: string;
  code: string;
  description: string;
  createdAt: string;
}

// Group
export interface GroupDto {
  id: string;
  eventId: string;
  parentGroupId?: string;
  name: string;
  quota: number;
  usedQuota: number;
  availableQuota: number;
  createdAt: string;
}

export interface CreateGroupRequest {
  name: string;
  quota: number;
  parentGroupId?: string;
}

export interface UpdateGroupRequest {
  name: string;
  quota: number;
}

export interface GroupTreeDto extends GroupDto {
  children: GroupTreeDto[];
}

// User
export interface UserDto {
  id: string;
  loginId: string;
  eventId: string;
  roleId: string;
  groupId: string;
  displayName: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface CreateUserRequest {
  username: string;
  displayName: string;
  roleId: string;
  groupId: string;
}

export interface UpdateUserRequest {
  displayName: string;
  roleId: string;
  groupId: string;
}

// Guest
export interface GuestDto {
  id: string;
  eventId: string;
  groupId: string;
  createdByUserId: string;
  name: string;
  email?: string;
  phone?: string;
  status: "pending" | "approved" | "rejected";
  meta?: Record<string, unknown>;
  createdAt: string;
  approvedAt?: string;
}

export interface CreateGuestRequest {
  name: string;
  email?: string;
  phone?: string;
  groupId: string;
}

export interface ApproveGuestRequest {
  status: "approved" | "rejected";
}

// Auth Context
export interface AuthContextType {
  token: string | null;
  currentUser: UserProfileDto | null;
  currentEvent: EventOption | null;
  events: EventOption[];
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  selectEvent: (event: EventOption) => void;
}
