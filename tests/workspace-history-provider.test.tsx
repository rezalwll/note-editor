import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  useWorkspaceHistory,
  WorkspaceHistoryProvider,
} from "@/components/workspace-history-provider";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

function Harness() {
  const history = useWorkspaceHistory();
  const [value, setValue] = useState(0);

  return (
    <div>
      <span data-testid="value">{value}</span>
      <button
        type="button"
        onClick={() => {
          setValue(1);
          history.record({
            label: "change value",
            undo: () => setValue(0),
            redo: () => setValue(1),
          });
        }}
      >
        change
      </button>
      <input aria-label="editable" />
    </div>
  );
}

describe("WorkspaceHistoryProvider", () => {
  it("undoes and redoes structural actions with global shortcuts", async () => {
    render(
      <WorkspaceHistoryProvider>
        <Harness />
      </WorkspaceHistoryProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "change" }));
    expect(screen.getByTestId("value")).toHaveTextContent("1");

    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    await waitFor(() => expect(screen.getByTestId("value")).toHaveTextContent("0"));

    fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
    await waitFor(() => expect(screen.getByTestId("value")).toHaveTextContent("1"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("leaves native undo alone inside editable controls", async () => {
    render(
      <WorkspaceHistoryProvider>
        <Harness />
      </WorkspaceHistoryProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "change" }));

    const input = screen.getByRole("textbox", { name: "editable" });
    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByTestId("value")).toHaveTextContent("1");
  });
});
