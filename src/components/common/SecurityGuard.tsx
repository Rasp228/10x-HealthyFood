import { useSecurityGuard } from "@/hooks/auth/useSecurityGuard";

/**
 * Komponent zabezpieczający strony chronione przed dostępem po wylogowaniu
 * Automatycznie sprawdza autoryzację i przekierowuje w przypadku problemów
 */
export default function SecurityGuard() {
  useSecurityGuard();

  // Komponent nie renderuje niczego - jest tylko wrapperem dla logiki zabezpieczeń
  return null;
}
