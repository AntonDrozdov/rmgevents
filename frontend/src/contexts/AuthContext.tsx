import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "../services/apiClient";
import { AuthContextType, EventOption, UserProfileDto } from "../types";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const readJson = <T,>(key: string): T | null => {
  const value = localStorage.getItem(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfileDto | null>(null);
  const [currentEvent, setCurrentEvent] = useState<EventOption | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (eventId: string) => {
    const profile = await apiClient.getCurrentUserProfile(eventId);
    setCurrentUser(profile);
  };

  useEffect(() => {
    const restoreSession = async () => {
      const savedToken = localStorage.getItem("token");
      const savedEvent = readJson<EventOption>("currentEvent");
      const savedEvents = readJson<EventOption[]>("events") ?? [];

      if (!savedToken) {
        setLoading(false);
        return;
      }

      apiClient.setToken(savedToken);
      setToken(savedToken);
      setEvents(savedEvents);

      if (savedEvent) {
        setCurrentEvent(savedEvent);
        try {
          await fetchUserProfile(savedEvent.id);
        } catch {
          apiClient.clearToken();
          localStorage.removeItem("currentEvent");
          localStorage.removeItem("events");
          setToken(null);
          setCurrentEvent(null);
          setEvents([]);
        }
      }

      setLoading(false);
    };

    restoreSession();
  }, []);

  const login = async (username: string, password: string) => {
    const response = await apiClient.login({ username, password });
    setToken(response.token);
    setEvents(response.events);
    localStorage.setItem("events", JSON.stringify(response.events));

    const defaultEvent = response.events[0] ?? null;
    setCurrentEvent(defaultEvent);

    if (defaultEvent) {
      localStorage.setItem("currentEvent", JSON.stringify(defaultEvent));
      await fetchUserProfile(defaultEvent.id);
    } else {
      localStorage.removeItem("currentEvent");
      setCurrentUser(null);
    }
  };

  const logout = () => {
    setToken(null);
    setCurrentUser(null);
    setCurrentEvent(null);
    setEvents([]);
    apiClient.clearToken();
    localStorage.removeItem("currentEvent");
    localStorage.removeItem("events");
  };

  const selectEvent = async (event: EventOption) => {
    setCurrentEvent(event);
    localStorage.setItem("currentEvent", JSON.stringify(event));
    await fetchUserProfile(event.id);
  };

  const refreshProfile = async () => {
    if (currentEvent) {
      await fetchUserProfile(currentEvent.id);
    }
  };

  if (loading) {
    return <div className="app-loading">Загрузка...</div>;
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        currentUser,
        currentEvent,
        events,
        login,
        logout,
        selectEvent,
        refreshProfile,
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
