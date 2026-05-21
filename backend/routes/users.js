/**
 * users.js – User-Routen
 * Pfade: actions liegen in actions/user/
 */

const express               = require("express");
const { requireAuth }       = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/rbac");
const { validate, validateQuery, schemas, samSchema } = require("../middleware/validation");

const searchUsers     = require("../actions/user/searchUsers");
const enableUser      = require("../actions/user/enableUser");
const disableUser     = require("../actions/user/disableUser");
const unlockUser      = require("../actions/user/unlockUser");
const resetPassword   = require("../actions/user/resetPassword");
const editUser        = require("../actions/user/editUser");
const getUserGroups   = require("../actions/user/getUserGroups");
const addUserGroup    = require("../actions/user/addUserGroup");
const removeUserGroup = require("../actions/user/removeUserGroup");

const router = express.Router();
router.use(requireAuth);

function validateSam(req, res, next) {
  const result = samSchema.safeParse(req.params.sam);
  if (!result.success) return res.status(400).json({ error: `Ungültiger SAM-Account: ${req.params.sam}` });
  next();
}

router.get("/search",
  requirePermission("user:search"), validateQuery(schemas.searchQuery),
  async (req, res) => {
    try {
      const results = await searchUsers.execute({ query: req.query.q }, req.audit, req.audit.getCredential());
      res.json({ results });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

router.post("/:sam/enable",
  validateSam, requirePermission("user:enable"),
  async (req, res) => {
    try {
      await enableUser.execute({ sam: req.params.sam }, req.audit, req.audit.getCredential());
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

router.post("/:sam/disable",
  validateSam, requirePermission("user:disable"),
  async (req, res) => {
    try {
      await disableUser.execute({ sam: req.params.sam }, req.audit, req.audit.getCredential());
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

router.post("/:sam/unlock",
  validateSam, requirePermission("user:unlock"),
  async (req, res) => {
    try {
      await unlockUser.execute({ sam: req.params.sam }, req.audit, req.audit.getCredential());
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

router.post("/:sam/reset-password",
  validateSam, requirePermission("user:reset-password"), validate(schemas.resetPassword),
  async (req, res) => {
    try {
      await resetPassword.execute({ sam: req.params.sam, ...req.body }, req.audit, req.audit.getCredential());
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

router.put("/:sam/edit",
  validateSam, requirePermission("user:edit"), validate(schemas.editUser),
  async (req, res) => {
    try {
      await editUser.execute({ sam: req.params.sam, changes: req.body }, req.audit, req.audit.getCredential());
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

router.get("/:sam/groups",
  validateSam, requirePermission("user:read-groups"),
  async (req, res) => {
    try {
      const groups = await getUserGroups.execute({ sam: req.params.sam }, req.audit, req.audit.getCredential());
      res.json({ groups });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

router.post("/:sam/groups",
  validateSam, requirePermission("user:add-group"), validate(schemas.addGroup),
  async (req, res) => {
    try {
      await addUserGroup.execute({ sam: req.params.sam, groupDn: req.body.groupDn }, req.audit, req.audit.getCredential());
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

router.delete("/:sam/groups/:groupDn",
  validateSam, requirePermission("user:remove-group"),
  async (req, res) => {
    const groupDn = decodeURIComponent(req.params.groupDn);
    if (!schemas.addGroup.safeParse({ groupDn }).success) {
      return res.status(400).json({ error: "Ungültiger Distinguished Name" });
    }
    try {
      await removeUserGroup.execute({ sam: req.params.sam, groupDn }, req.audit, req.audit.getCredential());
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

module.exports = router;