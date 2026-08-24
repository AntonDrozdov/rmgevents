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

    const savedToken = localStorage.getItem("token");
    if (savedToken) {
      this.setToken(savedToken);
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
    localStorage.setItem("token", token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem("token");
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>("/auth/login", request);
    this.setToken(response.data.token);
    return response.data;
  }

  async register(username: string, password: string, displayName: string): Promise<string> {
    const response = await this.client.post<{ loginId: string }>("/auth/register", {
      username,
      password,
      displayName,
    });
    return response.data.loginId;
  }

  async getEvents(): Promise<EventDto[]> {
    const response = await this.client.get<EventDto[]>("/events");
    return response.data;
  }

  async getEvent(eventId: string): Promise<EventDetailDto> {
    const response = await this.client.get<EventDetailDto>(`/events/${eventId}`);
    return response.data;
  }

  async getCurrentUserProfile(eventId: string): Promise<UserProfileDto> {
    const response = await this.client.get<UserProfileDto>(`/events/${eventId}/me`);
    return response.data;
  }

  async createEvent(request: CreateEventRequest): Promise<EventDto> {
    const response = await this.client.post<EventDto>("/events", request);
    return response.data;
  }

  async getGroupTree(eventId: string): Promise<GroupTreeDto[]> {
    const response = await this.client.get<GroupTreeDto[]>(`/events/${eventId}/groups`);
    return response.data;
  }

  async createGroup(eventId: string, request: CreateGroupRequest): Promise<GroupTreeDto> {
    const response = await this.client.post<GroupTreeDto>(`/events/${eventId}/groups`, request);
    return response.data;
  }

  async getGuests(eventId: string): Promise<GuestDto[]> {
    const response = await this.client.get<GuestDto[]>(`/events/${eventId}/guests`);
    return response.data;
  }

  async createGuest(eventId: string, request: CreateGuestRequest): Promise<GuestDto> {
    const response = await this.client.post<GuestDto>(`/events/${eventId}/guests`, request);
    return response.data;
  }

  async approveGuest(eventId: string, request: ApproveGuestRequest): Promise<GuestDto> {
    const response = await this.client.post<GuestDto>(
      `/events/${eventId}/guests/${request.guestId}/approve`,
      request
    );
    return response.data;
  }

  async getUsers(eventId: string): Promise<UserDto[]> {
    const response = await this.client.get<UserDto[]>(`/events/${eventId}/users`);
    return response.data;
  }

  async createUser(eventId: string, request: CreateUserRequest): Promise<UserDto> {
    const response = await this.client.post<UserDto>(`/events/${eventId}/users`, request);
    return response.data;
  }
}

export const apiClient = new ApiClient();
