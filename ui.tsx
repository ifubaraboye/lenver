import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import SelectInput from "ink-select-input";
import clipboardy from "clipboardy";
import fs from "node:fs/promises";
import { detectDrives, loadLastVaultPath, vault, type DriveInfo, type UnlockFailureReason } from "./crypto";

type View = "BOOT" | "DRIVE_PICK" | "UNLOCK" | "INIT" | "CONFIRM_DRIVE" | "DASHBOARD" | "ADD" | "DETAILS";
type ChecklistState = "done" | "active" | "pending";

const C = {
  hex: "#e2e8f0",
  text: "#e2e8f0",
  dim: "#4b5563",
  err: "#f87171",
  warn: "#fbbf24",
  reveal: "#67e8f9",
};

const Hex = ({ title, sub }: { title: string; sub?: string }) => (
  <Box flexDirection="column" marginTop={1} marginBottom={1}>
    <Box>
      <Text color={C.hex} bold>{"  ⬢  "}</Text>
      <Text color={C.text} bold>{` ${title}`}</Text>
      {sub ? <Text color={C.dim}>{`  ${sub}`}</Text> : null}
    </Box>
  </Box>
);

const Item = ({ state, label }: { state: ChecklistState; label: string }) => {
  switch (state) {
    case "done":
      return (
        <Box>
          <Text color={C.dim}>{"    ☐   "}</Text>
          <Text color={C.dim}>{label}</Text>
        </Box>
      );
    case "active":
      return (
        <Box>
          <Text color={C.hex} bold>{"    ▣   "}</Text>
          <Text color={C.text} bold>{label}</Text>
        </Box>
      );
    case "pending":
      return (
        <Box>
          <Text color={C.dim}>{"    ☐   "}</Text>
          <Text color={C.dim}>{label}</Text>
        </Box>
      );
  }
};

const FilePath = ({ path, tag }: { path: string; tag?: string }) => (
  <Box borderStyle="single" borderColor={C.dim} paddingX={1} marginBottom={1}>
    <Text color={C.text}>{path}</Text>
    {tag ? <Text color={C.hex}>{` ${tag}`}</Text> : null}
  </Box>
);

const Input = ({
  initialValue = "",
  placeholder,
  focus = false,
  mask,
  onSubmit,
  onCancel,
  normalize,
}: {
  initialValue?: string;
  placeholder: string;
  focus?: boolean;
  mask?: boolean;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  normalize?: (value: string) => string;
}) => {
  const [value, setValue] = useState(initialValue);
  const valueRef = useRef(value);
  valueRef.current = value;

  const applyTerminalInput = (currentValue: string, input: string) => {
    let nextValue = currentValue;

    for (let index = 0; index < input.length; ) {
      if (input.startsWith("\u001b[3~", index)) {
        nextValue = nextValue.slice(0, -1);
        index += "\u001b[3~".length;
        continue;
      }

      const character = input[index];
      if (!character) {
        break;
      }

      if (character === "\u0008" || character === "\u007f") {
        nextValue = nextValue.slice(0, -1);
        index += 1;
        continue;
      }

      if (/[\x00-\x1F\x7F]/.test(character)) {
        index += 1;
        continue;
      }

      nextValue += normalize ? normalize(character) : character;
      index += 1;
    }

    return nextValue;
  };

  useInput(
    (input, key) => {
      if (!focus) {
        return;
      }

      if (key.escape) {
        onCancel?.();
        return;
      }

      if (key.return) {
        onSubmit?.(valueRef.current);
        return;
      }

      if (input.length > 0) {
        const nextValue = applyTerminalInput(valueRef.current, input);
        if (nextValue !== valueRef.current) {
          valueRef.current = nextValue;
          setValue(nextValue);
        }
        return;
      }

      if (key.backspace || key.delete) {
        const nextValue = valueRef.current.slice(0, -1);
        valueRef.current = nextValue;
        setValue(nextValue);
        return;
      }

      if (
        key.escape ||
        key.tab ||
        key.upArrow ||
        key.downArrow ||
        key.leftArrow ||
        key.rightArrow ||
        key.ctrl ||
        key.meta
      ) {
        return;
      }
    },
    { isActive: focus },
  );

  const display = mask ? "•".repeat(value.length) : value;
  const isEmpty = value.length === 0;

  return (
    <Box borderStyle="single" borderColor={C.dim} paddingX={1} marginTop={1}>
      <Text color={C.dim}>→ </Text>
      {isEmpty ? (
        <>
          {focus ? (
            <Text backgroundColor={C.text} color="black">
              {placeholder[0]}
            </Text>
          ) : (
            <Text color={C.dim}>{placeholder[0]}</Text>
          )}
          <Text color={C.dim}>{placeholder.slice(1)}</Text>
        </>
      ) : (
        <>
          <Text color={C.text}>{display}</Text>
          {focus ? (
            <Text backgroundColor={C.text} color="black">
              {" "}
            </Text>
          ) : null}
        </>
      )}
    </Box>
  );
};

