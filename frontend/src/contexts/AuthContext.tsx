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
  const [loginName, setLoginName] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfileDto | null>(null);
  const [currentEvent, setCurrentEvent] = useState<EventOption | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (eventId: string | number) => {
    const profile = await apiClient.getCurrentUserProfile(eventId);
    setCurrentUser(profile);
  };

  useEffect(() => {
    const restoreSession = async () => {
      localStorage.removeItem("token");
      const savedToken = localStorage.getItem("sid");
      const savedLoginName = localStorage.getItem("login");
      const savedEvent = readJson<EventOption>("currentEvent");
      const savedEvents = readJson<EventOption[]>("events") ?? [];

      if (!savedToken) {
        setLoading(false);
        return;
      }

      apiClient.setToken(savedToken);
      setToken(savedToken);
      setLoginName(savedLoginName);
      setEvents(savedEvents);

      if (savedEvent) {
        setCurrentEvent(savedEvent);
        try {
          await fetchUserProfile(savedEvent.id);
        } catch {
          apiClient.clearToken();
          localStorage.removeItem("login");
          localStorage.removeItem("currentEvent");
          localStorage.removeItem("events");
          setToken(null);
          setLoginName(null);
          setCurrentEvent(null);
          setEvents([]);
        }
      }

      setLoading(false);
    };

    restoreSession();
  }, []);

  const login = async (nextLoginName: string, password: string) => {
    const response = await apiClient.login({ login: nextLoginName, password });
    setToken(response.sid);
    setLoginName(nextLoginName);
    setEvents(response.events);
    localStorage.setItem("login", nextLoginName);
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
    setLoginName(null);
    setCurrentUser(null);
    setCurrentEvent(null);
    setEvents([]);
    apiClient.clearToken();
    localStorage.removeItem("login");
    localStorage.removeItem("currentEvent");
    localStorage.removeItem("events");
  };

  const selectEvent = async (event: EventOption) => {
    setCurrentEvent(event);
    localStorage.setItem("currentEvent", JSON.stringify(event));
    await fetchUserProfile(event.id);
  };

  const addEvent = (event: EventOption) => {
    setEvents((currentEvents) => {
      const nextEvents = currentEvents.some((item) => item.id === event.id)
        ? currentEvents
        : [...currentEvents, event];
      localStorage.setItem("events", JSON.stringify(nextEvents));
      return nextEvents;
    });

    setCurrentEvent(event);
    localStorage.setItem("currentEvent", JSON.stringify(event));
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
        loginName,
        currentUser,
        currentEvent,
        events,
        login,
        logout,
        selectEvent,
        addEvent,
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
