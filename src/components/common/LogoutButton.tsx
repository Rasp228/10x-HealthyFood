import { useEffect } from "react";

export default function LogoutButton() {
  useEffect(() => {
    const handleLogout = async () => {
      try {
        localStorage.clear();
        sessionStorage.clear();

        const response = await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error("Błąd podczas wylogowania");
        }

        if ("caches" in window) {
          caches.keys().then(function (names) {
            for (const name of names) caches.delete(name);
          });
        }

        window.location.replace("/auth/login");
      } catch (error) {
        console.error("Błąd połączenia podczas wylogowania:", error);
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace("/auth/login");
      }
    };

    const initLogoutButton = () => {
      const logoutButton = document.getElementById("logout-button");
      if (logoutButton) {
        logoutButton.addEventListener("click", handleLogout);
      }
    };

    initLogoutButton();

    document.addEventListener("astro:page-load", initLogoutButton);

    return () => {
      const logoutButton = document.getElementById("logout-button");
      if (logoutButton) {
        logoutButton.removeEventListener("click", handleLogout);
      }
      document.removeEventListener("astro:page-load", initLogoutButton);
    };
  }, []);

  return null;
}
