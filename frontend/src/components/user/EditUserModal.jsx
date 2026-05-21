import { useState } from "react";
import { X, Loader2 } from "lucide-react";

const FIELDS = [
  { key: "GivenName",   label: "Vorname" },
  { key: "Surname",     label: "Nachname" },
  { key: "DisplayName", label: "Anzeigename" },
  { key: "Title",       label: "Position" },
  { key: "Department",  label: "Abteilung" },
  { key: "Office",      label: "Büro" },
  { key: "OfficePhone", label: "Telefon" },
  { key: "MobilePhone", label: "Mobil" },
  { key: "Description", label: "Beschreibung" },
];

export default function EditUserModal({ user, onClose, onSave }) {
  const [form, setForm]     = useState({
    GivenName:   user.GivenName   || "",
    Surname:     user.Surname     || "",
    DisplayName: user.DisplayName || "",
    Title:       user.Title       || "",
    Department:  user.Department  || "",
    Office:      user.Office      || "",
    OfficePhone: user.OfficePhone || "",
    MobilePhone: user.MobilePhone || "",
    Description: user.Description || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // Nur geänderte Felder schicken
    const changes = {};
    FIELDS.forEach(({ key }) => {
      if (form[key] !== (user[key] || "")) changes[key] = form[key];
    });
    if (Object.keys(changes).length === 0) { onClose(); return; }
    try { await onSave(changes); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Benutzer bearbeiten" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 p-4">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className={key === "Description" ? "col-span-2" : ""}>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              {label}
            </label>
            <input
              className="input text-sm"
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} />
    </Modal>
  );
}

// ─── Passwort-Reset Modal ────────────────────────────────────────────────────
export function ResetPwModal({ sam, onClose, onSave }) {
  const [pw, setPw]             = useState("");
  const [mustChange, setMust]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const handleSave = async () => {
    if (pw.length < 8) return;
    setSaving(true);
    try { await onSave({ newPassword: pw, mustChange, cannotChange: false }); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={`Passwort zurücksetzen – ${sam}`} onClose={onClose}>
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Neues Passwort
          </label>
          <input
            className="input text-sm"
            type="password"
            placeholder="Mind. 8 Zeichen, Groß/Klein/Zahl"
            value={pw}
            onChange={e => setPw(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer"
               style={{ color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={mustChange} onChange={e => setMust(e.target.checked)} />
          Passwort bei nächster Anmeldung ändern
        </label>
      </div>
      <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} saveLabel="Zurücksetzen" />
    </Modal>
  );
}

// ─── Gruppe hinzufügen Modal ─────────────────────────────────────────────────
export function AddGroupModal({ sam, onClose, onAdd }) {
  const [dn, setDn]         = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!dn.trim()) return;
    setSaving(true);
    try { await onAdd(dn.trim()); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Gruppe hinzufügen" onClose={onClose}>
      <div className="p-4">
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
          Distinguished Name der Gruppe
        </label>
        <input
          className="input text-sm font-mono"
          placeholder="CN=Gruppe,OU=GROUP,DC=company,DC=internal"
          value={dn}
          onChange={e => setDn(e.target.value)}
        />
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Den DN findest du in den AD-Gruppen-Eigenschaften.
        </p>
      </div>
      <ModalFooter onClose={onClose} onSave={handleAdd} saving={saving} saveLabel="Hinzufügen" />
    </Modal>
  );
}

// ─── Basis-Modal ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
           style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b"
             style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSave, saving, saveLabel = "Speichern" }) {
  return (
    <div className="flex justify-end gap-2 px-4 py-3 border-t"
         style={{ borderColor: "var(--border)" }}>
      <button onClick={onClose} className="btn-secondary text-sm">Abbrechen</button>
      <button onClick={onSave} disabled={saving} className="btn-primary text-sm disabled:opacity-40">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveLabel}
      </button>
    </div>
  );
}
