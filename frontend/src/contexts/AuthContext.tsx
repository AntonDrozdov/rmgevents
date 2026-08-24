import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "../services/apiClient";
import { AuthContextType, EventOption, UserProfileDto } from "../types";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfileDto | null>(null);
  const [currentEvent, setCurrentEvent] = useState<EventOption | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedEvent = localStorage.getItem("currentEvent");
    
    if (savedToken) {
      setToken(savedToken);
      
      if (savedEvent) {
        const event = JSON.parse(savedEvent);
        setCurrentEvent(event);
        
        // Fetch user profile
        fetchUserProfile(event.id, savedToken);
      }
    }
    
    setLoading(false);
  }, []);

  const fetchUserProfile = async (eventId: string, authToken: string) => {
    try {
      const profile = await apiClient.getCurrentUserProfile(eventId);
      setCurrentUser(profile);
    } catch (error) {
      console.error("Failed to fetch user profile:", error);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const response = await apiClient.login({ username, password });
      setToken(response.token);
      setEvents(response.events);
      
      if (response.events.length > 0) {
        const defaultEvent = response.events[0];
        setCurrentEvent(defaultEvent);
        localStorage.setItem("currentEvent", JSON.stringify(defaultEvent));
        await fetchUserProfile(defaultEvent.id, response.token);
      }
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const logout = () => {
    setToken(null);
    setCurrentUser(null);
    setCurrentEvent(null);
    setEvents([]);
    apiClient.clearToken();
    localStorage.removeItem("token");
    localStorage.removeItem("currentEvent");
  };

  const selectEvent = (event: EventOption) => {
    setCurrentEvent(event);
    localStorage.setItem("currentEvent", JSON.stringify(event));
    if (token) {
      fetchUserProfile(event.id, token);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <AuthContext.Provider
      value={{
        token: token || "",
        currentUser,
        currentEvent,
        events,
        login,
        logout,
        selectEvent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
