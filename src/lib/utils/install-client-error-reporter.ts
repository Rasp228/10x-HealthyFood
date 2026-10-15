/**
 * Wejście skryptu layoutu (`<script src>` w `MainLayout` i `AppLayout`): rejestruje globalne
 * handlery błędów przeglądarki. Skrypt modułowy wykonuje się raz na dokument, a
 * `installGlobalHandlers` i tak pilnuje strażnika na `window` - nawigacja `ClientRouter` nie
 * podwaja handlerów.
 *
 * Osobny plik, a nie skrypt wpisany w layout: reguła `prettier/prettier` z ESLinta czyta treść
 * `<script>` w `.astro` jako tekst i żąda sklejenia jej w jedną linię.
 */
import { installGlobalHandlers } from "./client-error-reporter";

installGlobalHandlers();
