import React from "react";

export const RmgLogo: React.FC = () => (
  <div className="rmg-logo">
    <img className="rmg-logo__image" src="/logo/rmg-logo.png" alt="Русская Медиагруппа" />
    <div className="rmg-logo__subtitle" aria-label="Мероприятия">
      {"Мероприятия".split("").map((letter, index) => (
        <span key={`${letter}-${index}`} aria-hidden="true">
          {letter}
        </span>
      ))}
    </div>
  </div>
);
