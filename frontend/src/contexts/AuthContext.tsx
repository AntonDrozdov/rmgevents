import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "../services/apiClient";
import { AuthContextType, EventDto, EventOption, UserProfileDto } from "../types";

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
  const [mustChangePassword, setMustChangePassword] = useState(false);
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
      const savedMustChangePassword = localStorage.getItem("mustChangePassword") === "true";

      if (!savedToken) {
        setLoading(false);
        return;
      }

      apiClient.setToken(savedToken);
      setToken(savedToken);
      setLoginName(savedLoginName);
      setMustChangePassword(savedMustChangePassword);

      let restoredEvents = savedEvents;
      if (!savedMustChangePassword && savedEvents.length > 0) {
        try {
          const eventDetails = await apiClient.getEvents();
          restoredEvents = savedEvents.map((event) => {
            const details = eventDetails.find((item) => item.id === event.id);
            return details
              ? {
                  ...event,
                  eventDate: details.eventDate,
                  createdAt: details.createdAt,
                  createdByName: details.createdByName,
                  logoImageId: details.logoImageId,
                }
              : event;
          });
          localStorage.setItem("events", JSON.stringify(restoredEvents));
        } catch (error) {
          console.error("Не удалось обновить данные мероприятий.", error);
        }
      }
      setEvents(restoredEvents);

      if (savedEvent) {
        const restoredCurrentEvent =
          restoredEvents.find((event) => event.id === savedEvent.id) ?? savedEvent;
        setCurrentEvent(restoredCurrentEvent);
        localStorage.setItem("currentEvent", JSON.stringify(restoredCurrentEvent));
        if (!savedMustChangePassword) {
          try {
            await fetchUserProfile(savedEvent.id);
          } catch (error) {
            console.error("Не удалось восстановить профиль пользователя.", error);
            setToken(null);
            setLoginName(null);
            setCurrentEvent(null);
            setEvents([]);
            setCurrentUser(null);
            setMustChangePassword(false);
            apiClient.clearToken();
            localStorage.removeItem("login");
            localStorage.removeItem("currentEvent");
            localStorage.removeItem("events");
            localStorage.removeItem("mustChangePassword");
          }
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
    setMustChangePassword(response.mustChangePassword);
    localStorage.setItem("mustChangePassword", String(response.mustChangePassword));

    const defaultEvent = response.events[0] ?? null;
    setCurrentEvent(defaultEvent);

    if (defaultEvent) {
      localStorage.setItem("currentEvent", JSON.stringify(defaultEvent));
      if (!response.mustChangePassword) {
        await fetchUserProfile(defaultEvent.id);
      } else {
        setCurrentUser(null);
      }
    } else {
      localStorage.removeItem("currentEvent");
      setCurrentUser(null);
    }

    return response.mustChangePassword;
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const nextToken = await apiClient.changePassword(currentPassword, newPassword);
    setToken(nextToken);
    setMustChangePassword(false);
    localStorage.setItem("mustChangePassword", "false");

    if (currentEvent) {
      await fetchUserProfile(currentEvent.id);
    }
  };

  const logout = () => {
    setToken(null);
    setLoginName(null);
    setCurrentUser(null);
    setCurrentEvent(null);
    setEvents([]);
    setMustChangePassword(false);
    apiClient.clearToken();
    localStorage.removeItem("login");
    localStorage.removeItem("currentEvent");
    localStorage.removeItem("events");
    localStorage.removeItem("mustChangePassword");
  };

  const selectEvent = async (event: EventOption) => {
    await fetchUserProfile(event.id);
    setCurrentEvent(event);
    localStorage.setItem("currentEvent", JSON.stringify(event));
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

  const updateEvent = (event: EventDto) => {
    setEvents((currentEvents) => {
      const nextEvents = currentEvents.map((item) =>
        item.id === event.id
          ? {
              ...item,
              name: event.name,
              eventDate: event.eventDate,
              createdAt: event.createdAt,
              createdByName: event.createdByName,
              logoImageId: event.logoImageId,
            }
          : item
      );
      localStorage.setItem("events", JSON.stringify(nextEvents));
      return nextEvents;
    });

    setCurrentEvent((selectedEvent) => {
      if (!selectedEvent || selectedEvent.id !== event.id) return selectedEvent;
      const nextEvent = {
        ...selectedEvent,
        name: event.name,
        eventDate: event.eventDate,
        createdAt: event.createdAt,
        createdByName: event.createdByName,
        logoImageId: event.logoImageId,
      };
      localStorage.setItem("currentEvent", JSON.stringify(nextEvent));
      return nextEvent;
    });
  };

  const refreshProfile = async (eventId?: string | number) => {
    const profileEventId = eventId ?? currentEvent?.id;
    if (profileEventId) {
      await fetchUserProfile(profileEventId);
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
        mustChangePassword,
        currentUser,
        currentEvent,
        events,
        login,
        changePassword,
        logout,
        selectEvent,
        addEvent,
        updateEvent,
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
