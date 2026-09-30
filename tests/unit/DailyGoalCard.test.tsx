import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DailyGoalCard from "@/components/profile/DailyGoalCard";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: () => Promise.resolve(body),
  };
}

describe("DailyGoalCard", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("zasiewa pole zapisanym celem i pokazuje 'Usuń cel'", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ daily_calorie_goal: 2000 }));

    render(<DailyGoalCard />);

    await waitFor(() => expect(screen.getByTestId("daily-goal-input")).toHaveValue(2000));
    expect(screen.getByTestId("daily-goal-clear")).toBeInTheDocument();
    expect(screen.getByLabelText("Cel na dzień")).toBe(screen.getByTestId("daily-goal-input"));
  });

  it.each([
    ["300", "Cel nie może być niższy niż 500 kcal"],
    ["20000", "Cel nie może przekraczać 10000 kcal"],
  ])("odrzuca %s bez wysyłania PUT", async (typed, message) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ daily_calorie_goal: null }));
    const user = userEvent.setup();

    render(<DailyGoalCard />);
    const input = screen.getByTestId("daily-goal-input");
    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.queryByTestId("daily-goal-clear")).not.toBeInTheDocument();

    await user.type(input, typed);
    await user.click(screen.getByTestId("daily-goal-save"));

    expect(screen.getByTestId("daily-goal-error")).toHaveTextContent(message);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("zapisuje poprawny cel jako liczbę", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ daily_calorie_goal: null }))
      .mockResolvedValueOnce(jsonResponse({ daily_calorie_goal: 2000 }));
    const user = userEvent.setup();

    render(<DailyGoalCard />);
    const input = screen.getByTestId("daily-goal-input");
    await waitFor(() => expect(input).toBeEnabled());

    await user.type(input, "2000");
    await user.click(screen.getByTestId("daily-goal-save"));

    await waitFor(() => expect(screen.getByTestId("daily-goal-clear")).toBeInTheDocument());
    const [, init] = fetchMock.mock.calls[1];
    expect(init).toMatchObject({ method: "PUT", credentials: "include" });
    expect(JSON.parse(init.body)).toEqual({ daily_calorie_goal: 2000 });
  });
});
