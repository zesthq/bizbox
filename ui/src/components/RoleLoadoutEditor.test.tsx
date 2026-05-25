// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { RoleLoadoutEditor } from "./RoleLoadoutEditor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function Harness(props: { onPortraitUpload: (file: File) => void; onNicknameChange: (value: string) => void }) {
  const [skills, setSkills] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [memory, setMemory] = useState<string[]>([]);
  const [nickname, setNickname] = useState("");

  return (
    <RoleLoadoutEditor
      mode="create"
      role="engineer"
      name="Agent Smith"
      title="Staff Engineer"
      nickname={nickname}
      icon="bot"
      portraitAssetPath={null}
      selectedSkills={skills}
      selectedToolKeys={tools}
      selectedMemoryKeys={memory}
      skillInventory={[
        { key: "company/analysis", name: "Analysis", description: "Break down problems." },
      ]}
      onNameChange={() => {}}
      onTitleChange={() => {}}
      onNicknameChange={(value) => {
        setNickname(value);
        props.onNicknameChange(value);
      }}
      onIconChange={() => {}}
      onPortraitUpload={props.onPortraitUpload}
      onSelectedSkillsChange={setSkills}
      onSelectedToolKeysChange={setTools}
      onSelectedMemoryKeysChange={setMemory}
    />
  );
}

describe("RoleLoadoutEditor", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("uploads portraits and updates nickname through the editor", async () => {
    const onPortraitUpload = vi.fn();
    const onNicknameChange = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Harness onPortraitUpload={onPortraitUpload} onNicknameChange={onNicknameChange} />,
      );
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    const file = new File(["portrait"], "portrait.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onPortraitUpload).toHaveBeenCalledWith(file);

    const nicknameInput = Array.from(container.querySelectorAll("input")).find(
      (input) => input.getAttribute("placeholder") === "The Archivist",
    ) as HTMLInputElement | undefined;
    expect(nicknameInput).toBeDefined();

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(nicknameInput, "The Archivist");
      nicknameInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(nicknameInput!.value).toBe("The Archivist");
    expect(onNicknameChange).toHaveBeenCalledWith("The Archivist");

    await act(async () => {
      root.unmount();
    });
  });

  it("supports click-based skill, tool, and memory assignment", async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Harness onPortraitUpload={vi.fn()} onNicknameChange={vi.fn()} />,
      );
    });

    const analysisCard = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Analysis"),
    ) as HTMLButtonElement | undefined;
    const githubCard = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("GitHub"),
    ) as HTMLButtonElement | undefined;
    const memoryCard = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Task Memory"),
    ) as HTMLButtonElement | undefined;

    expect(analysisCard).toBeDefined();
    expect(githubCard).toBeDefined();
    expect(memoryCard).toBeDefined();

    await act(async () => {
      analysisCard!.click();
      githubCard!.click();
      memoryCard!.click();
    });

    expect(container.textContent).toContain("Equipped");
    expect(container.textContent).toContain("GitHub");
    expect(container.textContent).toContain("Task Memory");

    await act(async () => {
      root.unmount();
    });
  });
});
