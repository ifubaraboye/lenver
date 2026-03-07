import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import SelectInput from "ink-select-input";
import clipboardy from "clipboardy";
import { vault, detectDrives, loadLastVaultPath, type DriveInfo } from "./crypto";

type View = "BOOT" | "DRIVE_PICK" | "UNLOCK" | "INIT" | "DASHBOARD" | "ADD" | "DETAILS";

// ─── Design tokens (screenshot-faithful) ──────────────────────────────────────
const C = {
  hex:    "#e2e8f0", // mint green — the ⬢ icon color
  text:   "#e2e8f0", // primary text
  dim:    "#4b5563", // dim text / pending items
  err:    "#f87171", // error red
  warn:   "#fbbf24", // hint yellow
  reveal: "#67e8f9", // revealed secret cyan
};

// ─── ⬢ Section header — padded to feel large ─────────────────────────────────
const Hex = ({ title, sub }: { title: string; sub?: string }) => (
  <Box flexDirection="column" marginTop={1} marginBottom={1}>
    <Box>
      <Text color={C.hex} bold>{"  ⬢  "}</Text>
      <Text color={C.text} bold> {title}</Text>
      {sub ? <Text color={C.dim}>  {sub}</Text> : null}
    </Box>
  </Box>
);

// ─── Checklist items — taller rows, wide symbol gutter ───────────────────────
const Item = ({ state, label }: { state: "done" | "active" | "pending"; label: string }) => {
  if (state === "done")
    return (
      <Box>
        <Text color={C.dim}>{"    ☒   "}</Text>
        <Text color={C.dim}>{label}</Text>
      </Box>
    );
  if (state === "active")
    return (
      <Box>
        <Text color={C.hex} bold>{"    ▣   "}</Text>
        <Text color={C.text} bold>{label}</Text>
      </Box>
    );
  return (
    <Box>
      <Text color={C.dim}>{"    ☐   "}</Text>
      <Text color={C.dim}>{label}</Text>
    </Box>
  );
};

// ─── Bordered file path box ────────────────────────────────────────────────────
const FilePath = ({ path, tag }: { path: string; tag?: string }) => (
  <Box borderStyle="single" borderColor={C.dim} paddingX={1} marginBottom={1}>
    <Text color={C.text}>{path}</Text>
    {tag ? <Text color={C.hex}> {tag}</Text> : null}
  </Box>
);

// ─── Bordered → input with block cursor (screenshot-faithful) ─────────────────
const Input = ({
  value, onChange, placeholder, focus = false, mask, onSubmit,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  focus?: boolean; mask?: boolean; onSubmit?: () => void;
}) => {
  useInput((input, key) => {
    if (!focus) return;
    if (key.backspace || key.delete) onChange(value.slice(0, -1));
    else if (key.return) onSubmit?.();
    else if (input && !key.ctrl && !key.meta && !key.backspace && !key.delete) onChange(value + input);
  }, { isActive: focus });

  const display = mask ? "•".repeat(value.length) : value;
  const empty   = value.length === 0;

  return (
    <Box borderStyle="single" borderColor={C.dim} paddingX={1} marginTop={1}>
      <Text color={C.dim}>→ </Text>
      {empty ? (
        <>
          {focus
            ? <Text backgroundColor={C.text} color="black">{placeholder![0]}</Text>
            : <Text color={C.dim}>{placeholder![0]}</Text>}
          <Text color={C.dim}>{placeholder!.slice(1)}</Text>
        </>
      ) : (
        <>
          <Text color={C.text}>{display}</Text>
          {focus && <Text backgroundColor={C.text} color="black">{" "}</Text>}
        </>
      )}
    </Box>
  );
};

// ─── Footer ───────────────────────────────────────────────────────────────────
const Footer = ({ left, right }: { left: string; right?: string }) => (
  <Box marginTop={1} flexDirection="column">
    <Text color={C.dim}>
      {left}
      {right ? <Text> · {right}</Text> : null}
    </Text>
    <Text color={C.dim}>/ for commands · ↓/↑ to navigate</Text>
  </Box>
);

