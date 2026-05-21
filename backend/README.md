# AD-Manager Webapp

Node.js/Express-Umbau des PowerShell-basierten AD-Manager Tools.

## Architektur

```
ad-manager-web/
├── src/
│   ├── server.js                  # Express-Einstiegspunkt
│   ├── middleware/
│   │   ├── auditMiddleware.js     # Hängt requestId + audit-Kontext an jeden Request
│   │   └── authMiddleware.js      # Schützt Routen (Session-Check)
│   ├── services/
│   │   └── auditLog.js            # ★ ZENTRALES AUDIT-LOG
│   ├── routes/
│   │   ├── auth.js                # POST /api/auth/login|logout
│   │   ├── users.js               # /api/users/*
│   │   └── auditRoute.js          # GET /api/audit
│   └── actions/
│       ├── adLogin.js             # ← früher: Login-Block in Main.ps1
│       └── user/
│           ├── searchUsers.js     # ← früher: SearchUser()
│           ├── enableUser.js      # ← früher: BtnEnable
│           ├── disableUser.js     # ← früher: BtnDisable (+ Move)
│           ├── unlockUser.js      # ← früher: BtnUnlock
│           ├── resetPassword.js   # ← früher: BtnResetPwd
│           ├── editUser.js        # ← früher: Tab1.Feature_EditUser.ps1
│           ├── getUserGroups.js
│           ├── addUserGroup.js    # ← früher: BtnAddGroup
│           └── removeUserGroup.js # ← früher: BtnRemoveGroup
├── logs/
│   └── audit-YYYY-MM-DD.log       # Täglich rotierend, 30 Tage aufbewahrt
├── public/                        # Frontend (kommt später)
├── .env.example
└── package.json
```

## Audit-Log Konzept

Jede Action schreibt **ausschließlich** über `auditLog.js` ins Log.
Eine HTTP-Schicht (Route) weiß nichts vom Logging – das ist Sache der Action.

### Log-Eintrag (JSON, eine Zeile pro Aktion)
```json
{
  "timestamp": "2026-04-29T10:15:30.123+02:00",
  "level":     "info",
  "message":   "USER_DISABLE",
  "action":    "USER_DISABLE",
  "actor":     "a.mustermann",
  "target":    "j.schmidt",
  "targetType":"user",
  "result":    "success",
  "requestId": "b4a3f12e-...",
  "ip":        "192.168.1.42",
  "details":   { "movedTo": "OU=Users,OU=_Inactive,...", "dc": "epn1dc3..." }
}
```

### Log abfragen
```
GET /api/audit?limit=50&actor=a.mustermann&result=failure
```

## Setup

```bash
cp .env.example .env
# .env anpassen
npm install
npm run dev
```

## Nächste Schritte

1. **AD-Client** in `src/services/adClient.js` implementieren (ldapjs oder PowerShell-Bridge)
2. **Computer-Routen** analog zu users.js anlegen
3. **Citrix-Logoff** und **Out-of-Office** als Actions portieren
4. **Frontend** in `public/` aufbauen (React oder plain HTML)
5. **HTTPS** + Reverse-Proxy (nginx) für Produktion einrichten
