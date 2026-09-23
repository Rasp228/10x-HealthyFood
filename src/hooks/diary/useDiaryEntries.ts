import { useState, useEffect } from "react";
import type { DiaryEntriesDto, DiaryEntryDto } from "../../types";

interface UseDiaryEntriesResult {
  entries: DiaryEntryDto[];
  entryCount: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Hook do pobierania wpisów dziennika z jednego dnia.
// Pole nazywa się `entryCount`, a nie `total`: w tej funkcjonalności krążą trzy różne liczby
// (wiersze z DTO, kilokalorie dnia i liczba wpisów), więc jedno słowo na wszystkie tylko by je
// pomieszało.
export function useDiaryEntries(day: string | null): UseDiaryEntriesResult {
  const [entries, setEntries] = useState<DiaryEntryDto[]>([]);
  const [entryCount, setEntryCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [refresh, setRefresh] = useState<number>(0);

  useEffect(() => {
    // Dopóki przeglądarka nie rozstrzygnie swojego dnia, nie ma o co pytać serwera.
    if (day === null) return;

    // Odpowiedź na poprzedni dzień nie może nadpisać bieżącego - przy szybkim klikaniu strzałek
    // żądania wracają w dowolnej kolejności.
    let isCurrent = true;

    const fetchEntries = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/diary-entries?date=${encodeURIComponent(day)}`, {
          method: "GET",
          credentials: "include", // Ważne dla przesyłania cookies z sesją
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const result: DiaryEntriesDto = await response.json();

        if (!isCurrent) return;

        setEntries(result.data);
        setEntryCount(result.total);
      } catch (err) {
        if (!isCurrent) return;

        const errorMessage = err instanceof Error ? err.message : "Błąd podczas pobierania wpisów dziennika";
        setError(new Error(errorMessage));
        console.error("Error fetching diary entries:", err);

        // W przypadku błędu ustawiamy pusty dzień
        setEntries([]);
        setEntryCount(0);
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    };

    fetchEntries();

    return () => {
      isCurrent = false;
    };
  }, [day, refresh]);

  const refetch = () => setRefresh((prev) => prev + 1);

  return {
    entries,
    entryCount,
    isLoading,
    error,
    refetch,
  };
}