// ─── Select (matches screenshot checklist visual) ─────────────────────────────
const Option = ({ isSelected, label }: { isSelected?: boolean; label: string }) => (
  <Text color={isSelected ? C.text : C.dim} bold={isSelected}>
    {"  "}{isSelected ? "▣" : "☐"} {label}
  </Text>
);

// ─── Views ────────────────────────────────────────────────────────────────────

const DrivePick = ({ onPick }: { onPick: (d: DriveInfo) => void }) => {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [ready, setReady]   = useState(false);

  useEffect(() => { detectDrives().then(d => { setDrives(d); setReady(true); }); }, []);

  if (!ready) return <Hex title="Scanning..." sub="detecting drives" />;

  return (
    <Box flexDirection="column">
      <FilePath path="sys://drives" />
      <Text color={C.dim} italic>  Running drive detection to find valid targets.</Text>
      <Box marginTop={1} />

      <Hex title={`Found ${drives.length} drives`} />
      <SelectInput
        items={drives.map((d, i) => ({ label: d.label ?? d.path, value: d.path, key: `${d.path}${i}` }))}
        onSelect={item => onPick(drives.find(d => d.path === item.value)!)}
        itemComponent={Option}
        indicatorComponent={() => <Text />}
      />
      <Footer left="LVR-1 · Drive Selection · Local Compute" />
    </Box>
  );
};

const Unlock = ({ onUnlock, hint, vaultPath }: {
  onUnlock: (pw: string) => Promise<void>; hint?: string; vaultPath: string;
}) => {
  const [pw,      setPw]      = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(false);

  const submit = async () => {
    if (!pw) return;
    setLoading(true); setError(false);
    try { await onUnlock(pw); }
    catch { setError(true); setLoading(false); setPw(""); }
  };

  if (loading) return <Hex title="Cooking..." />;

  return (
    <Box flexDirection="column">
      <FilePath path={`vol://${vaultPath}`} />
      <Text color={C.dim} italic>  Decrypting storage to ensure secure memory access.</Text>
      <Box marginTop={1} />

      <Hex title="Vault is locked" />
      {hint  && <Text color={C.warn}>{"  "}hint: {hint}</Text>}
      {error && <Text color={C.err} >{"  "}Decryption failed — bad password.</Text>}

      <Input value={pw} onChange={setPw} placeholder="Enter master password" mask focus onSubmit={submit} />
      <Footer left="LVR-1 · Auth Phase · Local Compute" />
    </Box>
  );
};

