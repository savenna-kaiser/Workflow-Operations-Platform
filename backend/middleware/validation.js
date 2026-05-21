/**
 * validation.js – Zod-Schemas für alle eingehenden Requests
 */

const { z } = require("zod");

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({ field: e.path.join("."), message: e.message }));
      return res.status(400).json({ error: "Validierungsfehler", details: errors });
    }
    req.body = result.data;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({ field: e.path.join("."), message: e.message }));
      return res.status(400).json({ error: "Validierungsfehler", details: errors });
    }
    req.query = result.data;
    next();
  };
}

const samSchema = z
  .string()
  .min(1, "SAM-Account darf nicht leer sein")
  .max(20, "SAM-Account max. 20 Zeichen")
  .regex(/^[a-zA-Z0-9._-]+$/, "SAM-Account enthält ungültige Zeichen");

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(256),
});

const searchQuerySchema = z.object({
  q:  z.string().min(1, "Suchbegriff 'q' fehlt").max(100),
  ou: z.string().max(500).optional(),
});

const resetPasswordSchema = z.object({
  newPassword:   z.string().min(8, "Mind. 8 Zeichen").max(256)
                  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Benötigt Groß-, Kleinbuchstaben und Zahl"),
  mustChange:    z.boolean().optional().default(true),
  cannotChange:  z.boolean().optional().default(false),
});

const editUserSchema = z.object({
  GivenName:       z.string().max(64).optional(),
  Surname:         z.string().max(64).optional(),
  DisplayName:     z.string().max(256).optional(),
  Title:           z.string().max(128).optional(),
  Department:      z.string().max(128).optional(),
  Office:          z.string().max(128).optional(),
  OfficePhone:     z.string().max(32).optional(),
  MobilePhone:     z.string().max(32).optional(),
  Description:     z.string().max(1024).optional(),
  AccountExpires:  z.string().datetime({ offset: true }).nullable().optional(),
}).strict("Unbekannte Felder sind nicht erlaubt");

const DN_REGEX = /^(CN|OU|DC)=[^,]+(,(CN|OU|DC)=[^,]+)*$/i;

const addGroupSchema = z.object({
  groupDn: z.string().min(1).max(500).regex(DN_REGEX, "groupDn ist kein gültiger Distinguished Name"),
});

module.exports = {
  validate,
  validateQuery,
  samSchema,
  schemas: {
    login:         loginSchema,
    searchQuery:   searchQuerySchema,
    resetPassword: resetPasswordSchema,
    editUser:      editUserSchema,
    addGroup:      addGroupSchema,
  },
};