// =========================================
// routes/groups.js
// Gruppenverwaltung
// =========================================
"use strict";

const express            = require("express");
const router             = express.Router();
const { requireAuth }    = require("../auth");
const { runPSForReq, logAction } = require("../powershell");

router.use(requireAuth);

// GET /api/groups?sam=<user>
// Gruppen eines Benutzers abfragen
router.get("/", async (req, res) => {
    const { sam } = req.query;
    if (!sam) return res.status(400).json({ success: false, error: "sam fehlt" });
    const result = await runPSForReq(req, "Get-UserGroups.ps1", { SamAccountName: sam });
    res.json(result);
});

// GET /api/groups/all
// Alle verfügbaren Gruppen (für Auswahlpicker)
router.get("/all", async (req, res) => {
    const result = await runPSForReq(req, "Get-AllGroups.ps1", {});
    res.json(result);
});

// POST /api/groups/add
// Body: { userSam, groupDN }
router.post("/add", async (req, res) => {
    const { userSam, groupDN } = req.body || {};
    if (!userSam || !groupDN) {
        return res.status(400).json({ success: false, error: "userSam und groupDN erforderlich" });
    }
    logAction(`[ACTION] AddGroup: ${userSam} -> ${groupDN} by ${req.session.username}`);
    const result = await runPSForReq(req, "Add-UserToGroup.ps1", {
        SamAccountName: userSam,
        GroupDN:        groupDN,
    });
    res.json(result);
});

// POST /api/groups/remove
// Body: { userSam, groupDN }
router.post("/remove", async (req, res) => {
    const { userSam, groupDN } = req.body || {};
    if (!userSam || !groupDN) {
        return res.status(400).json({ success: false, error: "userSam und groupDN erforderlich" });
    }
    logAction(`[ACTION] RemoveGroup: ${userSam} <- ${groupDN} by ${req.session.username}`);
    const result = await runPSForReq(req, "Remove-UserFromGroup.ps1", {
        SamAccountName: userSam,
        GroupDN:        groupDN,
    });
    res.json(result);
});

module.exports = router;