const Footer = ({ text = "↓/↑ to navigate" }: { text?: string }) => (
  <Box marginTop={1} paddingLeft={2}>
    <Text color={C.dim}>{text}</Text>
  </Box>
);

const Option = ({ isSelected, label }: { isSelected?: boolean; label: string }) => (
  <Text color={isSelected ? C.text : C.dim} bold={isSelected}>
    {"  "}
    {isSelected ? "▣" : "☐"} {label}
  </Text>
);

const vaultLabel = (suffix?: string) => (suffix ? `lenver//${suffix}` : "lenver//");

const unlockErrorMessage: Record<UnlockFailureReason, string> = {
  incorrect_password: "Incorrect password or failed authentication.",
  invalid_format: "Vault file is not a valid lenver vault.",
  corrupt_vault: "Vault file is truncated or corrupted.",
  unsupported_version: "Vault version is not supported by this build.",
  filesystem_error: "Unable to read the vault file from disk.",
};

function scheduleClipboardClear(value: string) {
  setTimeout(async () => {
    try {
      if ((await clipboardy.read()) === value) {
        await clipboardy.write("");
      }
    } catch {}
  }, 30_000);
}

const DrivePick = ({ onPick }: { onPick: (drive: DriveInfo) => void }) => {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    detectDrives()
      .then((foundDrives) => {
        setDrives(foundDrives);
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <Hex title="Scanning..." sub="detecting drives" />;
  }

  if (drives.length === 0) {
    return (
      <Box flexDirection="column">
        <FilePath path="sys://drives" />
        <Hex title="No drives detected" sub="use --drive or retry with a mounted folder" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <FilePath path="sys://drives" />
      <Text color={C.dim} italic>
        {"  "}Running drive detection to find valid targets.
      </Text>
      <Box marginTop={1} />

      <Hex title={`Found ${drives.length} drives`} />
      <SelectInput
        items={drives.map((drive, index) => ({
          label: drive.label || drive.path,
          value: drive.path,
          key: `${drive.path}${index}`,
        }))}
        onSelect={(item) => {
          const drive = drives.find((candidate) => candidate.path === item.value);
          if (drive) {
            onPick(drive);
          }
        }}
        itemComponent={Option}
        indicatorComponent={() => <Text />}
      />
      <Footer text="↓/↑ navigate, Enter select" />
    </Box>
  );
};

const ConfirmDrive = ({
  drive,
  onConfirm,
  onCancel,
}: {
  drive: DriveInfo;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    fs.readdir(drive.path)
      .then((entries) => setFiles(entries.filter((entry) => !entry.startsWith("."))))
      .catch(() => setFiles([]));
  }, [drive.path]);

  return (
    <Box flexDirection="column">
      <FilePath path={drive.path} />
      <Text color={C.warn} italic>
        {"  "}This drive already has visible content on it.
      </Text>
      <Box marginTop={1} />

      <Hex title="Drive is not empty" sub={`${files.length} item${files.length === 1 ? "" : "s"} found`} />

      {files.slice(0, 6).map((file) => (
        <Box key={file}>
          <Text color={C.dim}>{"    ☐   "}</Text>
          <Text color={C.dim}>{file}</Text>
        </Box>
      ))}
      {files.length > 6 ? (
        <Box>
          <Text color={C.dim}>{"    ···  "}</Text>
          <Text color={C.dim}>and {files.length - 6} more</Text>
        </Box>
      ) : null}

      <Box marginTop={1} />
      <Text color={C.warn}>{"  "}Initialize a vault here anyway?</Text>
      <SelectInput
        items={[
          { label: "Yes, initialize vault here", value: "confirm" },
          { label: "No, pick a different drive", value: "cancel" },
        ]}
        itemComponent={Option}
        indicatorComponent={() => <Text />}
        onSelect={(item) => {
          if (item.value === "confirm") {
            onConfirm();
            return;
          }

          onCancel();
        }}
      />
      <Footer text="↓/↑ navigate, Enter select" />
    </Box>
  );
};

const Unlock = ({
  onUnlock,
  onCancel,
}: {
  onUnlock: (password: string) => Promise<UnlockFailureReason | null>;
  onCancel: () => void;
}) => {
  const [loading, setLoading] = useState(false);
  const [errorReason, setErrorReason] = useState<UnlockFailureReason | null>(null);
  const [inputVersion, setInputVersion] = useState(0);

  const submit = async (password: string) => {
    if (!password) {
      return;
    }

    setLoading(true);
    setErrorReason(null);
    const reason = await onUnlock(password);
    if (reason) {
      setErrorReason(reason);
      setInputVersion((current) => current + 1);
      setLoading(false);
    }
  };

  if (loading) {
    return <Hex title="Unlocking..." sub="deriving key and decrypting vault" />;
  }

  return (
    <Box flexDirection="column">
      <FilePath path={vaultLabel()} />
      <Text color={C.dim} italic>
        {"  "}Decrypting storage to establish a secure session.
      </Text>
      <Box marginTop={1} />

      <Hex title="Vault is locked" />
      {errorReason ? <Text color={C.err}>{`  ${unlockErrorMessage[errorReason]}`}</Text> : null}

      <Input
        key={inputVersion}
        placeholder="Enter master password"
        mask
        focus
        onCancel={onCancel}
        onSubmit={submit}
      />
      <Footer text="Enter to unlock, Esc to change drive" />
    </Box>
  );
};

const Init = ({
  onInit,
}: {
  onInit: (password: string, hint: string) => Promise<void>;
}) => {
  const [step, setStep] = useState<"pw" | "confirm" | "hint">("pw");
  const [password, setPassword] = useState("");
  const [hint, setHint] = useState("");
  const [showMismatch, setShowMismatch] = useState(false);
  const [confirmInputVersion, setConfirmInputVersion] = useState(0);

  const stepIndex = ["pw", "confirm", "hint"].indexOf(step);
  const getState = (index: number): ChecklistState => {
    if (index < stepIndex) {
      return "done";
    }

    if (index === stepIndex) {
      return "active";
    }

    return "pending";
  };

  return (
    <Box flexDirection="column">
      <FilePath path={vaultLabel()} />
      <Text color={C.dim} italic>
        {"  "}Running initialization to establish secure context.
      </Text>
      <Box marginTop={1} />

      <Hex title="Create a password" />
      <Item state={getState(0)} label="Set password" />
      <Item state={getState(1)} label="Confirm password" />
      <Item state={getState(2)} label="Set hint" />
      <Text color={C.dim}>{"  "}Hint is optional and stored with the vault metadata.</Text>

      {showMismatch ? <Text color={C.err}>{"  "}Passwords do not match.</Text> : null}

      <Box marginTop={1} />
      {step === "pw" ? (
        <Input
          placeholder="Enter password"
          mask
          focus
          onSubmit={(nextPassword) => {
            if (!nextPassword) {
              return;
            }

            setPassword(nextPassword);
            setStep("confirm");
          }}
        />
      ) : null}
      {step === "confirm" ? (
        <Input
          key={confirmInputVersion}
          placeholder="Confirm password"
          mask
          focus
          onSubmit={(confirmPassword) => {
            if (confirmPassword !== password) {
              setShowMismatch(true);
              setConfirmInputVersion((current) => current + 1);
              return;
            }

            setShowMismatch(false);
            setStep("hint");
          }}
        />
      ) : null}
      {step === "hint" ? (
        <Input
          initialValue={hint}
          placeholder="Add hint (optional)"
          focus
          onSubmit={async (nextHint) => {
            setHint(nextHint);
            await onInit(password, nextHint.trim());
          }}
        />
      ) : null}

      <Footer text="Enter to continue" />
    </Box>
  );
};

const Dashboard = ({
  onSelect,
  onAdd,
  onChangeDrive,
  onExit,
}: {
  onSelect: (keyName: string) => void;
  onAdd: () => void;
  onChangeDrive: () => void;
  onExit: () => void;
}) => {
  const items = [
    { label: "Add new secret", value: "__add__" },
    ...vault.listSecrets().map((keyName) => ({ label: keyName, value: keyName })),
    { label: "Change drive", value: "__drive__" },
    { label: "Exit", value: "__exit__" },
  ];

  return (
    <Box flexDirection="column">
      <FilePath path={vaultLabel()} />
      <Text color={C.dim} italic>
        {"  "}Listening for vault modifications and commands.
      </Text>
      <Box marginTop={1} />

      <Hex title="Vault actions" sub={vault.listSecrets().length === 0 ? "no secrets stored yet" : undefined} />
      {vault.listSecrets().length === 0 ? (
        <Text color={C.dim}>{"  "}Start with \"Add new secret\" to create your first env key.</Text>
      ) : null}
      <SelectInput
        items={items}
        itemComponent={Option}
        indicatorComponent={() => <Text />}
        onSelect={(item) => {
          if (item.value === "__add__") {
            onAdd();
            return;
          }

          if (item.value === "__drive__") {
            onChangeDrive();
            return;
          }

          if (item.value === "__exit__") {
            onExit();
            return;
          }

          onSelect(item.value);
        }}
      />
      <Footer text="↓/↑ navigate, Enter select" />
    </Box>
  );
};

const Details = ({
  keyName,
  onBack,
}: {
  keyName: string;
  onBack: () => void;
}) => {
  const entry = vault.getSecret(keyName);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!entry) {
    return (
      <Box flexDirection="column">
        <FilePath path={vaultLabel(keyName)} />
        <Hex title="Secret not found" />
        <Text color={C.err}>{"  "}The selected secret no longer exists.</Text>
        <Box marginTop={1} />
        <SelectInput
          items={[{ label: "Back", value: "back" }]}
          itemComponent={Option}
          indicatorComponent={() => <Text />}
          onSelect={() => onBack()}
        />
        <Footer text="Enter to go back" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <FilePath path={vaultLabel(keyName)} />
      <Box marginTop={1} />

      <Hex title={`Inspecting ${keyName}`} />
      {entry.note ? <Text color={C.dim}>{`  note   ${entry.note}`}</Text> : null}
      <Text>
        {"  "}
        <Text color={C.dim}>value  </Text>
        {shown ? <Text color={C.reveal}>{entry.value}</Text> : <Text color={C.dim}>{"•".repeat(16)}</Text>}
      </Text>
      {error ? <Text color={C.err}>{`  ${error}`}</Text> : null}

      <Box marginTop={1} />
      <SelectInput
        items={[
          { label: copied ? "Copied!" : "Copy value", value: "copy" },
          { label: shown ? "Hide value" : "Reveal value", value: "reveal" },
          { label: "Delete secret", value: "delete" },
          { label: "Back", value: "back" },
        ]}
        itemComponent={Option}
        indicatorComponent={() => <Text />}
        onSelect={async (item) => {
          if (item.value === "back") {
            onBack();
            return;
          }

          if (item.value === "reveal") {
            setShown((current) => !current);
            return;
          }

          if (item.value === "copy") {
            await clipboardy.write(entry.value);
            scheduleClipboardClear(entry.value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            return;
          }

          try {
            await vault.deleteSecret(keyName);
            onBack();
          } catch {
            setError("Unable to delete the secret.");
          }
        }}
      />
      <Footer text="↓/↑ navigate, Enter action" />
    </Box>
  );
};

const Add = ({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) => {
  const [step, setStep] = useState<"name" | "value" | "note">("name");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const existingSecret = name ? vault.getSecret(name.trim().toUpperCase()) : undefined;

  const stepIndex = ["name", "value", "note"].indexOf(step);
  const getState = (index: number): ChecklistState => {
    if (index < stepIndex) {
      return "done";
    }

    if (index === stepIndex) {
      return "active";
    }

    return "pending";
  };

  return (
    <Box flexDirection="column">
      <FilePath path={vaultLabel("new")} />
      <Text color={C.dim} italic>
        {"  "}Running secret configuration.
      </Text>
      <Box marginTop={1} />

      <Hex title="Create a new key" />
      <Item state={getState(0)} label={`Name${step !== "name" ? `  ${name}` : ""}`} />
      <Item state={getState(1)} label={`Value${step === "note" ? "  ••••••••" : ""}`} />
      <Item state={getState(2)} label="Note" />
      {step === "name" ? <Text color={C.dim}>{"  "}Use env-style names: A-Z, 0-9, and underscores.</Text> : null}
      {existingSecret ? <Text color={C.warn}>{"  "}This key already exists and will be replaced.</Text> : null}

      {error ? <Text color={C.err}>{`  ${error}`}</Text> : null}

      <Box marginTop={1} />
      {step === "name" ? (
        <Input
          placeholder="KEY_NAME"
          focus
          normalize={(next) => next.toUpperCase()}
          onCancel={onCancel}
          onSubmit={(nextName) => {
            const normalizedName = nextName.trim().toUpperCase();
            if (!normalizedName) {
              setError("Key name cannot be empty.");
              return;
            }

            if (!/^[A-Z][A-Z0-9_]*$/.test(normalizedName)) {
              setError("Use only A-Z, 0-9, and _ with a leading letter.");
              return;
            }

            setError(null);
            setName(normalizedName);
            setStep("value");
          }}
        />
      ) : null}
      {step === "value" ? (
        <Input
          placeholder="Secret value"
          mask
          focus
          onCancel={onCancel}
          onSubmit={(nextValue) => {
            if (!nextValue.trim()) {
              setError("Secret value cannot be empty.");
              return;
            }

            setError(null);
            setValue(nextValue);
            setStep("note");
          }}
        />
      ) : null}
      {step === "note" ? (
        <Input
          initialValue={note}
          placeholder="Add note (optional)"
          focus
          onCancel={onCancel}
          onSubmit={async (nextNote) => {
            try {
              setNote(nextNote);
              await vault.setSecret(name.trim().toUpperCase(), {
                value,
                note: nextNote.trim() || undefined,
              });
              setError(null);
              onDone();
            } catch {
              setError("Unable to save the secret.");
            }
          }}
        />
      ) : null}

      <Footer text="Enter to continue, Esc to cancel" />
    </Box>
  );
};

export default function App() {
  const { exit } = useApp();
  const [view, setView] = useState<View>("BOOT");
  const [selected, setSelected] = useState<string | null>(null);
  const [vaultPath, setVaultPath] = useState(vault.getVaultPath());
  const [pendingDrive, setPendingDrive] = useState<DriveInfo | null>(null);

  useEffect(() => {
    (async () => {
      const lastVaultPath = await loadLastVaultPath();
      if (lastVaultPath) {
        const vaultDir = lastVaultPath.replace(/\/[^/]+$/, "");
        vault.setVaultDir(vaultDir);
        setVaultPath(vault.getVaultPath());
        if (await vault.exists()) {
          setView("UNLOCK");
          return;
        }
      }

      setView("DRIVE_PICK");
    })();
  }, []);

  const pickDrive = async (drive: DriveInfo) => {
    vault.setVaultDir(drive.path);
    setVaultPath(vault.getVaultPath());

    if (await vault.exists()) {
      setView("UNLOCK");
      return;
    }

    const visibleEntries = await fs
      .readdir(drive.path)
      .then((entries) => entries.filter((entry) => !entry.startsWith(".")))
      .catch(() => [] as string[]);

    if (visibleEntries.length > 0) {
      setPendingDrive(drive);
      setView("CONFIRM_DRIVE");
      return;
    }

    setView("INIT");
  };

  const unlock = async (password: string): Promise<UnlockFailureReason | null> => {
    const result = await vault.unlock(password);
    if (!result.ok) {
      return result.reason;
    }

    setView("DASHBOARD");
    return null;
  };

  if (view === "BOOT") {
    return (
      <Box>
        <Hex title="Booting..." />
      </Box>
    );
  }

  if (view === "DRIVE_PICK") {
    return <DrivePick onPick={pickDrive} />;
  }

  if (view === "UNLOCK") {
    return <Unlock onUnlock={unlock} onCancel={() => setView("DRIVE_PICK")} />;
  }

  if (view === "INIT") {
    return (
      <Init
        onInit={async (password, hint) => {
          await vault.init(password, hint);
          setView("DASHBOARD");
        }}
      />
    );
  }

  if (view === "CONFIRM_DRIVE" && pendingDrive) {
    return (
      <ConfirmDrive
        drive={pendingDrive}
        onConfirm={() => {
          setPendingDrive(null);
          setView("INIT");
        }}
        onCancel={() => {
          setPendingDrive(null);
          setView("DRIVE_PICK");
        }}
      />
    );
  }

  if (view === "DASHBOARD") {
    return (
      <Dashboard
        onSelect={(keyName) => {
          setSelected(keyName);
          setView("DETAILS");
        }}
        onAdd={() => setView("ADD")}
        onChangeDrive={() => setView("DRIVE_PICK")}
        onExit={exit}
      />
    );
  }

  if (view === "DETAILS" && selected) {
    return <Details keyName={selected} onBack={() => setView("DASHBOARD")} />;
  }

  if (view === "ADD") {
    return <Add onDone={() => setView("DASHBOARD")} onCancel={() => setView("DASHBOARD")} />;
  }

  return null;
}