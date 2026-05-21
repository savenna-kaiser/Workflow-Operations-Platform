/**
 * processTopdeskChanges.js – Verarbeitet TopDesk-Changes automatisiert
 *
 * Wird entweder per Scheduler (Cron) aufgerufen oder manuell über
 * POST /api/topdesk/process
 *
 * Ablauf pro Change:
 *   1. TopDesk-Change holen & normalisieren
 *   2. AD-Aktion ausführen (via adClient)
 *   3. Audit-Log schreiben
 *   4. TopDesk-Status auf "Abgeschlossen" oder "Fehlgeschlagen" setzen
 *   5. Fortschrittsnotiz in TopDesk eintragen
 */

const adClient  = require("../../services/adClient");
const topdesk   = require("../../services/topdeskClient");
const { ACTION_TYPES, logSuccess, logFailure } = require("../../services/auditLog");

const ACTOR = "topdesk-automation";  // fester Actor für automatisierte Aktionen

// ─── Eintritt ────────────────────────────────────────────────────────────────

async function processEintritt(change, systemCredential) {
  const data = topdesk.normalizeEintritt(change);
  const { changeId, username, firstName, lastName, targetOU, groups, email, phoneNumber, department } = data;

  try {
    // 1. Benutzer in AD anlegen (neues PS-Kommando nötig – siehe psWorker)
    await adClient.createUser({
      sam:         username,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      email,
      phoneNumber,
      department,
      targetOU,
      enabled:     true,
    }, systemCredential);

    // 2. Gruppen zuweisen
    for (const groupDn of groups) {
      try {
        await adClient.addGroupMember(groupDn, username, systemCredential);
      } catch (groupErr) {
        // Einzelne Gruppenfehler nicht zum Abbruch führen lassen
        logFailure(ACTION_TYPES.GROUP_ADD, ACTOR, username, "user",
                   groupErr.message, { groupDn, changeId });
      }
    }

    logSuccess(ACTION_TYPES.USER_ENABLE, ACTOR, username, "user",
               { source: "topdesk", changeId, targetOU });

    await topdesk.addProgressNote(changeId,
      `✅ AD-Konto '${username}' wurde automatisch angelegt und in ${targetOU} erstellt.`);
    await topdesk.updateChangeStatus(changeId, "Abgeschlossen");

    return { ok: true, username, changeId };

  } catch (err) {
    logFailure(ACTION_TYPES.USER_ENABLE, ACTOR, username, "user",
               err.message, { source: "topdesk", changeId });

    await topdesk.addProgressNote(changeId,
      `❌ Fehler beim Anlegen des AD-Kontos '${username}': ${err.message}`).catch(() => {});
    await topdesk.updateChangeStatus(changeId, "Fehlgeschlagen").catch(() => {});

    throw err;
  }
}

// ─── Austritt ────────────────────────────────────────────────────────────────

async function processAustritt(change, systemCredential) {
  const data = topdesk.normalizeAustritt(change);
  const { changeId, username } = data;

  try {
    await adClient.disableUser(username, systemCredential);

    logSuccess(ACTION_TYPES.USER_DISABLE, ACTOR, username, "user",
               { source: "topdesk", changeId });

    await topdesk.addProgressNote(changeId,
      `✅ AD-Konto '${username}' wurde automatisch deaktiviert und in _Inactive verschoben.`);
    await topdesk.updateChangeStatus(changeId, "Abgeschlossen");

    return { ok: true, username, changeId };

  } catch (err) {
    logFailure(ACTION_TYPES.USER_DISABLE, ACTOR, username, "user",
               err.message, { source: "topdesk", changeId });

    await topdesk.addProgressNote(changeId,
      `❌ Fehler beim Deaktivieren von '${username}': ${err.message}`).catch(() => {});
    await topdesk.updateChangeStatus(changeId, "Fehlgeschlagen").catch(() => {});

    throw err;
  }
}

// ─── Abteilungswechsel ───────────────────────────────────────────────────────

