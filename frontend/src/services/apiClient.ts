import axios, { AxiosInstance } from "axios";
import {
  ApproveGuestRequest,
  CreateEventRequest,
  CreateGroupRequest,
  CreateGuestRequest,
  CreateUserRequest,
  EventDetailDto,
  EventDto,
  GroupTreeDto,
  GuestDto,
  LoginRequest,
  LoginResponse,
  UpdateUserRequest,
  UserDto,
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

  async getGroupTree(eventId: string | number): Promise<GroupTreeDto[]> {
    const response = await this.client.get<GroupTreeDto[]>(`/events/${eventId}/groups`);
    return response.data;
  }

  async createGroup(eventId: string | number, request: CreateGroupRequest): Promise<GroupTreeDto> {
    const response = await this.client.post<GroupTreeDto>(`/events/${eventId}/groups`, request);
    return response.data;
  }

  async getGuests(eventId: string | number): Promise<GuestDto[]> {
    const response = await this.client.get<GuestDto[]>(`/events/${eventId}/guests`);
    return response.data;
  }

  async createGuest(eventId: string | number, request: CreateGuestRequest): Promise<GuestDto> {
    const response = await this.client.post<GuestDto>(`/events/${eventId}/guests`, request);
    return response.data;
  }

  async approveGuest(eventId: string | number, request: ApproveGuestRequest): Promise<GuestDto> {
    const response = await this.client.post<GuestDto>(
      `/events/${eventId}/guests/${request.guestId}/approve`,
      request
    );
    return response.data;
  }

  async getUsers(eventId: string | number): Promise<UserDto[]> {
    const response = await this.client.get<UserDto[]>(`/events/${eventId}/users`);
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
}

export const apiClient = new ApiClient();
