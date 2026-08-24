import axios, { AxiosInstance } from "axios";
import { LoginRequest, LoginResponse, EventDetailDto, GroupTreeDto, GuestDto, CreateGuestRequest, ApproveGuestRequest } from "../types";

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(baseURL: string = "http://localhost:5000/api") {
    this.client = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Restore token from localStorage
    const savedToken = localStorage.getItem("token");
    if (savedToken) {
      this.setToken(savedToken);
    }

    // Request interceptor to add token
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

  // Auth endpoints
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

  // Events endpoints
  async getEvents() {
    const response = await this.client.get("/events");
    return response.data;
  }

  async getEvent(eventId: string): Promise<EventDetailDto> {
    const response = await this.client.get<EventDetailDto>(`/events/${eventId}`);
    return response.data;
  }

  async getCurrentUserProfile(eventId: string) {
    const response = await this.client.get(`/events/${eventId}/me`);
    return response.data;
  }

  async createEvent(name: string, description?: string) {
    const response = await this.client.post("/events", { name, description });
    return response.data;
  }

  // Groups endpoints
  async getGroupTree(eventId: string): Promise<GroupTreeDto> {
    const response = await this.client.get<GroupTreeDto>(`/events/${eventId}/groups`);
    return response.data;
  }

  async createGroup(eventId: string, name: string, quota: number, parentGroupId?: string) {
    const response = await this.client.post(`/events/${eventId}/groups`, {
      name,
      quota,
      parentGroupId,
    });
    return response.data;
  }

  // Guests endpoints
  async getGuests(eventId: string) {
    const response = await this.client.get<GuestDto[]>(`/events/${eventId}/guests`);
    return response.data;
  }

  async createGuest(eventId: string, request: CreateGuestRequest) {
    const response = await this.client.post(`/events/${eventId}/guests`, request);
    return response.data;
  }

  async approveGuest(eventId: string, guestId: string, request: ApproveGuestRequest) {
    const response = await this.client.post(
      `/events/${eventId}/guests/${guestId}/approve`,
      request
    );
    return response.data;
  }

  // Users endpoints
  async getUsers(eventId: string) {
    const response = await this.client.get(`/events/${eventId}/users`);
    return response.data;
  }

  async createUser(eventId: string, username: string, displayName: string, roleId: string, groupId: string) {
    const response = await this.client.post(`/events/${eventId}/users`, {
      username,
      displayName,
      roleId,
      groupId,
    });
    return response.data;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
