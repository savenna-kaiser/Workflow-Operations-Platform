// =========================================
// routes/exchange.js
// Exchange / Out-of-Office
// =========================================
"use strict";

const express            = require("express");
const router             = express.Router();
const { requireAuth }    = require("../auth");
const { runPSForReq, logAction } = require("../powershell");

router.use(requireAuth);

// GET /api/exchange/oof?sam=<user>
// Out-of-Office-Konfiguration laden
router.get("/oof", async (req, res) => {
    const { sam } = req.query;
    if (!sam) return res.status(400).json({ success: false, error: "sam fehlt" });
    const result = await runPSForReq(req, "Get-OutOfOffice.ps1", {
        SamAccountName: sam,
    }, { timeout: 30_000 });
    res.json(result);
});

// POST /api/exchange/oof
// Out-of-Office speichern
// Body: { sam, state, internalMessage, externalMessage, externalAudience, startTime?, endTime? }
router.post("/oof", async (req, res) => {
    const {
        sam,
        state            = "Disabled",   // Disabled | Enabled | Scheduled
        internalMessage  = "",
        externalMessage  = "",
        externalAudience = "None",       // None | All
        startTime        = "",
        endTime          = "",
    } = req.body || {};

    if (!sam) return res.status(400).json({ success: false, error: "sam fehlt" });
    if (state === "Scheduled" && (!startTime || !endTime)) {
        return res.status(400).json({ success: false, error: "Von/Bis-Datum erforderlich für Scheduled-Modus" });
    }

    logAction(`[ACTION] OOF: ${sam} State=${state} by ${req.session.username}`);

    const result = await runPSForReq(req, "Set-OutOfOffice.ps1", {
        SamAccountName:  sam,
        State:           state,
        InternalMessage: internalMessage,
        ExternalMessage: externalMessage,
        ExternalAudience:externalAudience,
        StartTime:       startTime,
        EndTime:         endTime,
    }, { timeout: 30_000 });

    res.json(result);
});

module.exports = router;