async function processAbteilungswechsel(change, systemCredential) {
  const data = topdesk.normalizeAbteilungswechsel(change);
  const { changeId, username, newOU, newDepartment, groupsToAdd, groupsToRemove } = data;

  const errors = [];

  try {
    // 1. Department-Feld in AD aktualisieren
    if (newDepartment) {
      await adClient.editUser(username, { Department: newDepartment }, systemCredential);
    }

    // 2. In neue OU verschieben
    if (newOU) {
      await adClient.enableUser(username, newOU, systemCredential);  // Move ohne Enable/Disable
    }

    // 3. Gruppen entfernen
    for (const groupDn of groupsToRemove) {
      try {
        await adClient.removeGroupMember(groupDn, username, systemCredential);
        logSuccess(ACTION_TYPES.GROUP_REMOVE, ACTOR, username, "user",
                   { groupDn, source: "topdesk", changeId });
      } catch (err) {
        errors.push(`Gruppe entfernen fehlgeschlagen (${groupDn}): ${err.message}`);
        logFailure(ACTION_TYPES.GROUP_REMOVE, ACTOR, username, "user",
                   err.message, { groupDn, changeId });
      }
    }

    // 4. Gruppen hinzufügen
    for (const groupDn of groupsToAdd) {
      try {
        await adClient.addGroupMember(groupDn, username, systemCredential);
        logSuccess(ACTION_TYPES.GROUP_ADD, ACTOR, username, "user",
                   { groupDn, source: "topdesk", changeId });
      } catch (err) {
        errors.push(`Gruppe hinzufügen fehlgeschlagen (${groupDn}): ${err.message}`);
        logFailure(ACTION_TYPES.GROUP_ADD, ACTOR, username, "user",
                   err.message, { groupDn, changeId });
      }
    }

    logSuccess(ACTION_TYPES.USER_MOVE, ACTOR, username, "user",
               { source: "topdesk", changeId, newOU, newDepartment });

    const note = errors.length > 0
      ? `⚠️ Abteilungswechsel für '${username}' teilweise ausgeführt. Fehler:\n${errors.join("\n")}`
      : `✅ Abteilungswechsel für '${username}' vollständig ausgeführt. Neue OU: ${newOU}`;

    await topdesk.addProgressNote(changeId, note);
    await topdesk.updateChangeStatus(changeId, errors.length > 0 ? "Fehlgeschlagen" : "Abgeschlossen");

    return { ok: errors.length === 0, username, changeId, errors };

  } catch (err) {
    logFailure(ACTION_TYPES.USER_MOVE, ACTOR, username, "user",
               err.message, { source: "topdesk", changeId });

    await topdesk.addProgressNote(changeId,
      `❌ Kritischer Fehler beim Abteilungswechsel für '${username}': ${err.message}`).catch(() => {});
    await topdesk.updateChangeStatus(changeId, "Fehlgeschlagen").catch(() => {});

    throw err;
  }
}

// ─── Batch-Verarbeitung ──────────────────────────────────────────────────────

/**
 * Verarbeitet alle offenen TopDesk-Changes.
 * Wird vom Cron-Job oder der API-Route aufgerufen.
 *
 * @param {object} systemCredential  – AD-Credential für den Service-Account
 * @returns {{ processed: number, errors: number, results: array }}
 */
async function processPendingChanges(systemCredential) {
  const results  = [];
  let processed  = 0;
  let errorCount = 0;

  const types = ["EINTRITT", "AUSTRITT", "ABT_WECHSEL"];

  for (const type of types) {
    let changes = [];
    try {
      changes = await topdesk.getChanges(type);
    } catch (err) {
      console.error(`[TopDesk] Fehler beim Laden von ${type}-Changes:`, err.message);
      continue;
    }

    for (const change of changes) {
      try {
        let result;
        if (type === "EINTRITT")       result = await processEintritt(change, systemCredential);
        else if (type === "AUSTRITT")  result = await processAustritt(change, systemCredential);
        else                           result = await processAbteilungswechsel(change, systemCredential);

        results.push({ type, ...result });
        processed++;
      } catch (err) {
        results.push({ type, changeId: change.number, ok: false, error: err.message });
        errorCount++;
      }
    }
  }

  return { processed, errors: errorCount, results };
}

module.exports = {
  processEintritt,
  processAustritt,
  processAbteilungswechsel,
  processPendingChanges,
};
