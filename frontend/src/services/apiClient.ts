import axios, { AxiosInstance } from "axios";
import {
  ApproveGuestRequest,
  ApplyGroupTemplateResultDto,
  ApplyOriginalStructureResultDto,
  CategoryDto,
  CreateCategoryRequest,
  CreateEventRequest,
  CreateGroupRequest,
  CreateGroupTemplateRequest,
  CreateGuestRequest,
  CreateTagRequest,
  CreateUserRequest,
  EventDetailDto,
  EventDto,
  EventLogDto,
  EventLogFilterOptionsDto,
  GroupTemplateDto,
  GroupTreeDto,
  GuestDto,
  GuestSearchResultDto,
  LoginRequest,
  LoginResponse,
  OrganizationImportResultDto,
  OrganizationStructureTreeDto,
  PagedResultDto,
  ResetGroupsResultDto,
  RoleDto,
  TagDto,
  UpdateCategoryRequest,
  UpdateGroupRequest,
  UpdateEventArchiveStatusRequest,
  UpdateGuestRequest,
  UpdateEventRequest,
  UpdateTagRequest,
  UpdateUserRequest,
  UserDto,
  UserSearchResultDto,
  UserProfileDto,
} from "../types";

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(baseURL: string = "/api") {
    this.client = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    localStorage.removeItem("token");
    const savedSid = localStorage.getItem("sid");
    if (savedSid) {
      this.setToken(savedSid);
    }

    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem("sid", token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem("sid");
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>("/auth/login", request);
    this.setToken(response.data.sid);
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<string> {
    const response = await this.client.post<{ sid: string }>("/auth/change-password", {
      currentPassword,
      newPassword,
    });
    this.setToken(response.data.sid);
    return response.data.sid;
  }

  async register(login: string, password: string): Promise<number> {
    const response = await this.client.post<{ loginId: number }>("/auth/register", {
      login,
      password,
    });
    return response.data.loginId;
  }

  async getEvents(): Promise<EventDto[]> {
    const response = await this.client.get<EventDto[]>("/events");
    return response.data;
  }

  async getEvent(eventId: string | number): Promise<EventDetailDto> {
    const response = await this.client.get<EventDetailDto>(`/events/${eventId}`);
    return response.data;
  }

  async getCurrentUserProfile(eventId: string | number): Promise<UserProfileDto> {
    const response = await this.client.get<UserProfileDto>(`/events/${eventId}/me`);
    return response.data;
  }

  async createEvent(request: CreateEventRequest): Promise<EventDto> {
    const response = await this.client.post<EventDto>("/events", request);
    return response.data;
  }

  async updateEvent(eventId: string | number, request: UpdateEventRequest): Promise<EventDto> {
    const response = await this.client.put<EventDto>(`/events/${eventId}`, request);
    return response.data;
  }

  async updateEventArchiveStatus(
    eventId: string | number,
    request: UpdateEventArchiveStatusRequest
  ): Promise<EventDto> {
    const response = await this.client.patch<EventDto>(`/events/${eventId}/archive-status`, request);
    return response.data;
  }

  async uploadEventCover(eventId: string | number, file: File): Promise<number> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await this.client.post<{ id: number }>(
      `/images/events/${eventId}/cover`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return response.data.id;
  }

  getImageUrl(imageId: number): string {
    return `/api/images/${imageId}`;
  }

  async getGroupTree(eventId: string | number): Promise<GroupTreeDto[]> {
    const response = await this.client.get<GroupTreeDto[]>(`/events/${eventId}/groups`);
    return response.data;
  }

  async getRoles(eventId: string | number): Promise<RoleDto[]> {
    const response = await this.client.get<RoleDto[]>(`/events/${eventId}/roles`);
    return response.data;
  }

  async createGroup(eventId: string | number, request: CreateGroupRequest): Promise<GroupTreeDto> {
    const response = await this.client.post<GroupTreeDto>(`/events/${eventId}/groups`, request);
    return response.data;
  }

  async updateGroup(eventId: string | number, groupId: number, request: UpdateGroupRequest): Promise<void> {
    await this.client.put(`/events/${eventId}/groups/${groupId}`, request);
  }

  async deleteGroup(eventId: string | number, groupId: number): Promise<void> {
    await this.client.delete(`/events/${eventId}/groups/${groupId}`);
  }

  async importOriginalStructure(
    eventId: string | number,
    file: File
  ): Promise<OrganizationImportResultDto> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await this.client.post<OrganizationImportResultDto>(
      `/events/${eventId}/groups/import-original-structure`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return response.data;
  }

  async applyOriginalStructure(eventId: string | number): Promise<ApplyOriginalStructureResultDto> {
    const response = await this.client.post<ApplyOriginalStructureResultDto>(
      `/events/${eventId}/groups/apply-original-structure`
    );
    return response.data;
  }

  async getOrganizationStructureTree(eventId: string | number): Promise<OrganizationStructureTreeDto> {
    const response = await this.client.get<OrganizationStructureTreeDto>(
      `/events/${eventId}/organization-structure/tree`
    );
    return response.data;
  }

  async resetGroups(eventId: string | number): Promise<ResetGroupsResultDto> {
    const response = await this.client.post<ResetGroupsResultDto>(`/events/${eventId}/groups/reset`);
    return response.data;
  }

  async getGroupTemplates(eventId: string | number): Promise<GroupTemplateDto[]> {
    const response = await this.client.get<GroupTemplateDto[]>(`/events/${eventId}/groups/templates`);
    return response.data;
  }

  async createGroupTemplate(
    eventId: string | number,
    request: CreateGroupTemplateRequest
  ): Promise<GroupTemplateDto> {
    const response = await this.client.post<GroupTemplateDto>(`/events/${eventId}/groups/templates`, request);
    return response.data;
  }

  async applyGroupTemplate(
    eventId: string | number,
    templateId: number
  ): Promise<ApplyGroupTemplateResultDto> {
    const response = await this.client.post<ApplyGroupTemplateResultDto>(
      `/events/${eventId}/groups/apply-template`,
      { templateId }
    );
    return response.data;
  }

  async getCategories(eventId: string | number): Promise<CategoryDto[]> {
    const response = await this.client.get<CategoryDto[]>(`/events/${eventId}/categories`);
    return response.data;
  }

  async createCategory(eventId: string | number, request: CreateCategoryRequest): Promise<CategoryDto> {
    const response = await this.client.post<CategoryDto>(`/events/${eventId}/categories`, request);
    return response.data;
  }

  async updateCategory(
    eventId: string | number,
    categoryId: number,
    request: UpdateCategoryRequest
  ): Promise<CategoryDto> {
    const response = await this.client.put<CategoryDto>(
      `/events/${eventId}/categories/${categoryId}`,
      request
    );
    return response.data;
  }

  async deleteCategory(eventId: string | number, categoryId: number): Promise<void> {
    await this.client.delete(`/events/${eventId}/categories/${categoryId}`);
  }

  async getTags(eventId: string | number): Promise<TagDto[]> {
    const response = await this.client.get<TagDto[]>(`/events/${eventId}/tags`);
    return response.data;
  }

  async createTag(eventId: string | number, request: CreateTagRequest): Promise<TagDto> {
    const response = await this.client.post<TagDto>(`/events/${eventId}/tags`, request);
    return response.data;
  }

  async updateTag(
    eventId: string | number,
    tagId: number,
    request: UpdateTagRequest
  ): Promise<TagDto> {
    const response = await this.client.put<TagDto>(
      `/events/${eventId}/tags/${tagId}`,
      request
    );
    return response.data;
  }

  async deleteTag(eventId: string | number, tagId: number): Promise<void> {
    await this.client.delete(`/events/${eventId}/tags/${tagId}`);
  }

  async getEventLogs(
    eventId: string | number,
    query: {
      page?: number;
      pageSize?: number;
      userId?: number;
      action?: string;
      entityType?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {}
  ): Promise<PagedResultDto<EventLogDto>> {
    const response = await this.client.get<PagedResultDto<EventLogDto>>(`/events/${eventId}/logs`, {
      params: query,
    });
    return response.data;
  }

  async getEventLogFilterOptions(eventId: string | number): Promise<EventLogFilterOptionsDto> {
    const response = await this.client.get<EventLogFilterOptionsDto>(`/events/${eventId}/logs/filter-options`);
    return response.data;
  }

  async getGuests(
    eventId: string | number,
    query: { page?: number; pageSize?: number; search?: string; status?: string; categoryId?: number; tagIds?: number[] } = {}
  ): Promise<PagedResultDto<GuestDto>> {
    const response = await this.client.get<PagedResultDto<GuestDto>>(`/events/${eventId}/guests`, {
      params: query,
      paramsSerializer: { indexes: null },
    });
    return response.data;
  }

  async createGuest(eventId: string | number, request: CreateGuestRequest): Promise<GuestDto> {
    const response = await this.client.post<GuestDto>(`/events/${eventId}/guests`, request);
    return response.data;
  }

  async searchGuests(
    eventId: string | number,
    query: { name?: string; email?: string; phone?: string },
    signal?: AbortSignal
  ): Promise<GuestSearchResultDto[]> {
    const response = await this.client.get<GuestSearchResultDto[]>(`/events/${eventId}/guests/search`, {
      params: query,
      signal,
    });
    return response.data;
  }

  async approveGuest(eventId: string | number, request: ApproveGuestRequest): Promise<GuestDto> {
    const response = await this.client.post<GuestDto>(
      `/events/${eventId}/guests/${request.guestId}/approve`,
      request
    );
    return response.data;
  }

  async updateGuest(
    eventId: string | number,
    guestId: number,
    request: UpdateGuestRequest
  ): Promise<GuestDto> {
    const response = await this.client.put<GuestDto>(`/events/${eventId}/guests/${guestId}`, request);
    return response.data;
  }

  async deleteGuest(eventId: string | number, guestId: number): Promise<void> {
    await this.client.delete(`/events/${eventId}/guests/${guestId}`);
  }

  async inviteGuest(eventId: string | number, guestId: number): Promise<GuestDto> {
    const response = await this.client.post<GuestDto>(`/events/${eventId}/guests/${guestId}/invite`);
    return response.data;
  }

  async submitGuestForReview(eventId: string | number, guestId: number): Promise<GuestDto> {
    const response = await this.client.post<GuestDto>(`/events/${eventId}/guests/${guestId}/submit-for-review`);
    return response.data;
  }

  async restoreGuestToSaved(eventId: string | number, guestId: number): Promise<GuestDto> {
    const response = await this.client.post<GuestDto>(`/events/${eventId}/guests/${guestId}/restore-to-saved`);
    return response.data;
  }

  async getUsers(eventId: string | number): Promise<UserDto[]> {
    const response = await this.client.get<UserDto[]>(`/events/${eventId}/users`);
    return response.data;
  }

  async searchUsers(
    eventId: string | number,
    query: { login?: string; surname?: string; name?: string; email?: string },
    signal?: AbortSignal
  ): Promise<UserSearchResultDto[]> {
    const response = await this.client.get<UserSearchResultDto[]>(`/events/${eventId}/users/search`, {
      params: query,
      signal,
    });
    return response.data;
  }

  async createUser(eventId: string | number, request: CreateUserRequest): Promise<UserDto> {
    const response = await this.client.post<UserDto>(`/events/${eventId}/users`, request);
    return response.data;
  }

  async updateUser(eventId: string | number, userId: number, request: UpdateUserRequest): Promise<void> {
    await this.client.put(`/events/${eventId}/users/${userId}`, request);
  }

  async deleteUser(eventId: string | number, userId: number): Promise<void> {
    await this.client.delete(`/events/${eventId}/users/${userId}`);
  }

  async resetUserPassword(eventId: string | number, userId: number): Promise<string> {
    const response = await this.client.post<{ temporaryPassword: string }>(
      `/events/${eventId}/users/${userId}/reset-password`
    );
    return response.data.temporaryPassword;
  }
}

export const apiClient = new ApiClient();
