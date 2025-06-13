import { useState, useEffect } from "react";
import type { UserStatsDto } from "../../types";

interface UseUserStatsResult {
  stats: UserStatsDto | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Hook do pobierania statystyk użytkownika
export function useUserStats(): UseUserStatsResult {
  const [stats, setStats] = useState<UserStatsDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [refresh, setRefresh] = useState<number>(0);

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/users/stats", {
          method: "GET",
          credentials: "include", // Ważne dla przesyłania cookies z sesją
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const statsData: UserStatsDto = await response.json();
        setStats(statsData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Błąd podczas pobierania statystyk";
        setError(new Error(errorMessage));
        console.error("Error fetching user stats:", err);

        // W przypadku błędu ustawiamy null
        setStats(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [refresh]);

  const refetch = () => setRefresh((prev) => prev + 1);

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}
