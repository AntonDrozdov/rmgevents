import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface UserMenuProps {
  variant?: "dropdown" | "inline";
  showRole?: boolean;
}

export const UserMenu: React.FC<UserMenuProps> = ({ variant = "dropdown", showRole = true }) => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (variant !== "dropdown") return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [variant]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const fullName = currentUser
    ? `${currentUser.name} ${currentUser.surname}`.trim()
    : "Пользователь";

  const profile = (
    <div className="profile-pill">
      <span>{fullName}</span>
      {showRole && <small>{currentUser?.roleName ?? "Роль не выбрана"}</small>}
    </div>
  );

  if (variant === "inline") {
    return (
      <div className="user-menu user-menu-inline">
        {profile}
        <button className="user-menu-logout" type="button" onClick={handleLogout}>
          Выйти
        </button>
      </div>
    );
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="profile-pill profile-pill-button"
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <span>{fullName}</span>
        {showRole && <small>{currentUser?.roleName ?? "Роль не выбрана"}</small>}
      </button>

      {isOpen && (
        <div className="user-menu-dropdown" role="menu">
          <button type="button" onClick={handleLogout} role="menuitem">
            Выйти
          </button>
        </div>
      )}
    </div>
  );
};
