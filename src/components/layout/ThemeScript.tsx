import { useEffect } from "react";

export default function ThemeScript() {
  useEffect(() => {
    const theme = localStorage.getItem("theme");

    if (theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    const handleAfterSwap = () => {
      const currentTheme = localStorage.getItem("theme");
      if (currentTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else if (currentTheme === "light") {
        document.documentElement.classList.remove("dark");
      }
    };

    document.addEventListener("astro:after-swap", handleAfterSwap);

    return () => {
      document.removeEventListener("astro:after-swap", handleAfterSwap);
    };
  }, []);

  return null;
}
