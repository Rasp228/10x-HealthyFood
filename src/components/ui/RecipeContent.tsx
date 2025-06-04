import React from "react";

interface RecipeContentProps {
  content: string;
  className?: string;
}

export default function RecipeContent({ content, className = "" }: RecipeContentProps) {
  // Funkcja do przetwarzania i formatowania treści przepisu
  const formatRecipeContent = (text: string): string => {
    // Podziel tekst na linie
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Przetwórz każdą linię
    const processedLines = lines.map((line, index) => {
      // Jeśli linia zaczyna się od liczby i kropki (np. "1. ", "2. "), to pozostaw ją
      if (/^\d+\.\s/.test(line)) {
        return line;
      }

      // Jeśli linia zaczyna się od myślnika/gwiazdki, pozostaw
      if (/^[-*]\s/.test(line)) {
        return line;
      }

      // Jeśli to nagłówek (tylko wielkie litery, albo zaczyna się od dużej litery i zawiera ":"), pozostaw
      if (/^[A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻ\s]*:?$/.test(line) || line.endsWith(":")) {
        return line;
      }

      // Jeśli linia wygląda jak składnik lub krok, dodaj myślnik
      if (line.length > 3 && !line.startsWith("##") && !line.startsWith("#")) {
        // Sprawdź czy to może być krok w przepisie (zawiera czasowniki akcji)
        const actionWords = [
          "dodaj",
          "wlej",
          "wymieszaj",
          "podgrzej",
          "usmaż",
          "ugotuj",
          "pokrój",
          "posiekaj",
          "przypraw",
          "posól",
          "dopraw",
          "odstaw",
          "poczekaj",
        ];
        const hasActionWord = actionWords.some((word) => line.toLowerCase().includes(word));

        if (hasActionWord) {
          // To prawdopodobnie krok - dodaj numerację
          const stepNumber =
            lines
              .slice(0, index)
              .filter(
                (l) =>
                  actionWords.some((word) => l.toLowerCase().includes(word)) &&
                  !l.match(/^\d+\.\s/) &&
                  !l.match(/^[-*]\s/)
              ).length + 1;
          return `${stepNumber}. ${line}`;
        } else {
          // To prawdopodobnie składnik - dodaj myślnik
          return `• ${line}`;
        }
      }

      return line;
    });

    return processedLines.join("\n\n");
  };

  // Przetwórz zawartość
  const formattedContent = formatRecipeContent(content);

  // Podziel na paragrafy dla lepszego formatowania
  const paragraphs = formattedContent.split("\n\n").filter((p) => p.trim().length > 0);

  return (
    <div className={`space-y-6 ${className}`}>
      {paragraphs.map((paragraph, index) => {
        const trimmedParagraph = paragraph.trim();

        // Sprawdź typ paragrafu i odpowiednio sformatuj
        if (trimmedParagraph.endsWith(":") && trimmedParagraph.length < 100) {
          // Prawdopodobnie nagłówek sekcji
          return (
            <h3 key={index} className="text-lg font-semibold text-foreground border-b border-border pb-2">
              {trimmedParagraph}
            </h3>
          );
        } else if (trimmedParagraph.startsWith("•")) {
          // Lista składników
          const items = trimmedParagraph.split("\n").filter((item) => item.trim().length > 0);
          return (
            <ul key={index} className="space-y-2 ml-4">
              {items.map((item, itemIndex) => (
                <li key={itemIndex} className="text-foreground leading-relaxed flex items-start">
                  <span className="text-primary font-medium mr-3 mt-1">•</span>
                  <span>{item.replace(/^•\s*/, "")}</span>
                </li>
              ))}
            </ul>
          );
        } else if (trimmedParagraph.match(/^\d+\./)) {
          // Lista kroków
          const steps = trimmedParagraph.split("\n").filter((step) => step.trim().length > 0);
          return (
            <ol key={index} className="space-y-4 ml-4">
              {steps.map((step, stepIndex) => {
                const match = step.match(/^(\d+)\.\s*(.+)/);
                if (match) {
                  return (
                    <li key={stepIndex} className="text-foreground leading-relaxed flex items-start">
                      <span className="text-primary font-semibold mr-3 mt-1 min-w-[1.5rem]">{match[1]}.</span>
                      <span>{match[2]}</span>
                    </li>
                  );
                }
                return (
                  <li key={stepIndex} className="text-foreground leading-relaxed">
                    {step}
                  </li>
                );
              })}
            </ol>
          );
        } else {
          // Zwykły paragraf
          return (
            <p key={index} className="text-foreground leading-relaxed">
              {trimmedParagraph}
            </p>
          );
        }
      })}
    </div>
  );
}
