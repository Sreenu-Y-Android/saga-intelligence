# Deprecated / unused files

Moved here during the AP.Blura.Saga → TG_Congress feature alignment.

Every file in this folder had **zero references** anywhere in `frontend/src` or
`backend/src` at the time it was moved — verified by grep, not assumed. They are
parked rather than deleted so the move is reversible; delete this folder once
you are satisfied nothing needs them.

| File | Why it is unused |
|---|---|
| `frontend/src/pages/PunjabMap.js` | Left over from the Punjab deployment. Not routed in `App.js`. |
| `frontend/src/pages/MasterCalendar.js` | Superseded — the master-calendar API is consumed by `Events`, this page was never routed. |
| `frontend/src/data/telanganaConstituencyMandals.js` | Superseded by the generated `data/tgMLAs.js` + `ls_to_ac.json`. |
| `frontend/public/punjab_ac.geojson` | Punjab boundary data, 466 KB, not fetched by any component. |
| `backend/src/config/punjabLocations.js` | Punjab location database, no importers. |

**NOT removed** (checked and found live):
`backend/src/config/specialAccess.js` — imported by `alertController` and
`grievanceController`.
