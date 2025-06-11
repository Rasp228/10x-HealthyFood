import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeToggle from "@/components/ThemeToggle";

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
});

// Mock document.documentElement.classList
const mockClassList = {
  toggle: jest.fn(),
  add: jest.fn(),
  remove: jest.fn(),
  contains: jest.fn(),
};

Object.defineProperty(document.documentElement, "classList", {
  value: mockClassList,
});

// Mock matchMedia
const createMockMatchMedia = (matches: boolean) => {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const mockMediaQuery = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: jest.fn((event: string, listener: (e: MediaQueryListEvent) => void) => {
      if (event === "change") {
        listeners.push(listener);
      }
    }),
    removeEventListener: jest.fn((event: string, listener: (e: MediaQueryListEvent) => void) => {
      if (event === "change") {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }),
    dispatchEvent: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    // Dodaj metodę do symulowania zmiany
    _triggerChange: (newMatches: boolean) => {
      act(() => {
        listeners.forEach((listener) => {
          listener({ matches: newMatches } as MediaQueryListEvent);
        });
      });
    },
  };

  return jest.fn().mockReturnValue(mockMediaQuery);
};

describe("ThemeToggle", () => {
  let mockMatchMedia: jest.MockedFunction<typeof window.matchMedia>;

  beforeEach(() => {
    // Reset wszystkich mocków
    jest.clearAllMocks();
    mockLocalStorage.clear();
    mockClassList.toggle.mockClear();
    mockClassList.add.mockClear();
    mockClassList.remove.mockClear();
    mockClassList.contains.mockClear();

    // Setup domyślnego matchMedia
    mockMatchMedia = createMockMatchMedia(false);
    window.matchMedia = mockMatchMedia;
  });

  describe("Inicjalizacja komponentu", () => {
    it("powinien renderować przycisk z odpowiednimi atrybutami", () => {
      render(<ThemeToggle />);

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("id", "theme-toggle");
      expect(button).toHaveClass("rounded-full");
    });

    it("powinien wyświetlić ikonę księżyca dla jasnego motywu", async () => {
      render(<ThemeToggle />);

      // Sprawdź czy ikona księżyca jest widoczna (dla jasnego motywu)
      const moonIcon = screen.getByRole("button").querySelector("svg:not(.hidden)");
      expect(moonIcon).toBeInTheDocument();
      expect(moonIcon).toHaveClass("dark:hidden");
    });

    it("powinien mieć odpowiedni aria-label dla jasnego motywu", async () => {
      render(<ThemeToggle />);

      await waitFor(() => {
        const button = screen.getByRole("button");
        expect(button).toHaveAttribute("aria-label", "Przełącz na ciemny motyw");
      });
    });
  });

  describe("Inicjalizacja z localStorage", () => {
    it("powinien inicjalizować ciemny motyw gdy localStorage zawiera 'dark'", async () => {
      mockLocalStorage.getItem.mockReturnValue("dark");

      render(<ThemeToggle />);

      await waitFor(() => {
        const button = screen.getByRole("button");
        expect(button).toHaveAttribute("aria-label", "Przełącz na jasny motyw");
      });
    });

    it("powinien inicjalizować jasny motyw gdy localStorage zawiera 'light'", async () => {
      mockLocalStorage.getItem.mockReturnValue("light");

      render(<ThemeToggle />);

      await waitFor(() => {
        const button = screen.getByRole("button");
        expect(button).toHaveAttribute("aria-label", "Przełącz na ciemny motyw");
      });
    });
  });

  describe("Inicjalizacja z preferencjami systemowymi", () => {
    it("powinien używać preferencji systemowych gdy brak localStorage", async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockMatchMedia = createMockMatchMedia(true); // System preferuje ciemny motyw
      window.matchMedia = mockMatchMedia;

      render(<ThemeToggle />);

      await waitFor(() => {
        const button = screen.getByRole("button");
        expect(button).toHaveAttribute("aria-label", "Przełącz na jasny motyw");
      });
    });

    it("powinien nasłuchiwać zmian preferencji systemowych", () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockMatchMedia = createMockMatchMedia(false);
      window.matchMedia = mockMatchMedia;

      render(<ThemeToggle />);

      // Sprawdź czy addEventListener został wywołany
      expect(mockMatchMedia).toHaveBeenCalled();
      expect(mockMatchMedia("(prefers-color-scheme: dark)").addEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function)
      );
    });
  });

  describe("Przełączanie motywu", () => {
    it("powinien przełączać z jasnego na ciemny motyw", async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);

      const button = screen.getByRole("button");

      // Początkowy stan - jasny motyw
      await waitFor(() => {
        expect(button).toHaveAttribute("aria-label", "Przełącz na ciemny motyw");
      });

      // Kliknij przycisk
      await user.click(button);

      // Sprawdź czy stan się zmienił
      await waitFor(() => {
        expect(button).toHaveAttribute("aria-label", "Przełącz na jasny motyw");
        expect(mockClassList.toggle).toHaveBeenCalledWith("dark", true);
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith("theme", "dark");
      });
    });

    it("powinien przełączać z ciemnego na jasny motyw", async () => {
      const user = userEvent.setup();
      mockLocalStorage.getItem.mockReturnValue("dark");

      render(<ThemeToggle />);

      const button = screen.getByRole("button");

      // Początkowy stan - ciemny motyw
      await waitFor(() => {
        expect(button).toHaveAttribute("aria-label", "Przełącz na jasny motyw");
      });

      // Kliknij przycisk
      await user.click(button);

      // Sprawdź czy stan się zmienił
      await waitFor(() => {
        expect(button).toHaveAttribute("aria-label", "Przełącz na ciemny motyw");
        expect(mockClassList.toggle).toHaveBeenCalledWith("dark", false);
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith("theme", "light");
      });
    });

    it("powinien obsługiwać wielokrotne przełączanie", async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);

      const button = screen.getByRole("button");

      // Sprawdź, że nie ma jeszcze żadnych wywołań localStorage.setItem
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();

      // Pierwsze kliknięcie
      await user.click(button);
      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(1);
      });

      // Drugie kliknięcie
      await user.click(button);
      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(2);
      });

      // Trzecie kliknięcie
      await user.click(button);
      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe("Reaktywność na zmiany systemowe", () => {
    it("powinien reagować na zmiany preferencji systemowych gdy brak localStorage", async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockMatchMedia = createMockMatchMedia(false);
      window.matchMedia = mockMatchMedia;

      render(<ThemeToggle />);

      // Pobierz nowy wynik mocka po renderowaniu
      const mediaQueryResult = mockMatchMedia("(prefers-color-scheme: dark)") as MediaQueryList & {
        _triggerChange: (matches: boolean) => void;
      };

      // Symuluj zmianę preferencji systemowych na ciemny motyw
      mediaQueryResult._triggerChange(true);

      await waitFor(() => {
        expect(mockClassList.toggle).toHaveBeenCalledWith("dark", true);
      });
    });

    it("nie powinien reagować na zmiany systemowe gdy localStorage jest ustawiony", async () => {
      mockLocalStorage.getItem.mockReturnValue("light");
      mockMatchMedia = createMockMatchMedia(false);
      window.matchMedia = mockMatchMedia;

      render(<ThemeToggle />);

      // Pobierz nowy wynik mocka po renderowaniu
      const mediaQueryResult = mockMatchMedia("(prefers-color-scheme: dark)") as MediaQueryList & {
        _triggerChange: (matches: boolean) => void;
      };

      // Symuluj zmianę preferencji systemowych
      mediaQueryResult._triggerChange(true);

      // Nie powinno być zmian w classList
      expect(mockClassList.toggle).not.toHaveBeenCalled();
    });
  });

  describe("Czyszczenie event listenerów", () => {
    it("powinien usunąć event listener przy unmount", () => {
      mockMatchMedia = createMockMatchMedia(false);
      window.matchMedia = mockMatchMedia;

      const { unmount } = render(<ThemeToggle />);

      // Sprawdź czy addEventListener został wywołany
      expect(mockMatchMedia).toHaveBeenCalled();
      expect(mockMatchMedia("(prefers-color-scheme: dark)").addEventListener).toHaveBeenCalled();

      // Unmount komponentu
      unmount();

      // Sprawdź czy removeEventListener został wywołany
      expect(mockMatchMedia("(prefers-color-scheme: dark)").removeEventListener).toHaveBeenCalled();
    });
  });

  describe("Dostępność", () => {
    it("powinien mieć odpowiedni aria-label dla każdego stanu", async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);

      const button = screen.getByRole("button");

      // Stan początkowy - jasny motyw
      await waitFor(() => {
        expect(button).toHaveAttribute("aria-label", "Przełącz na ciemny motyw");
      });

      // Po kliknięciu - ciemny motyw
      await user.click(button);
      await waitFor(() => {
        expect(button).toHaveAttribute("aria-label", "Przełącz na jasny motyw");
      });
    });

    it("powinien być dostępny przez klawiaturę", async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);

      const button = screen.getByRole("button");

      // Focus na przycisk
      button.focus();
      expect(button).toHaveFocus();

      // Naciśnij Enter
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith("theme", "dark");
      });
    });

    it("powinien być dostępny przez spację", async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);

      const button = screen.getByRole("button");

      // Focus na przycisk
      button.focus();

      // Naciśnij spację
      await user.keyboard(" ");

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith("theme", "dark");
      });
    });
  });

  describe("Ikony", () => {
    it("powinien wyświetlać odpowiednie ikony dla różnych stanów motywu", async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);

      const button = screen.getByRole("button");

      // Stan początkowy - ikona księżyca (dla jasnego motywu)
      let visibleIcon = button.querySelector("svg:not(.hidden)");
      let hiddenIcon = button.querySelector("svg.hidden");

      expect(visibleIcon).toHaveClass("dark:hidden");
      expect(hiddenIcon).toHaveClass("hidden", "dark:block");

      // Po przełączeniu na ciemny motyw
      await user.click(button);

      // Ikony powinny się przełączyć (w rzeczywistości CSS kontroluje widoczność)
      visibleIcon = button.querySelector("svg:not(.hidden)");
      hiddenIcon = button.querySelector("svg.hidden");

      expect(visibleIcon).toHaveClass("dark:hidden");
      expect(hiddenIcon).toHaveClass("hidden", "dark:block");
    });
  });
});
