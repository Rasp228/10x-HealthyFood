/**
 * Przykładowy test jednostkowy dla komponentu React
 * Ten plik jest szablonem - usuń go gdy będziesz miał prawdziwe testy
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Przykładowy komponent do testowania
const ExampleButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick}>{children}</button>
);

describe("ExampleButton", () => {
  it("renderuje się poprawnie", () => {
    const mockOnClick = jest.fn();

    render(<ExampleButton onClick={mockOnClick}>Kliknij mnie</ExampleButton>);

    expect(screen.getByRole("button", { name: "Kliknij mnie" })).toBeInTheDocument();
  });

  it("wywołuje onClick po kliknięciu", async () => {
    const user = userEvent.setup();
    const mockOnClick = jest.fn();

    render(<ExampleButton onClick={mockOnClick}>Kliknij mnie</ExampleButton>);

    await user.click(screen.getByRole("button", { name: "Kliknij mnie" }));

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("ma odpowiednie atrybuty dostępności", () => {
    const mockOnClick = jest.fn();

    render(<ExampleButton onClick={mockOnClick}>Zapisz</ExampleButton>);

    const button = screen.getByRole("button", { name: "Zapisz" });
    expect(button).toBeEnabled();
    expect(button).toHaveAccessibleName("Zapisz");
  });
});

// Przykład testowania utility function
const formatCurrency = (amount: number, currency = "PLN"): string => {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
  }).format(amount);
};

describe("formatCurrency", () => {
  it("formatuje kwotę w PLN", () => {
    const result = formatCurrency(1234.56);
    expect(result).toMatch(/1\s?234,56\s?zł/);
  });

  it("formatuje kwotę w EUR", () => {
    const result = formatCurrency(1234.56, "EUR");
    expect(result).toMatch(/1\s?234,56\s?€/);
  });

  it("obsługuje kwoty zero", () => {
    const result = formatCurrency(0);
    expect(result).toMatch(/0,00\s?zł/);
  });

  it("obsługuje duże kwoty", () => {
    const result = formatCurrency(1000000);
    expect(result).toMatch(/1\s?000\s?000,00\s?zł/);
  });
});