const Init = ({ onInit, vaultPath }: { onInit: (pw: string, h: string) => Promise<void>; vaultPath: string }) => {
  const [step,    setStep]    = useState<"pw" | "confirm" | "hint">("pw");
  const [pw,      setPw]      = useState("");
  const [confirm, setConfirm] = useState("");
  const [hint,    setHint]    = useState("");
  const [bad,     setBad]     = useState(false);

  const submit = async () => {
    if (step === "pw"      && pw)          { setStep("confirm"); }
    else if (step === "confirm") {
      if (confirm !== pw) { setBad(true); setConfirm(""); }
      else { setBad(false); setStep("hint"); }
    }
    else if (step === "hint") { await onInit(pw, hint.trim()); }
  };

  const idx = ["pw", "confirm", "hint"].indexOf(step);
  const states = (i: number): "done" | "active" | "pending" => i < idx ? "done" : i === idx ? "active" : "pending";

  return (
    <Box flexDirection="column">
      <FilePath path={`vol://${vaultPath}`} />
      <Text color={C.dim} italic>  Running initialization to establish secure context.</Text>
      <Box marginTop={1} />

      <Hex title="Create a password" />
      <Item state={states(0)} label="Set password" />
      <Item state={states(1)} label="Confirm password" />
      <Item state={states(2)} label="Set hint" />

      {bad && <Text color={C.err}>{"  "}Passwords don't match.</Text>}

      <Box marginTop={1} />
      {step === "pw"      && <Input value={pw}      onChange={setPw}      placeholder="Enter password"    mask focus onSubmit={submit} />}
      {step === "confirm" && <Input value={confirm}  onChange={setConfirm} placeholder="Confirm password"  mask focus onSubmit={submit} />}
      {step === "hint"    && <Input value={hint}     onChange={setHint}    placeholder="Add hint (optional)" focus onSubmit={submit} />}

      <Footer left="LVR-1 · Initialization · Local Compute" />
    </Box>
  );
};

const Dashboard = ({ vaultPath, onSelect, onAdd, onChangeDrive, onExit }: {
  vaultPath: string; onSelect: (k: string) => void; onAdd: () => void; onChangeDrive: () => void; onExit: () => void;
}) => {
  const secrets = Object.keys(vault.data ?? {}).filter(k => k !== "__meta__");
  const items = [
    { label: "Add new secret",  value: "__add__"   },
    ...secrets.map(k => ({ label: k, value: k })),
    { label: "Change drive",    value: "__drive__"  },
    { label: "Exit",            value: "__exit__"   },
  ];

  return (
    <Box flexDirection="column">
      <FilePath path={`vol://${vaultPath}`} />
      <Text color={C.dim} italic>  Listening for vault modifications and commands.</Text>
      <Box marginTop={1} />

      <Hex title="Vault actions" />
      <SelectInput
        items={items}
        itemComponent={Option}
        indicatorComponent={() => <Text />}
        onSelect={item => {
          if (item.value === "__add__")        onAdd();
          else if (item.value === "__drive__") onChangeDrive();
          else if (item.value === "__exit__")  onExit();
          else onSelect(item.value);
        }}
      />
      <Footer left={`LVR-1 · ${secrets.length} secret${secrets.length !== 1 ? "s" : ""} · Local Compute`} />
    </Box>
  );
};

const Details = ({ keyName, vaultPath, onBack }: { keyName: string; vaultPath: string; onBack: () => void }) => {
  const entry    = vault.data?.[keyName];
  const [shown,  setShown]  = useState(false);
  const [copied, setCopied] = useState(false);

  const items = [
    { label: copied ? "Copied!" : "Copy value",             value: "copy"   },
    { label: shown  ? "Hide value" : "Reveal value",        value: "reveal" },
    { label: "Delete secret",                               value: "delete" },
    { label: "Back",                                        value: "back"   },
  ];

  return (
    <Box flexDirection="column">
      <FilePath path={`vol://${vaultPath}`} tag={keyName} />
      <Box marginTop={1} />

      <Hex title={`Inspecting ${keyName}`} />
      {entry?.note && <Text color={C.dim}>{"  "}note   {entry.note}</Text>}
      <Text>
        {"  "}
        <Text color={C.dim}>value  </Text>
        {shown
          ? <Text color={C.reveal}>{entry?.value}</Text>
          : <Text color={C.dim}>{"•".repeat(16)}</Text>}
      </Text>

      <Box marginTop={1} />
      <SelectInput
        items={items}
        itemComponent={Option}
        indicatorComponent={() => <Text />}
        onSelect={async i => {
          if (i.value === "back")   onBack();
          if (i.value === "reveal") setShown(s => !s);
          if (i.value === "copy") {
            await clipboardy.write(entry?.value ?? "");
            setCopied(true); setTimeout(() => setCopied(false), 2000);
          }
          if (i.value === "delete" && vault.data) {
            delete vault.data[keyName]; await vault.save(); onBack();
          }
        }}
      />
      <Footer left="LVR-1 · Inspection · Local Compute" />
    </Box>
  );
};

const Add = ({ vaultPath, onDone, onCancel }: { vaultPath: string; onDone: () => void; onCancel: () => void }) => {
  const [step,  setStep]  = useState<"name" | "value" | "note">("name");
  const [name,  setName]  = useState("");
  const [value, setValue] = useState("");
  const [note,  setNote]  = useState("");

  useInput(async (_, key) => {
    if (key.escape) { onCancel(); return; }
    if (!key.return) return;
    if (step === "name"  && name.trim())  setStep("value");
    else if (step === "value" && value.trim()) setStep("note");
    else if (step === "note") {
      if (vault.data) {
        vault.data[name.trim().toUpperCase()] = { value, note: note.trim() || undefined };
        await vault.save();
      }
      onDone();
    }
  });

  const idx = ["name", "value", "note"].indexOf(step);
  const states = (i: number): "done" | "active" | "pending" => i < idx ? "done" : i === idx ? "active" : "pending";

  return (
    <Box flexDirection="column">
      <FilePath path={`vol://${vaultPath}`} tag="new" />
      <Text color={C.dim} italic>  Running secret configuration.</Text>
      <Box marginTop={1} />

      <Hex title="Create a new key" />
      <Item state={states(0)} label={`Name${step !== "name"  ? `  ${name}` : ""}`} />
      <Item state={states(1)} label={`Value${step === "note" ? "  ••••••••" : ""}`} />
      <Item state={states(2)} label="Note" />

      <Box marginTop={1} />
      {step === "name"  && <Input value={name.toUpperCase()} onChange={v => setName(v.toUpperCase())} placeholder="KEY_NAME" focus />}
      {step === "value" && <Input value={value} onChange={setValue} placeholder="Secret value" mask focus />}
      {step === "note"  && <Input value={note}  onChange={setNote}  placeholder="Add note (optional)" focus />}

      <Footer left="LVR-1 · Add Mode · Local Compute" right="esc to cancel" />
    </Box>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { exit } = useApp();
  const [view,      setView]      = useState<View>("BOOT");
  const [selected,  setSelected]  = useState<string | null>(null);
  const [vaultPath, setVaultPath] = useState("");
  const [hint,      setHint]      = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      const last = await loadLastVaultPath();
      if (last) {
        // Restore the known vault dir directly from the saved path
        const dir = last.replace(/\/[^\/]+$/, ""); // strip filename
        vault.setVaultDir(dir);
        setVaultPath(vault.getVaultPath());
        setView("UNLOCK");
      } else {
        await detectDrives();
        setView("DRIVE_PICK");
      }
    })();
  }, []);

  const pickDrive = async (d: DriveInfo) => {
    vault.setVaultDir(d.path); setVaultPath(vault.getVaultPath());
    setView((await vault.exists()) ? "UNLOCK" : "INIT");
  };

  const unlock = async (pw: string) => {
    if (!await vault.unlock(pw)) throw new Error();
    setHint(vault.data?.__meta__?.hint); setView("DASHBOARD");
  };

  if (view === "BOOT")        return <Box><Hex title="Booting..." /></Box>;
  if (view === "DRIVE_PICK")  return <DrivePick onPick={pickDrive} />;
  if (view === "UNLOCK")      return <Unlock onUnlock={unlock} hint={hint} vaultPath={vaultPath} />;
  if (view === "INIT")        return <Init onInit={async (pw, h) => { await vault.init(pw, h); setView("DASHBOARD"); }} vaultPath={vaultPath} />;
  if (view === "DASHBOARD")   return <Dashboard vaultPath={vaultPath} onSelect={k => { setSelected(k); setView("DETAILS"); }} onAdd={() => setView("ADD")} onChangeDrive={() => setView("DRIVE_PICK")} onExit={exit} />;
  if (view === "DETAILS" && selected) return <Details keyName={selected} vaultPath={vaultPath} onBack={() => setView("DASHBOARD")} />;
  if (view === "ADD")         return <Add vaultPath={vaultPath} onDone={() => setView("DASHBOARD")} onCancel={() => setView("DASHBOARD")} />;
  return null;
}