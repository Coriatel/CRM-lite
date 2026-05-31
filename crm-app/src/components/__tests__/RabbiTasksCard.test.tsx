import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RabbiTasksCard } from "../dashboard/RabbiTasksCard";
import { createLocalTaskStore, type StorageAdapter } from "../../data/rabbiTasks";

function fakeStore() {
  let value: string | null = null;
  const storage: StorageAdapter = {
    getItem: () => value,
    setItem: (_k, v) => {
      value = v;
    },
  };
  return createLocalTaskStore({ storage });
}

describe("RabbiTasksCard", () => {
  it("shows the empty state when there are no tasks", async () => {
    render(<RabbiTasksCard store={fakeStore()} />);
    expect(await screen.findByText(/אין משימות פתוחות/)).toBeTruthy();
  });

  it("creates a task and lists it, then completes it out of the active list", async () => {
    render(<RabbiTasksCard store={fakeStore()} />);
    await screen.findByText(/אין משימות פתוחות/);

    fireEvent.click(screen.getByLabelText("משימה חדשה"));
    fireEvent.change(screen.getByLabelText("כותרת המשימה"), {
      target: { value: "להכין שיעור לשבת" },
    });
    fireEvent.click(screen.getByText("הוספה"));

    expect(await screen.findByText("להכין שיעור לשבת")).toBeTruthy();
    expect(screen.getByTestId("rabbi-task-item")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("סיום"));

    await waitFor(() => {
      expect(screen.queryByText("להכין שיעור לשבת")).toBeNull();
    });
  });
});
