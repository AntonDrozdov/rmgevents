import { Placement, PlacementEditLockStatus, PlacementInput, PlacementGuest, PlacementTemplate } from "../types/placements";
import axios, { AxiosInstance } from "axios";
export interface AssistantAction {
  id: string; eventId: number | null; title: string; expiresAt: string;
  changes: { field: string; before: string; after: string }[];
}
export interface AssistantClientRequest { method: string; path: string; body?: unknown | null }
export interface AssistantActionResult { status: string; message: string; request?: AssistantClientRequest | null }
export interface AssistantModelOption {
  costRank: number | null;
  id: string;
  name: string;
  inputPricePerThousandTokens: number | null;
  outputPricePerThousandTokens: number | null;
  context: string | null;
  recommendedUse: string | null;
  ownedBy: string;
}
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
  GuestBulkSelectionRequest,
  GuestBulkSummaryDto,
  GuestBulkActionResultDto,
  PublicGuestDto,
  GuestSearchResultDto,
  LoginRequest,
  LoginResponse,
  OrganizationImportResultDto,
  OrganizationStructureTreeDto,
  PagedResultDto,
  ResetGroupsResultDto,
  RoleDto,
  TagDto,
  TicketTemplateDto,
  TicketTemplateInput,
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
  async getAssistantModels(): Promise<AssistantModelOption[]> {
    return (await this.client.get("/assistant/models")).data;
  }
  async askAssistant(request: { messages: { role: "user" | "assistant"; content: string }[]; page: string; eventId: number | null; model: string }, signal: AbortSignal): Promise<{ answer: string; sources: string[]; actions?: AssistantAction[] }> {
    return (await this.client.post("/assistant/ask", request, { signal, timeout: 60000 })).data;
  }
  async decideAssistantAction(id: string, eventId: number | null, confirm: boolean): Promise<AssistantActionResult> {
    return (await this.client.post(`/assistant/actions/${id}/decision`, { eventId, confirm }, { timeout: 60000 })).data;
  }
  async executeAssistantRequest(actionId: string, request: AssistantClientRequest, eventId: number | null): Promise<unknown> {
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !/^\/events(?:\/|\?|$)/.test(request.path))
      throw new Error('AIMode вернул недопустимый запрос.');
    const placementHeaders = eventId && request.path.includes('/placements') ? this.placementEditHeaders(eventId) : undefined;
    return (await this.client.request({
      method,
      url: request.path,
      data: request.body ?? undefined,
      headers: { ...placementHeaders, 'X-Assistant-Action-Id': actionId },
      timeout: 60000,
    })).data;
  }
  private client: AxiosInstance;
  private token: string | null = null;
  private placementEditTokens = new Map<string, string>();

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

  private placementEditHeaders(eventId: string | number) {
    const token = this.placementEditTokens.get(String(eventId));
    return token ? { "X-Placement-Edit-Token": token } : undefined;
  }
  setPlacementEditToken(eventId: string | number, token?: string | null) {
    if (token) this.placementEditTokens.set(String(eventId), token);
    else this.placementEditTokens.delete(String(eventId));
  }
  async getPlacements(eventId: string | number): Promise<Placement[]> { return (await this.client.get('/events/'+eventId+'/placements')).data; }
  async getPlacementEditLock(eventId: string | number): Promise<PlacementEditLockStatus> { return (await this.client.get('/events/'+eventId+'/placements/edit-lock')).data; }
  async acquirePlacementEditLock(eventId: string | number): Promise<PlacementEditLockStatus> { return (await this.client.post('/events/'+eventId+'/placements/edit-lock/acquire')).data; }
  async heartbeatPlacementEditLock(eventId: string | number): Promise<PlacementEditLockStatus> { return (await this.client.post('/events/'+eventId+'/placements/edit-lock/heartbeat', null, { headers: this.placementEditHeaders(eventId) })).data; }
  async takeoverPlacementEditLock(eventId: string | number): Promise<PlacementEditLockStatus> { return (await this.client.post('/events/'+eventId+'/placements/edit-lock/takeover')).data; }
  async releasePlacementEditLock(eventId: string | number): Promise<PlacementEditLockStatus> { return (await this.client.delete('/events/'+eventId+'/placements/edit-lock', { headers: this.placementEditHeaders(eventId) })).data; }
  async createPlacements(eventId: string | number, input: PlacementInput): Promise<Placement[]> { return (await this.client.post('/events/'+eventId+'/placements', input, { headers: this.placementEditHeaders(eventId) })).data; }
  async updatePlacement(eventId: string | number, id: number, input: PlacementInput): Promise<Placement[]> { return (await this.client.put('/events/'+eventId+'/placements/'+id, input, { headers: this.placementEditHeaders(eventId) })).data; }
  async rotatePlacementRows(eventId: string | number, updates: { id: number; rotation: number }[]): Promise<Placement[]> { return (await this.client.put('/events/'+eventId+'/placements/rows/rotation', updates, { headers: this.placementEditHeaders(eventId) })).data; }
  async updatePlacementSeatLabel(eventId: string | number, id: number, seatNumber: number, label: string): Promise<Placement[]> { return (await this.client.put('/events/'+eventId+'/placements/'+id+'/seats/'+seatNumber+'/label', { label })).data; }
  async updatePlacementBatch(eventId: string | number, batchId: string, input: PlacementInput): Promise<Placement[]> { return (await this.client.put('/events/'+eventId+'/placements/batches/'+batchId, input, { headers: this.placementEditHeaders(eventId) })).data; }
  async copyPlacements(eventId: string | number, ids: number[]): Promise<Placement[]> { return (await this.client.post('/events/'+eventId+'/placements/copy', { ids }, { headers: this.placementEditHeaders(eventId) })).data; }
  async groupPlacementRows(eventId: string | number, ids: number[]): Promise<Placement[]> { return (await this.client.post('/events/'+eventId+'/placements/rows/group', { ids }, { headers: this.placementEditHeaders(eventId) })).data; }
  async ungroupPlacementRows(eventId: string | number, batchId: string): Promise<Placement[]> { return (await this.client.post('/events/'+eventId+'/placements/rows/batches/'+batchId+'/ungroup', null, { headers: this.placementEditHeaders(eventId) })).data; }
  async deletePlacement(eventId: string | number, id: number | null): Promise<void> { await this.client.delete('/events/'+eventId+'/placements'+(id === null ? '' : '/'+id), { params: { confirmed: true }, headers: this.placementEditHeaders(eventId) }); }
  async placementGuests(eventId: string | number, groupId: number): Promise<PlacementGuest[]> { return (await this.client.get('/events/'+eventId+'/placements/guests', { params: { groupId } })).data; }
  async seatedPlacementGuests(eventId: string | number): Promise<PlacementGuest[]> { return (await this.client.get('/events/'+eventId+'/placements/seated-guests')).data; }
  async assignPlacement(eventId: string | number, id: number, guestId: number, remove = false): Promise<void> { await this.client.put('/events/'+eventId+'/placements/'+id+'/guests/'+guestId, { remove }); }
  async placementTemplates(eventId: string | number): Promise<PlacementTemplate[]> { return (await this.client.get('/events/'+eventId+'/placements/templates')).data; }
  async savePlacementTemplate(eventId: string | number, name: string): Promise<void> { await this.client.post('/events/'+eventId+'/placements/templates', { name }); }
  async applyPlacementTemplate(eventId: string | number, id: number): Promise<Placement[]> { return (await this.client.post('/events/'+eventId+'/placements/templates/'+id+'/apply', null, { params: { confirmed: true }, headers: this.placementEditHeaders(eventId) })).data; }

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
  async uploadTicketBackground(eventId: string | number, file: File): Promise<number> { const data = new FormData(); data.append("file", file); return (await this.client.post<{ id: number }>(`/images/events/${eventId}/ticket-background`, data, { headers: { "Content-Type": "multipart/form-data" } })).data.id; }
  async getTicketTemplates(eventId: string | number): Promise<TicketTemplateDto[]> { return (await this.client.get(`/events/${eventId}/ticket-templates`)).data; }
  async createTicketTemplate(eventId: string | number, input: TicketTemplateInput): Promise<TicketTemplateDto> { return (await this.client.post(`/events/${eventId}/ticket-templates`, input)).data; }
  async updateTicketTemplate(eventId: string | number, id: number, input: TicketTemplateInput): Promise<TicketTemplateDto> { return (await this.client.put(`/events/${eventId}/ticket-templates/${id}`, input)).data; }
  async setTicketTemplateDefault(eventId: string | number, id: number): Promise<void> { await this.client.post(`/events/${eventId}/ticket-templates/${id}/default`); }
  async deleteTicketTemplate(eventId: string | number, id: number): Promise<void> { await this.client.delete(`/events/${eventId}/ticket-templates/${id}`); }

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
    query: { page?: number; pageSize?: number; search?: string; statuses?: string[]; eligibleForSeating?: boolean; categoryIds?: number[]; tagIds?: number[]; groupIds?: number[]; createdByUserIds?: number[]; includeDeleted?: boolean; sortBy?: string; sortDirection?: "asc" | "desc" } = {}
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

  async getGuest(eventId: string | number, guestId: number): Promise<GuestDto> {
    const response = await this.client.get<GuestDto>(`/events/${eventId}/guests/${guestId}`);
    return response.data;
  }

  async getPublicGuest(publicId: string): Promise<PublicGuestDto> {
    return (await this.client.get<PublicGuestDto>(`/public/guests/${publicId}`)).data;
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

  async restoreDeletedGuest(eventId: string | number, guestId: number): Promise<GuestDto> {
    return (await this.client.post<GuestDto>(`/events/${eventId}/guests/${guestId}/restore`)).data;
  }

  async getGuestBulkSummary(eventId: string | number, selection: GuestBulkSelectionRequest): Promise<GuestBulkSummaryDto> {
    return (await this.client.post<GuestBulkSummaryDto>(`/events/${eventId}/guests/bulk/summary`, selection)).data;
  }

  async executeGuestBulkAction(eventId: string | number, action: string, selection: GuestBulkSelectionRequest): Promise<GuestBulkActionResultDto> {
    return (await this.client.post<GuestBulkActionResultDto>(`/events/${eventId}/guests/bulk/action`, { action, selection })).data;
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
